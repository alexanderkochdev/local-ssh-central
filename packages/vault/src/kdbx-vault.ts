import * as kdbxweb from 'kdbxweb';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { registerArgon2 } from './argon2.js';
import type { SecretFields, VaultEntry, VaultState } from './types.js';
import { VaultError } from './types.js';

const VAULT_NAME = 'SSH Central';
const MIN_MASTER_PASSWORD_LENGTH = 12;

/**
 * KeePass/KDBX-Vault fuer SSH Central.
 *
 * Sicherheits-Prinzipien:
 * - Nur diese Klasse beruehrt kdbxweb und damit Klartext-Secrets.
 * - Sie laeuft AUSSCHLIESSLICH im Main-Process (nie im sandboxed Renderer).
 * - Nach `lock()`/Auto-Lock werden Referenzen auf entschluesseltes Material verworfen.
 * - `db.credentials` haelt die Credentials fuer erneutes (Re-)Verschluesseln beim `save()`.
 */
export class KdbxVault {
  private db: kdbxweb.Kdbx | null = null;
  private _state: VaultState = 'no-vault';

  constructor(private readonly filePath: string) {}

  get state(): VaultState {
    return this._state;
  }

  get isUnlocked(): boolean {
    return this._state === 'unlocked' && this.db !== null;
  }

  async exists(): Promise<boolean> {
    try {
      await fs.access(this.filePath);
      return true;
    } catch {
      return false;
    }
  }

  /** Erstellt eine neue, leere Vault-Datei und entsperrt sie direkt. */
  async create(masterPassword: string): Promise<void> {
    if (this.isUnlocked) {
      throw new VaultError('Der Tresor ist bereits entsperrt.');
    }
    if (masterPassword.length < MIN_MASTER_PASSWORD_LENGTH) {
      throw new VaultError(
        `Das Master-Passwort muss mindestens ${MIN_MASTER_PASSWORD_LENGTH} Zeichen lang sein.`,
      );
    }
    await registerArgon2();

    const credentials = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString(masterPassword));
    const db = kdbxweb.Kdbx.create(credentials, VAULT_NAME);
    // Argon2id-KDF statt Standard-AES-KDF (wesentlich schwerer zu brute-forcen).
    db.setKdf(kdbxweb.Consts.KdfId.Argon2id);

    await this.persist(db);
    this.adopt(db, credentials);
  }

  /** Entsperrt eine bestehende Vault-Datei. Wirft VaultError bei falschem Passwort. */
  async unlock(masterPassword: string): Promise<void> {
    if (this.isUnlocked) {
      throw new VaultError('Der Tresor ist bereits entsperrt.');
    }
    await registerArgon2();
    const buffer = await this.readBytes();
    const credentials = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString(masterPassword));
    let db: kdbxweb.Kdbx;
    try {
      db = await kdbxweb.Kdbx.load(buffer, credentials);
    } catch {
      // Kein Detail-Leak: internen Fehler nicht an den Renderer weiterreichen.
      throw new VaultError('Das Master-Passwort ist falsch oder die Tresor-Datei ist beschädigt.');
    }
    this.adopt(db, credentials);
  }

  /** Verwirft entschluesseltes Material. Der Tresor ist danach wieder `locked` (bzw. `no-vault`). */
  lock(): void {
    this.dispose();
    void this.exists().then((hasFile) => {
      this._state = hasFile ? 'locked' : 'no-vault';
    });
  }

  async changeMasterPassword(currentPassword: string, newPassword: string): Promise<void> {
    if (!this.isUnlocked) {
      throw new VaultError('Der Tresor muss entsperrt sein.');
    }
    if (newPassword.length < MIN_MASTER_PASSWORD_LENGTH) {
      throw new VaultError(
        `Das neue Master-Passwort muss mindestens ${MIN_MASTER_PASSWORD_LENGTH} Zeichen lang sein.`,
      );
    }
    await registerArgon2();
    // Korrektheit des aktuellen Passworts pruefen, indem wir die Datei neu laden.
    const buffer = await this.readBytes();
    const check = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString(currentPassword));
    try {
      await kdbxweb.Kdbx.load(buffer, check);
    } catch {
      throw new VaultError('Das aktuelle Master-Passwort ist falsch.');
    }

    const db = this.requireDb();
    db.credentials = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString(newPassword));
    await this.persist(db);
  }

  listEntries(): VaultEntry[] {
    const db = this.requireDb();
    const entries: VaultEntry[] = [];
    for (const group of db.groups) {
      for (const entry of group.entries) {
        entries.push(this.toEntry(entry));
      }
    }
    return entries;
  }

  async createEntry(fields: SecretFields): Promise<string> {
    const db = this.requireDb();
    const group = db.getDefaultGroup();
    const entry = db.createEntry(group);
    this.applyFields(entry, fields);
    entry.times.update();
    await this.persist(db);
    return entry.uuid.id;
  }

  async updateEntry(id: string, fields: SecretFields): Promise<void> {
    const db = this.requireDb();
    const entry = this.findEntry(db, id);
    if (!entry) {
      throw new VaultError('Eintrag nicht gefunden.');
    }
    this.applyFields(entry, fields);
    entry.times.update();
    await this.persist(db);
  }

  async deleteEntry(id: string): Promise<void> {
    const db = this.requireDb();
    const entry = this.findEntry(db, id);
    if (!entry) {
      throw new VaultError('Eintrag nicht gefunden.');
    }
    db.remove(entry);
    await this.persist(db);
  }

  /** Liefert ein einzelnes Secret-Feld eines Eintrags (Klartext, nur im Main-Process). */
  getSecret(id: string, key: keyof SecretFields): string | undefined {
    const db = this.requireDb();
    const entry = this.findEntry(db, id);
    if (!entry) {
      return undefined;
    }
    const value = entry.fields.get(this.toKeePassFieldName(key));
    return value === undefined ? undefined : typeof value === 'string' ? value : value.getText();
  }

  // ------------------------------------------------------------------ helpers

  private async readBytes(): Promise<ArrayBuffer> {
    if (!(await this.exists())) {
      throw new VaultError('Keine Tresor-Datei gefunden.');
    }
    const data = await fs.readFile(this.filePath);
    // In ein eigenstaendiges ArrayBuffer-Segment kopieren (kdbxweb erwartet ArrayBuffer).
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  }

  private async persist(db: kdbxweb.Kdbx): Promise<void> {
    const data = await db.save();
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    // Sicher schreiben: erst temporaere Datei, dann atomar ersetzen.
    const tmpPath = `${this.filePath}.tmp`;
    await fs.writeFile(tmpPath, new Uint8Array(data));
    await fs.rename(tmpPath, this.filePath);
  }

  private adopt(db: kdbxweb.Kdbx, credentials: kdbxweb.KdbxCredentials): void {
    db.credentials = credentials;
    this.db = db;
    this._state = 'unlocked';
  }

  private dispose(): void {
    // Referenzen auf entschluesseltes Material verwerfen.
    this.db = null;
  }

  private requireDb(): kdbxweb.Kdbx {
    if (!this.db) {
      throw new VaultError('Der Tresor ist nicht entsperrt.');
    }
    return this.db;
  }

  private findEntry(db: kdbxweb.Kdbx, id: string): kdbxweb.KdbxEntry | undefined {
    for (const group of db.groups) {
      for (const entry of group.entries) {
        if (entry.uuid.equals(id)) {
          return entry;
        }
      }
    }
    return undefined;
  }

  private applyFields(entry: kdbxweb.KdbxEntry, fields: SecretFields): void {
    entry.fields.set('Title', kdbxweb.ProtectedValue.fromString(fields.title ?? 'SSH Host'));
    if (fields.userName !== undefined) {
      entry.fields.set('UserName', kdbxweb.ProtectedValue.fromString(fields.userName));
    }
    if (fields.password !== undefined) {
      entry.fields.set('Password', kdbxweb.ProtectedValue.fromString(fields.password));
    }
    if (fields.keyData !== undefined) {
      entry.fields.set('KeyData', kdbxweb.ProtectedValue.fromString(fields.keyData));
    }
    if (fields.notes !== undefined) {
      entry.fields.set('Notes', kdbxweb.ProtectedValue.fromString(fields.notes));
    }
  }

  private toEntry(entry: kdbxweb.KdbxEntry): VaultEntry {
    const read = (name: string): string | undefined => {
      const value = entry.fields.get(name);
      return value === undefined ? undefined : typeof value === 'string' ? value : value.getText();
    };
    return {
      id: entry.uuid.id,
      fields: {
        title: read('Title'),
        userName: read('UserName'),
        password: read('Password'),
        keyData: read('KeyData'),
        notes: read('Notes'),
      },
    };
  }

  private toKeePassFieldName(key: keyof SecretFields): string {
    switch (key) {
      case 'userName':
        return 'UserName';
      case 'password':
        return 'Password';
      case 'keyData':
        return 'KeyData';
      case 'title':
        return 'Title';
      case 'notes':
        return 'Notes';
      default:
        return 'Notes';
    }
  }
}
