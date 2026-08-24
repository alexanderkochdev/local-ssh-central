import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HostConnectionConfig, TerminalSession } from '@ssh-central/ssh-core';

// Mocke die ssh-core-Module (ConnectionManager/SessionManager), damit SshService nur die
// Orchestrierung testet - echte ssh2-Verbindungen sind bereits in ssh-core abgedeckt.
const { cmInstances, smInstances } = vi.hoisted(() => {
  const cmInstances: Array<{
    getFingerprint: ReturnType<typeof vi.fn>;
    acquire: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
    disposeAll: ReturnType<typeof vi.fn>;
  }> = [];
  const smInstances: Array<{
    open: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    resize: ReturnType<typeof vi.fn>;
    closeAll: ReturnType<typeof vi.fn>;
  }> = [];
  return { cmInstances, smInstances };
});

vi.mock('@ssh-central/ssh-core', () => {
  class MockConnectionManager {
    getFingerprint = vi.fn();
    acquire = vi.fn();
    release = vi.fn();
    disposeAll = vi.fn();
    constructor() {
      cmInstances.push(this);
    }
  }
  class MockSessionManager {
    open = vi.fn();
    close = vi.fn();
    resize = vi.fn();
    closeAll = vi.fn();
    constructor() {
      smInstances.push(this);
    }
  }
  return { ConnectionManager: MockConnectionManager, SessionManager: MockSessionManager };
});

import { SshService } from '../src/main/services/ssh-service.js';

function makeTerminal(id = 't1'): TerminalSession & {
  emitData(chunk: Buffer): void;
  emitClose(err?: Error): void;
} {
  const data: Array<(chunk: Buffer) => void> = [];
  const close: Array<(err?: Error) => void> = [];
  const error: Array<(err: Error) => void> = [];
  return {
    id,
    hostId: 'h1',
    write: vi.fn(),
    resize: vi.fn(),
    close: vi.fn(),
    onData: vi.fn((fn) => {
      data.push(fn);
      return () => {};
    }),
    onClose: vi.fn((fn) => {
      close.push(fn);
      return () => {};
    }),
    onError: vi.fn((fn) => {
      error.push(fn);
      return () => {};
    }),
    // test-Hook, um Listener auszuloesen:
    emitData: (chunk: Buffer) => data.forEach((fn) => fn(chunk)),
    emitClose: (err?: Error) => close.forEach((fn) => fn(err)),
  } as TerminalSession & { emitData(chunk: Buffer): void; emitClose(err?: Error): void };
}

const config: HostConnectionConfig = { host: 'example.com', port: 22, username: 'root' };

function makeService() {
  const getConfig = vi.fn().mockResolvedValue(config);
  const emit = vi.fn();
  const persist = vi.fn().mockResolvedValue(undefined);
  const service = new SshService(getConfig, emit, persist);
  return { service, getConfig, emit, persist, cm: cmInstances[0]!, sm: smInstances[0]! };
}

beforeEach(() => {
  cmInstances.length = 0;
  smInstances.length = 0;
});

describe('SshService', () => {
  it('connect oeffnet eine Session, persistiert den Fingerprint und emittet sessionCreated', async () => {
    const terminal = makeTerminal();
    const { service, emit, persist, cm, sm } = makeService();
    sm.open.mockResolvedValue(terminal);
    cm.getFingerprint.mockReturnValue('SHA256:abc');

    const info = await service.connect('h1');

    expect(sm.open).toHaveBeenCalledWith('h1', config, 80, 24, undefined);
    expect(persist).toHaveBeenCalledWith('h1', 'SHA256:abc');
    expect(info).toMatchObject({ id: 't1', hostId: 'h1', status: 'connected', title: 'root@example.com' });
    expect(emit).toHaveBeenCalledWith({ type: 'sessionCreated', session: info });
    expect(service.listSessions()).toHaveLength(1);
  });

  it('persistiert keinen Fingerprint, wenn keiner vorliegt', async () => {
    const { service, persist, cm, sm } = makeService();
    sm.open.mockResolvedValue(makeTerminal());
    cm.getFingerprint.mockReturnValue(undefined);

    await service.connect('h1');
    expect(persist).not.toHaveBeenCalled();
  });

  it('write/resize/disconnect delegieren an Session bzw. Terminal', async () => {
    const terminal = makeTerminal();
    const { service, sm } = makeService();
    sm.open.mockResolvedValue(terminal);
    const info = await service.connect('h1');

    service.write(info.id, 'ls\n');
    expect(terminal.write).toHaveBeenCalledWith('ls\n');

    service.resize(info.id, 120, 40);
    expect(sm.resize).toHaveBeenCalledWith(info.id, 120, 40);

    service.disconnect(info.id);
    expect(sm.close).toHaveBeenCalledWith(info.id);
  });

  it('onData streamt Daten an den Renderer', async () => {
    const terminal = makeTerminal();
    const { service, emit, sm } = makeService();
    sm.open.mockResolvedValue(terminal);
    const info = await service.connect('h1');

    terminal.emitData(Buffer.from('hello'));
    expect(emit).toHaveBeenCalledWith({ type: 'sessionData', sessionId: info.id, data: 'hello' });
  });

  it('onClose emittet sessionStatus + sessionClosed und raeumt auf', async () => {
    const terminal = makeTerminal();
    const { service, emit, sm } = makeService();
    sm.open.mockResolvedValue(terminal);
    const info = await service.connect('h1');

    terminal.emitClose();
    expect(emit).toHaveBeenCalledWith({ type: 'sessionStatus', sessionId: info.id, status: 'closed' });
    expect(emit).toHaveBeenCalledWith({ type: 'sessionClosed', sessionId: info.id });
    expect(service.listSessions()).toHaveLength(0);
  });

  it('onClose mit Fehler setzt Status error', async () => {
    const terminal = makeTerminal();
    const { service, emit, sm } = makeService();
    sm.open.mockResolvedValue(terminal);
    const info = await service.connect('h1');

    terminal.emitClose(new Error('kaputt'));
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sessionStatus', status: 'error', error: 'kaputt' }),
    );
    expect(info.status).toBe('error');
  });

  it('dispose schliesst alle Sessions', async () => {
    const { service, sm } = makeService();
    sm.open.mockResolvedValue(makeTerminal());
    await service.connect('h1');

    await service.dispose();
    expect(sm.closeAll).toHaveBeenCalled();
  });
});
