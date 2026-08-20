/** Host-Metadaten. Sensible Felder (Passwort/Key) liegen NIE hier, sondern im Vault. */

export type AuthMethod = 'password' | 'key';

export interface HostSecretRefs {
  /** Referenz auf Vault-Eintrag mit Benutzername/Passwort (optional). */
  passwordRef?: string;
  /** Referenz auf Vault-Eintrag mit Private Key (optional). */
  keyRef?: string;
  /** Referenz auf Vault-Eintrag mit Key-Passphrase (optional). */
  keyPassphraseRef?: string;
}

export interface Host {
  /** UUID (stabil, dient als Vault-Eintrags-ID). */
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authMethod: AuthMethod;
  /** Referenzen auf Geheimnisse im Vault - niemals Klartext. */
  secrets: HostSecretRefs;
  tags: string[];
  /** Gespeicherter Host-Key-Fingerprint (TOFU). */
  fingerprint?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface HostUpsertRequest {
  /** Ohne id = neu, mit id = update. */
  host: Omit<Host, 'id' | 'createdAt' | 'updatedAt' | 'secrets'> & { id?: string };
  /**
   * Transiente Secrets fuer diese Speicherung. Sie werden im Main-Process in den
   * (entsperrten) Vault geschrieben und NIE in hosts.json oder an den Renderer
   * zurueckgegeben. Fehlt ein Feld, bleibt die bestehende Referenz erhalten.
   */
  secrets?: HostSecretInput;
}

/** Vom User eingegebene Secrets - nur fuer die Dauer dieser Operation relevant. */
export interface HostSecretInput {
  /** Benutzername/Passwort (bei password-Auth). */
  userName?: string;
  password?: string;
  /** Private-Key-Inhalt (bei key-Auth). */
  privateKey?: string;
  keyPassphrase?: string;
  /** Referenz auf einen bereits im Vault existierenden Key-Eintrag (aus Keychain). */
  keyRef?: string;
  /** Referenz auf einen bereits existierenden Passwort-Eintrag. */
  passwordRef?: string;
}

export interface HostDeleteRequest {
  id: string;
}
