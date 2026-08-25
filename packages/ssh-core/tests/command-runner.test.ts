import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CommandRunner } from '../src/command-runner.js';
import type { ConnectionManager } from '../src/connection-manager.js';
import type { HostConnectionConfig } from '../src/types.js';

/** Event-basierter Stream-Fake (ClientChannel). */
interface MockStream {
  emit(name: string, ...args: unknown[]): void;
  end: ReturnType<typeof vi.fn>;
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
    end: vi.fn(),
    emit(name: string, ...args: unknown[]) {
      for (const fn of listeners.get(name) ?? []) {
        fn(...args);
      }
    },
  };
  return stream;
}

interface MockClient {
  exec: ReturnType<typeof vi.fn>;
}

function makeClient(stream: MockStream): MockClient {
  return {
    exec: vi.fn((_cmd: string, cb: (err?: Error, s?: MockStream) => void) => cb(undefined, stream)),
  };
}

function makeConnections(client: MockClient, acquireError?: Error): ConnectionManager {
  return {
    acquire: vi.fn(async () => {
      if (acquireError) {
        throw acquireError;
      }
      return client;
    }),
    release: vi.fn(),
  } as unknown as ConnectionManager;
}

function makeConfig(overrides: Partial<HostConnectionConfig> = {}): HostConnectionConfig {
  return { host: 'example.com', port: 22, username: 'root', ...overrides };
}

/** Gibt Mikrotasks ab, bis die Bedingung erfuellt ist (handler-Registrierung abwarten). */
async function flushUntil(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 50 && !predicate(); i += 1) {
    await Promise.resolve();
  }
}

describe('CommandRunner', () => {
  let stream: MockStream;
  let client: MockClient;

  beforeEach(() => {
    stream = makeStream();
    client = makeClient(stream);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sammelt stdout/stderr und meldet Erfolg bei Exit-Code 0', async () => {
    const connections = makeConnections(client);
    const runner = new CommandRunner(connections);

    const promise = runner.run('h1', makeConfig(), 'uptime', 1000);
    await flushUntil(() => client.exec.mock.calls.length > 0);
    stream.emit('data', Buffer.from(' 10:00  up 2 days\n'));
    stream.emit('close', 0);

    const result = await promise;
    expect(result).toEqual({ success: true, exitCode: 0, output: ' 10:00  up 2 days\n' });
    expect(connections.acquire).toHaveBeenCalledWith('h1', makeConfig());
    expect(connections.release).toHaveBeenCalledWith('h1');
  });

  it('meldet Fehlschlag bei Exit-Code ungleich 0', async () => {
    const connections = makeConnections(client);
    const runner = new CommandRunner(connections);

    const promise = runner.run('h1', makeConfig(), 'false', 1000);
    await flushUntil(() => client.exec.mock.calls.length > 0);
    stream.emit('data', Buffer.from('nope\n'));
    stream.emit('close', 1);

    const result = await promise;
    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.output).toBe('nope\n');
  });

  it('Stream-Fehler liefert eine Fehlermeldung und behaelt die bisherige Ausgabe', async () => {
    const connections = makeConnections(client);
    const runner = new CommandRunner(connections);

    const promise = runner.run('h1', makeConfig(), 'cmd', 1000);
    await flushUntil(() => client.exec.mock.calls.length > 0);
    stream.emit('data', Buffer.from('partial\n'));
    stream.emit('error', new Error('stream kaputt'));

    const result = await promise;
    expect(result.success).toBe(false);
    expect(result.error).toBe('stream kaputt');
    expect(result.output).toBe('partial\n');
  });

  it('exec-Fehler wird als Fehler zurueckgegeben und die Verbindung freigegeben', async () => {
    const failingClient = {
      exec: vi.fn((_cmd: string, cb: (err: Error) => void) => cb(new Error('exec fehlgeschlagen'))),
    };
    const connections = makeConnections(failingClient);
    const runner = new CommandRunner(connections);

    const result = await runner.run('h1', makeConfig(), 'cmd', 1000);
    expect(result.success).toBe(false);
    expect(result.error).toBe('exec fehlgeschlagen');
    expect(connections.release).toHaveBeenCalledWith('h1');
  });

  it('Verbindungsfehler wird abgefangen und der refcount balanciert', async () => {
    const connections = makeConnections(client, new Error('connection refused'));
    const runner = new CommandRunner(connections);

    const result = await runner.run('h1', makeConfig(), 'cmd', 1000);
    expect(result.success).toBe(false);
    expect(result.error).toBe('connection refused');
    expect(connections.release).toHaveBeenCalledWith('h1');
  });

  it('Timeout bricht das Kommando ab und beendet den Stream', async () => {
    vi.useFakeTimers();
    const connections = makeConnections(client);
    const runner = new CommandRunner(connections);

    const promise = runner.run('h1', makeConfig(), 'sleep 100', 500);
    await flushUntil(() => client.exec.mock.calls.length > 0);
    vi.advanceTimersByTime(500);
    const result = await promise;

    expect(result.success).toBe(false);
    expect(result.error).toContain('Timeout');
    expect(stream.end).toHaveBeenCalled();
    expect(connections.release).toHaveBeenCalledWith('h1');
  });
});
