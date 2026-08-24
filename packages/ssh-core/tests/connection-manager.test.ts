import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConnectionManager, verifyHostKey } from '../src/connection-manager.js';
import type { HostConnectionConfig } from '../src/types.js';

/**
 * ssh2-Mock: ersetzt das `Client`-Modul durch einen steuerbaren Fake, damit wir den
 * kompletten Connect-Flow (hostkeys/TOFU, ready/error, refcounting) ohne echte
 * Netzwerkverbindung testen koennen. Instanzen werden in `MockClient.all` gesammelt.
 */
const { MockClient } = vi.hoisted(() => {
  class MockClient {
    static all: MockClient[] = [];
    listeners = new Map<string, Array<(...args: unknown[]) => void>>();
    connectCalls: unknown[][] = [];
    ended = false;
    execCb: ((err: Error | undefined, stream?: unknown) => void) | undefined;
    shellCb: ((err: Error | undefined, stream?: unknown) => void) | undefined;

    constructor() {
      MockClient.all.push(this);
    }

    on(name: string, fn: (...args: unknown[]) => void): this {
      const list = this.listeners.get(name) ?? [];
      list.push(fn);
      this.listeners.set(name, list);
      return this;
    }

    once(name: string, fn: (...args: unknown[]) => void): this {
      return this.on(name, fn);
    }

    emit(name: string, ...args: unknown[]): void {
      for (const fn of this.listeners.get(name) ?? []) {
        fn(...args);
      }
    }

    connect(config: unknown): void {
      this.connectCalls.push([config]);
    }

    end(): void {
      this.ended = true;
      this.emit('close');
    }

    exec(command: string, opts: unknown, cb: (err: Error | undefined, stream?: unknown) => void): void {
      this.execCb = cb;
    }

    shell(opts: unknown, cb: (err: Error | undefined, stream?: unknown) => void): void {
      this.shellCb = cb;
    }
  }
  return { MockClient };
});

vi.mock('ssh2', () => ({ Client: MockClient }));

/** Wartet, bis anstehende Microtasks (await-Kontinuaetionen) abgearbeitet sind. */
async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

/** Greift auf die n-te erzeugte Mock-Verbindung zu (strict-safe). */
function mockClient(index = 0): InstanceType<typeof MockClient> {
  const instance = MockClient.all[index];
  if (!instance) {
    throw new Error(`MockClient[${index}] nicht erstellt`);
  }
  return instance;
}

function makeConfig(overrides: Partial<HostConnectionConfig> = {}): HostConnectionConfig {
  return { host: 'example.com', port: 22, username: 'root', ...overrides };
}

function fakeKey(): { getPublicSSH(): Buffer } {
  return { getPublicSSH: () => Buffer.from('public-key-bytes') };
}

describe('verifyHostKey (TOFU)', () => {
  it('laesst Verbindungen ohne gespeicherten Fingerprint zu (erster Connect)', () => {
    expect(() => verifyHostKey(undefined, 'SHA256:abc')).not.toThrow();
    expect(() => verifyHostKey('SHA256:abc', undefined)).not.toThrow();
    expect(() => verifyHostKey(undefined, undefined)).not.toThrow();
  });

  it('laesst Verbindungen mit uebereinstimmendem Fingerprint zu', () => {
    expect(() => verifyHostKey('SHA256:abc', 'SHA256:abc')).not.toThrow();
  });

  it('bricht bei abweichendem Fingerprint ab (Man-in-the-Middle)', () => {
    expect(() => verifyHostKey('SHA256:erwartet', 'SHA256:abweichend')).toThrow(
      /Host-Key geändert|Man-in-the-Middle/,
    );
  });
});

describe('ConnectionManager (ssh2-Mock)', () => {
  beforeEach(() => {
    MockClient.all.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('acquire baut eine Verbindung auf und liefert den Client', async () => {
    const manager = new ConnectionManager();
    const promise = manager.acquire('h1', makeConfig());

    const client = mockClient();
    client.emit('hostkeys', [fakeKey()]);
    await flushMicrotasks();
    client.emit('ready');

    await expect(promise).resolves.toBe(client);
    expect(client.connectCalls).toHaveLength(1);
    expect(manager.getFingerprint('h1')).toMatch(/^SHA256:/);
  });

  it('multiplexed acquire liefert dieselbe Verbindung und verbindet nur einmal', async () => {
    const manager = new ConnectionManager();
    const first = manager.acquire('h1', makeConfig());
    const client = mockClient();
    client.emit('hostkeys', [fakeKey()]);
    await flushMicrotasks();
    client.emit('ready');
    await first;

    const second = manager.acquire('h1', makeConfig());
    await expect(second).resolves.toBe(client);
    expect(client.connectCalls).toHaveLength(1);
  });

  it('parallele acquire-Aufrufe deduplizieren den Verbindungsaufbau (pending)', async () => {
    const manager = new ConnectionManager();
    const a = manager.acquire('h1', makeConfig());
    const b = manager.acquire('h1', makeConfig());
    expect(MockClient.all).toHaveLength(1); // nur EINE Verbindung angestossen

    const client = mockClient();
    client.emit('hostkeys', [fakeKey()]);
    await flushMicrotasks();
    client.emit('ready');

    await expect(a).resolves.toBe(client);
    await expect(b).resolves.toBe(client);
    expect(client.connectCalls).toHaveLength(1);
  });

  it('release bei Refcount 1 schliesst die Verbindung (end)', async () => {
    const manager = new ConnectionManager();
    const promise = manager.acquire('h1', makeConfig());
    const client = mockClient();
    client.emit('hostkeys', [fakeKey()]);
    await flushMicrotasks();
    client.emit('ready');
    await promise;

    manager.release('h1');
    expect(client.ended).toBe(true);
    expect(manager.getFingerprint('h1')).toBeUndefined();
  });

  it('release bei Refcount > 1 haelt die Verbindung, bis die letzte Referenz freigegeben ist', async () => {
    const manager = new ConnectionManager();
    const promise = manager.acquire('h1', makeConfig());
    const client = mockClient();
    client.emit('hostkeys', [fakeKey()]);
    await flushMicrotasks();
    client.emit('ready');
    await promise;
    await manager.acquire('h1', makeConfig()); // Refcount 2

    manager.release('h1');
    expect(client.ended).toBe(false); // noch eine Referenz offen

    manager.release('h1');
    expect(client.ended).toBe(true);
  });

  it('bricht bei abweichendem TOFU-Fingerprint ab und schliesst den Client', async () => {
    const manager = new ConnectionManager();
    const promise = manager.acquire('h1', makeConfig({ expectedFingerprint: 'SHA256:erwartet' }));
    // Assertion frueh attachieren, damit die abgelehnte Promise als behandelt gilt.
    const assertion = expect(promise).rejects.toThrow(/Host-Key geändert|Man-in-the-Middle/);

    const client = mockClient();
    client.emit('hostkeys', [fakeKey()]); // liefert abweichenden Fingerprint
    await flushMicrotasks();

    await assertion;
    expect(client.ended).toBe(true);
  });

  it('bricht bei Verbindungsfehler (error-Event) ab', async () => {
    const manager = new ConnectionManager();
    const promise = manager.acquire('h1', makeConfig());
    const assertion = expect(promise).rejects.toThrow('connection refused');

    const client = mockClient();
    client.emit('hostkeys', [fakeKey()]);
    await flushMicrotasks();
    client.emit('error', new Error('connection refused'));

    await assertion;
  });

  it('loest den Fingerprint nach Timeout ohne hostkeys zu undefined auf', async () => {
    vi.useFakeTimers();
    const manager = new ConnectionManager();
    const promise = manager.acquire('h1', makeConfig()); // kein erwarteter Fingerprint

    const client = mockClient();
    vi.advanceTimersByTime(15_000); // Timeout feuert -> fingerprint undefined
    await Promise.resolve();
    client.emit('ready');

    await expect(promise).resolves.toBe(client); // TOFU ohne Vergleich -> ok
    vi.useRealTimers();
  });

  it('closeConnection schliesst die Verbindung und entfernt den Zustand', async () => {
    const manager = new ConnectionManager();
    const promise = manager.acquire('h1', makeConfig());
    const client = mockClient();
    client.emit('hostkeys', [fakeKey()]);
    await flushMicrotasks();
    client.emit('ready');
    await promise;

    manager.closeConnection('h1');
    expect(client.ended).toBe(true);
    expect(manager.getFingerprint('h1')).toBeUndefined();
  });

  it('disposeAll schliesst alle Verbindungen und leert den Zustand', async () => {
    const manager = new ConnectionManager();
    const p1 = manager.acquire('h1', makeConfig());
    mockClient().emit('hostkeys', [fakeKey()]);
    await flushMicrotasks();
    mockClient().emit('ready');
    await p1;

    const p2 = manager.acquire('h2', makeConfig());
    mockClient(1).emit('hostkeys', [fakeKey()]);
    await flushMicrotasks();
    mockClient(1).emit('ready');
    await p2;

    await manager.disposeAll();
    expect(mockClient().ended).toBe(true);
    expect(mockClient(1).ended).toBe(true);
    expect(manager.getFingerprint('h1')).toBeUndefined();
    expect(manager.getFingerprint('h2')).toBeUndefined();
  });
});
