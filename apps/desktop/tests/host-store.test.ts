import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HostStore } from '../src/main/services/host-store.js';
import type { ResolvedHostInput } from '../src/main/services/host-store.js';

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'host-store-'));
  file = join(dir, 'hosts.json');
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function input(overrides: Partial<ResolvedHostInput> = {}): ResolvedHostInput {
  return {
    name: 'Web',
    host: '1.2.3.4',
    port: 22,
    username: 'root',
    authMethod: 'password',
    tags: ['prod'],
    secrets: {},
    ...overrides,
  };
}

describe('HostStore', () => {
  it('erstellt und liest einen Host', async () => {
    const store = new HostStore(file);
    await store.load();
    const host = await store.upsert(input());
    expect(host.id).toBeTruthy();
    expect(host.createdAt).toBeGreaterThan(0);
    expect(store.getById(host.id)?.name).toBe('Web');
    expect(store.list()).toHaveLength(1);
  });

  it('aktualisiert einen Host (id und createdAt bleiben stabil)', async () => {
    const store = new HostStore(file);
    await store.load();
    const created = await store.upsert(input({ name: 'Alt' }));
    await new Promise((r) => setTimeout(r, 5));
    const updated = await store.upsert(input({ id: created.id, name: 'Neu' }));

    expect(updated.id).toBe(created.id);
    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.name).toBe('Neu');
    expect(updated.updatedAt).toBeGreaterThanOrEqual(created.updatedAt);
    expect(store.list()).toHaveLength(1);
  });

  it('entfernt einen Host', async () => {
    const store = new HostStore(file);
    await store.load();
    const host = await store.upsert(input());
    await store.remove({ id: host.id });
    expect(store.list()).toHaveLength(0);
    expect(store.getById(host.id)).toBeUndefined();
  });

  it('persistiert auf die Platte und laedt sie in einer neuen Instanz', async () => {
    const store = new HostStore(file);
    await store.load();
    const host = await store.upsert(input({ tags: ['a', 'b'] }));

    const reloaded = new HostStore(file);
    await reloaded.load();
    expect(reloaded.getById(host.id)?.name).toBe('Web');
    expect(reloaded.getById(host.id)?.tags).toEqual(['a', 'b']);
  });

  it('setFingerprint speichert nur beim ersten Mal (TOFU)', async () => {
    const store = new HostStore(file);
    await store.load();
    const host = await store.upsert(input());

    await store.setFingerprint(host.id, 'SHA256:first');
    expect(store.getById(host.id)?.fingerprint).toBe('SHA256:first');

    await store.setFingerprint(host.id, 'SHA256:second');
    expect(store.getById(host.id)?.fingerprint).toBe('SHA256:first');
  });

  it('setFingerprint fuer unbekannte id ist ein No-Op', async () => {
    const store = new HostStore(file);
    await store.load();
    await expect(store.setFingerprint('gibt-es-nicht', 'SHA256:x')).resolves.toBeUndefined();
  });

  it('persistLastSftpDir aktualisiert den letzten Standort (nur bei Aenderung)', async () => {
    const store = new HostStore(file);
    await store.load();
    const host = await store.upsert(input());

    await store.persistLastSftpDir(host.id, '/var/www');
    expect(store.getById(host.id)?.lastSftpDir).toBe('/var/www');

    // Unveraendert -> kein Schreibvorgang (persist erneut aufrufen ist idempotent).
    await store.persistLastSftpDir(host.id, '/var/www');
    expect(store.getById(host.id)?.lastSftpDir).toBe('/var/www');

    // Persistiert auf die Platte.
    const reloaded = new HostStore(file);
    await reloaded.load();
    expect(reloaded.getById(host.id)?.lastSftpDir).toBe('/var/www');
  });

  it('persistLastSftpDir fuer unbekannte id oder leeren Pfad ist ein No-Op', async () => {
    const store = new HostStore(file);
    await store.load();
    await expect(store.persistLastSftpDir('gibt-es-nicht', '/x')).resolves.toBeUndefined();

    const host = await store.upsert(input());
    await store.persistLastSftpDir(host.id, '');
    expect(store.getById(host.id)?.lastSftpDir).toBeUndefined();
  });
});
