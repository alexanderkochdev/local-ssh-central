import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConnectionManager, fingerprintOf, verifyHostKey } from '../src/connection-manager.js';
import type { HostConnectionConfig } from '../src/types.js';

/**
 * ssh2-Mock: ersetzt das `Client`-Modul durch einen steuerbaren Fake, damit wir den
 * kompletten Connect-Flow (hostVerifier/TOFU, ready/error, refcounting) ohne echte
 * Netzwerkverbindung testen koennen. `connect()` ruft - wie das echte ssh2 - den
 * `hostVerifier` waehrend des Handshakes auf und emittiert bei Ablehnung ein `error`.
 * Instanzen werden in `MockClient.all` gesammelt.
 */
const { MockClient, HOST_KEY } = vi.hoisted(() => {
  const HOST_KEY = Buffer.from('public-key-bytes');

  class MockClient {
    static all: MockClient[] = [];
    listeners = new Map<string, Array<(...args: unknown[]) => void>>();
    connectCalls: unknown[][] = [];
    ended = false;

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
      const verifier = (config as { hostVerifier?: (key: Buffer) => boolean }).hostVerifier;
      if (verifier && verifier(HOST_KEY) === false) {
        // ssh2 bricht bei abgelehntem Host-Key den Handshake mit einem error ab.
        this.emit('error', new Error('Host verification failed'));
      }
    }

    end(): void {
      this.ended = true;
      this.emit('close');
    }
  }
  return { MockClient, HOST_KEY };
});

vi.mock('ssh2', () => ({ Client: MockClient }));

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
    expect(() => verifyHostKey('SHA256:erwartet', 'SHA256:abweichend')).toThrow(/Host-Key geändert|Man-in-the-Middle/);
  });
});

describe('fingerprintOf', () => {
  it('bildet einen stabilen OpenSSH-SHA256-Fingerprint des Key-Blobs', () => {
    const fingerprint = fingerprintOf(Buffer.from('public-key-bytes'));
    expect(fingerprint.startsWith('SHA256:')).toBe(true);
    expect(fingerprint).toBe(fingerprintOf(Buffer.from('public-key-bytes')));
    expect(fingerprint).not.toBe(fingerprintOf(Buffer.from('andere-bytes')));
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
    client.emit('ready');

    await expect(promise).resolves.toBe(client);
    expect(client.connectCalls).toHaveLength(1);
    expect(manager.getFingerprint('h1')).toBe(fingerprintOf(HOST_KEY));
  });

  it('ruft client.connect SOFORT auf (kein Warten auf ein hostkeys-Event)', async () => {
    // Regression: Der Fingerprint wurde frueher VOR dem connect() aus dem `hostkeys`-Event
    // gelesen. Das Event kommt aber erst nach der Authentifizierung -> jeder
    // Verbindungsaufbau lief zwangsweise 15 s in den Timeout.
    vi.useFakeTimers();
    const manager = new ConnectionManager();
    const promise = manager.acquire('h1', makeConfig());

    const client = mockClient();
    expect(client.connectCalls).toHaveLength(1); // ohne einen einzigen Timer-Tick
    expect(vi.getTimerCount()).toBe(0); // kein 15-s-Timeout mehr im Spiel

    client.emit('ready');
    await expect(promise).resolves.toBe(client);
  });

  it('multiplexed acquire liefert dieselbe Verbindung und verbindet nur einmal', async () => {
    const manager = new ConnectionManager();
    const first = manager.acquire('h1', makeConfig());
    const client = mockClient();
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
    client.emit('ready');

    await expect(a).resolves.toBe(client);
    await expect(b).resolves.toBe(client);
    expect(client.connectCalls).toHaveLength(1);
  });

  it('release bei Refcount 1 schliesst die Verbindung (end)', async () => {
    const manager = new ConnectionManager();
    const promise = manager.acquire('h1', makeConfig());
    const client = mockClient();
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
    client.emit('ready');
    await promise;
    await manager.acquire('h1', makeConfig()); // Refcount 2

    manager.release('h1');
    expect(client.ended).toBe(false); // noch eine Referenz offen

    manager.release('h1');
    expect(client.ended).toBe(true);
  });

  it('lehnt einen abweichenden Host-Key im hostVerifier ab (vor der Authentifizierung)', async () => {
    const manager = new ConnectionManager();
    const promise = manager.acquire('h1', makeConfig({ expectedFingerprint: 'SHA256:erwartet' }));

    await expect(promise).rejects.toThrow(/Host-Key geändert|Man-in-the-Middle/);
    const client = mockClient();
    expect(client.ended).toBe(true);
    // Der Verifier lehnt ab, BEVOR ssh2 Credentials sendet.
    const config = client.connectCalls[0]?.[0] as { hostVerifier?: unknown };
    expect(typeof config.hostVerifier).toBe('function');
  });

  it('akzeptiert den passenden gespeicherten Fingerprint', async () => {
    const manager = new ConnectionManager();
    const promise = manager.acquire('h1', makeConfig({ expectedFingerprint: fingerprintOf(HOST_KEY) }));
    mockClient().emit('ready');
    await expect(promise).resolves.toBe(mockClient());
  });

  it('bricht bei Verbindungsfehler (error-Event) ab', async () => {
    const manager = new ConnectionManager();
    const promise = manager.acquire('h1', makeConfig());
    const assertion = expect(promise).rejects.toThrow('connection refused');

    mockClient().emit('error', new Error('connection refused'));

    await assertion;
  });

  it('closeConnection schliesst die Verbindung und entfernt den Zustand', async () => {
    const manager = new ConnectionManager();
    const promise = manager.acquire('h1', makeConfig());
    const client = mockClient();
    client.emit('ready');
    await promise;

    manager.closeConnection('h1');
    expect(client.ended).toBe(true);
    expect(manager.getFingerprint('h1')).toBeUndefined();
  });

  it('disposeAll schliesst alle Verbindungen und leert den Zustand', async () => {
    const manager = new ConnectionManager();
    const p1 = manager.acquire('h1', makeConfig());
    mockClient().emit('ready');
    await p1;

    const p2 = manager.acquire('h2', makeConfig());
    mockClient(1).emit('ready');
    await p2;

    await manager.disposeAll();
    expect(mockClient().ended).toBe(true);
    expect(mockClient(1).ended).toBe(true);
    expect(manager.getFingerprint('h1')).toBeUndefined();
    expect(manager.getFingerprint('h2')).toBeUndefined();
  });
});
