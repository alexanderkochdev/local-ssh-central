import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { Host, HostDeleteRequest } from '@ssh-central/ipc-contracts';

/** Vom IPC-Handler aufgelöster Host (mit Vault-Referenzen). */
export type ResolvedHostInput = Omit<Host, 'id' | 'createdAt' | 'updatedAt'> & { id?: string };

/**
 * Persistiert Host-Metadaten (KEINE Secrets - die liegen im Vault) als JSON in userData.
 * Schreiben ist atomar (tmp + rename), um Korruption zu vermeiden.
 */
export class HostStore {
  private hosts: Host[] = [];

  constructor(private readonly filePath: string) {}

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      this.hosts = JSON.parse(raw) as Host[];
    } catch {
      this.hosts = [];
    }
  }

  list(): Host[] {
    return this.hosts;
  }

  getById(id: string): Host | undefined {
    return this.hosts.find((host) => host.id === id);
  }

  async upsert(input: ResolvedHostInput): Promise<Host> {
    const now = Date.now();
    if (input.id) {
      const index = this.hosts.findIndex((host) => host.id === input.id);
      if (index < 0) {
        throw new Error('Host nicht gefunden.');
      }
      const existing = this.hosts[index]!;
      const updated: Host = {
        ...existing,
        ...input,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: now,
      };
      this.hosts[index] = updated;
      await this.persist();
      return updated;
    }

    const created: Host = {
      ...input,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.hosts.push(created);
    await this.persist();
    return created;
  }

  async remove(request: HostDeleteRequest): Promise<void> {
    this.hosts = this.hosts.filter((host) => host.id !== request.id);
    await this.persist();
  }

  /** Speichert den TOFU-Host-Key-Fingerprint - nur beim ersten Connect (Trust-on-first-use). */
  async setFingerprint(id: string, fingerprint: string): Promise<void> {
    const host = this.hosts.find((h) => h.id === id);
    if (!host || host.fingerprint) {
      return;
    }
    host.fingerprint = fingerprint;
    await this.persist();
  }

  /** Persistiert das zuletzt im SFTP-Fenster angezeigte Verzeichnis (fuer "letzter Standort"). */
  async persistLastSftpDir(id: string, dir: string): Promise<void> {
    const host = this.hosts.find((h) => h.id === id);
    if (!host || host.lastSftpDir === dir || !dir) {
      return;
    }
    host.lastSftpDir = dir;
    await this.persist();
  }

  private async persist(): Promise<void> {
    const tmp = `${this.filePath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(this.hosts, null, 2), 'utf8');
    await fs.rename(tmp, this.filePath);
  }
}
