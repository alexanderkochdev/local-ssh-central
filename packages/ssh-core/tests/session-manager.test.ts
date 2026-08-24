import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionManager } from '../src/session-manager.js';
import type { ConnectionManager } from '../src/connection-manager.js';
import type { HostConnectionConfig } from '../src/types.js';

/** Event-basierter Stream-Fake (ClientChannel). */
interface MockStream {
  emit(name: string, ...args: unknown[]): void;
  write: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  setWindow: ReturnType<typeof vi.fn>;
}

function makeStream(): MockStream {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  const stream = {
    on(name: string, fn: (...args: unknown[]) => void) {
      const list = listeners.get(name) ?? [];
      list.push(fn);
      listeners.set(name, list);
      return stream;
    },
    write: vi.fn(),
    end: vi.fn(),
    setWindow: vi.fn(),
    emit(name: string, ...args: unknown[]) {
      for (const fn of listeners.get(name) ?? []) {
        fn(...args);
      }
    },
  };
  return stream;
}

function makeClient(stream: MockStream) {
  return {
    shell: vi.fn((_opts: unknown, cb: (err?: Error, stream?: MockStream) => void) => cb(undefined, stream)),
    exec: vi.fn((_cmd: string, _opts: unknown, cb: (err?: Error, stream?: MockStream) => void) => cb(undefined, stream)),
  };
}

function makeConnections(stream: MockStream): ConnectionManager {
  const client = makeClient(stream);
  return {
    acquire: vi.fn(async () => client),
    release: vi.fn(),
  } as unknown as ConnectionManager;
}

function makeConfig(overrides: Partial<HostConnectionConfig> = {}): HostConnectionConfig {
  return { host: 'example.com', port: 22, username: 'root', ...overrides };
}

describe('SessionManager', () => {
  let stream: MockStream;

  beforeEach(() => {
    stream = makeStream();
  });

  it('open ohne command oeffnet eine interaktive Shell und liefert eine Session', async () => {
    const connections = makeConnections(stream);
    const manager = new SessionManager(connections);

    const session = await manager.open('h1', makeConfig(), 80, 24);

    expect(connections.acquire).toHaveBeenCalledWith('h1', makeConfig());
    expect(session.id).toBeTruthy();
    expect(session.hostId).toBe('h1');
    expect(manager.listSessionIds()).toEqual([session.id]);
  });

  it('open mit command nutzt exec statt shell', async () => {
    const connections = makeConnections(stream);
    const manager = new SessionManager(connections);

    const session = await manager.open('h1', makeConfig(), 80, 24, 'htop');

    expect(connections.acquire).toHaveBeenCalledTimes(1);
    expect(session.hostId).toBe('h1');
    expect(manager.listSessionIds()).toContain(session.id);
  });

  it('write/resize/close delegieren an den Stream', async () => {
    const connections = makeConnections(stream);
    const manager = new SessionManager(connections);
    const session = await manager.open('h1', makeConfig(), 80, 24);

    session.write('ls\n');
    expect(stream.write).toHaveBeenCalledWith('ls\n');

    session.resize(120, 40);
    expect(stream.setWindow).toHaveBeenCalledWith(40, 120, 0, 0);

    session.close();
    expect(stream.end).toHaveBeenCalled();
    expect(manager.listSessionIds()).not.toContain(session.id);
    expect(connections.release).toHaveBeenCalledWith('h1');
  });

  it('onData empfängt Stream-Daten und kann abgemeldet werden', async () => {
    const manager = new SessionManager(makeConnections(stream));
    const session = await manager.open('h1', makeConfig(), 80, 24);

    const listener = vi.fn();
    const unsubscribe = session.onData(listener);
    stream.emit('data', Buffer.from('hello'));
    expect(listener).toHaveBeenCalledWith(Buffer.from('hello'));

    unsubscribe();
    stream.emit('data', Buffer.from('again'));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('onClose und onError werden bei entsprechenden Stream-Events ausgeloest', async () => {
    const manager = new SessionManager(makeConnections(stream));
    const session = await manager.open('h1', makeConfig(), 80, 24);

    const closeListener = vi.fn();
    const errorListener = vi.fn();
    session.onClose(closeListener);
    session.onError(errorListener);

    stream.emit('error', new Error('boom'));
    expect(errorListener).toHaveBeenCalledWith(expect.any(Error));

    stream.emit('close', 0, '');
    expect(closeListener).toHaveBeenCalled();
  });

  it('Stream-close raeumt die Session auf und gibt die Verbindung frei', async () => {
    const connections = makeConnections(stream);
    const manager = new SessionManager(connections);
    const session = await manager.open('h1', makeConfig(), 80, 24);

    stream.emit('close', 0, '');
    expect(manager.listSessionIds()).not.toContain(session.id);
    expect(connections.release).toHaveBeenCalledWith('h1');
  });

  it('open verwirft, wenn der Verbindungsaufbau fehlschlaegt', async () => {
    const client = {
      shell: vi.fn((_opts: unknown, cb: (err: Error) => void) => cb(new Error('pty failed'))),
      exec: vi.fn((_c: string, _o: unknown, cb: (err: Error) => void) => cb(new Error('pty failed'))),
    };
    const connections = { acquire: vi.fn(async () => client), release: vi.fn() } as unknown as ConnectionManager;
    const manager = new SessionManager(connections);

    await expect(manager.open('h1', makeConfig(), 80, 24)).rejects.toThrow('pty failed');
    expect(manager.listSessionIds()).toHaveLength(0);
  });

  it('close bei unbekannter ID ist ein No-Op', async () => {
    const connections = makeConnections(stream);
    const manager = new SessionManager(connections);
    await manager.open('h1', makeConfig(), 80, 24);

    manager.close('does-not-exist');
    expect(connections.release).not.toHaveBeenCalled();
    expect(stream.end).not.toHaveBeenCalled();
  });

  it('closeAll schliesst alle Sessions', async () => {
    const manager = new SessionManager(makeConnections(stream));
    const first = await manager.open('h1', makeConfig(), 80, 24);
    const second = await manager.open('h2', makeConfig(), 80, 24);
    expect(manager.listSessionIds()).toHaveLength(2);

    await manager.closeAll();
    expect(manager.listSessionIds()).toHaveLength(0);
    expect(stream.end).toHaveBeenCalled();
  });
});
