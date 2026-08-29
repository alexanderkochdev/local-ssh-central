import { describe, it, expect, vi, afterEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import type { TransferInfo } from '@ssh-central/ipc-contracts';
import notificationsReducer, {
  addNotification,
  removeNotification,
  handleSftpTransfer,
  setSftpBatchTotal,
  formatSpeed,
  cancelSftpTransfers,
} from '../src/store/notificationsSlice.js';
import { upsertTransfer } from '../src/features/sftp/types.js';

function makeTransfer(overrides: Partial<TransferInfo> = {}): TransferInfo {
  return {
    id: 't1',
    direction: 'upload',
    localPath: 'C:\\file.txt',
    remotePath: '/home/user/file.txt',
    totalBytes: 1000,
    transferredBytes: 0,
    status: 'queued',
    ...overrides,
  };
}

function makeStore() {
  return configureStore({ reducer: { notifications: notificationsReducer } });
}

describe('notifications slice: Additionslimit', () => {
  it('haelt maximal 5 Notifications und entfernt die aelteste', () => {
    let state = notificationsReducer(undefined, { type: '@@INIT' });
    for (const id of ['1', '2', '3', '4', '5', '6']) {
      state = notificationsReducer(state, addNotification({ id, type: 'info', title: id }));
    }
    expect(state.items).toHaveLength(5);
    expect(state.items.map((n) => n.id)).toEqual(['2', '3', '4', '5', '6']);
  });

  it('ersetzt eine Notification mit gleicher ID statt zu duplizieren', () => {
    let state = notificationsReducer(undefined, { type: '@@INIT' });
    state = notificationsReducer(state, addNotification({ id: 'a', type: 'info', title: 'old' }));
    state = notificationsReducer(state, addNotification({ id: 'a', type: 'success', title: 'new' }));
    expect(state.items).toHaveLength(1);
    expect(state.items[0]?.title).toBe('new');
  });

  it('removeNotification entfernt genau die angegebene ID', () => {
    let state = notificationsReducer(undefined, { type: '@@INIT' });
    state = notificationsReducer(state, addNotification({ id: 'a', type: 'info', title: 'a' }));
    state = notificationsReducer(state, addNotification({ id: 'b', type: 'info', title: 'b' }));
    state = notificationsReducer(state, removeNotification('a'));
    expect(state.items.map((n) => n.id)).toEqual(['b']);
  });
});

describe('handleSftpTransfer: ein aggregierter Toast fuer das gesamte Batch', () => {
  it('erzeugt EINEN Fortschritts-Toast mit Dateizahl + aggregiertem Fortschritt', async () => {
    const store = makeStore();
    await store.dispatch(
      handleSftpTransfer(makeTransfer({ id: 'a', status: 'running', totalBytes: 300, transferredBytes: 150 })),
    );
    await store.dispatch(
      handleSftpTransfer(makeTransfer({ id: 'b', status: 'running', totalBytes: 200, transferredBytes: 100 })),
    );

    const items = store.getState().notifications.items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 'sftp-aggregate', type: 'progress', progress: 50 });
    expect(items[0]?.title).toContain('Upload');
    expect(items[0]?.title).toContain('2');
    expect(items[0]?.message).toContain('0/2 fertig');
  });

  it('zeigt done/gesamt und steigenden Fortschritt, wenn Dateien fertig werden', async () => {
    const store = makeStore();
    await store.dispatch(handleSftpTransfer(makeTransfer({ id: 'a', status: 'running', totalBytes: 10, transferredBytes: 10 })));
    await store.dispatch(handleSftpTransfer(makeTransfer({ id: 'b', status: 'running', totalBytes: 10, transferredBytes: 0 })));

    let items = store.getState().notifications.items;
    expect(items).toHaveLength(1);
    expect(items[0]?.message).toContain('0/2 fertig');

    // a ist fertig -> doneFiles steigt, active schrumpft auf b.
    await store.dispatch(handleSftpTransfer(makeTransfer({ id: 'a', status: 'done', totalBytes: 10, transferredBytes: 10 })));
    items = store.getState().notifications.items;
    expect(items).toHaveLength(1);
    expect(items[0]?.message).toContain('1/2 fertig');
  });

  it('entfernt den Toast nach Idle, sobald alle Transfers abgeschlossen sind', async () => {
    vi.useFakeTimers();
    const store = makeStore();
    await store.dispatch(handleSftpTransfer(makeTransfer({ id: 'a', status: 'running', totalBytes: 10, transferredBytes: 10 })));
    expect(store.getState().notifications.items).toHaveLength(1);

    await store.dispatch(handleSftpTransfer(makeTransfer({ id: 'a', status: 'done', totalBytes: 10, transferredBytes: 10 })));
    // Nach Abschluss bleibt der Toast (fertig-Zustand) noch kurz stehen, bis der Idle-Timer greift.
    expect(store.getState().notifications.items).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(800);
    expect(store.getState().notifications.items).toHaveLength(0);
    vi.useRealTimers();
  });

  it('fasst aufeinanderfolgende Dateien desselben Ordner-Uploads zu EINEM Toast zusammen', async () => {
    vi.useFakeTimers();
    const store = makeStore();

    // Datei 1 laeuft und wird fertig -> Batch kurz "leer" (Idle-Timer aktiv).
    await store.dispatch(handleSftpTransfer(makeTransfer({ id: 'a', status: 'running', totalBytes: 10, transferredBytes: 10 })));
    await store.dispatch(handleSftpTransfer(makeTransfer({ id: 'a', status: 'done', totalBytes: 10, transferredBytes: 10 })));
    expect(store.getState().notifications.items[0]?.title).toContain('1');

    // Datei 2 kommt innerhalb des Idle-Fensters -> gleiche Uebertragung, kein Reset auf "1 Datei".
    await store.dispatch(handleSftpTransfer(makeTransfer({ id: 'b', status: 'running', totalBytes: 10, transferredBytes: 0 })));
    const items = store.getState().notifications.items;
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toContain('2');
    expect(items[0]?.message).toContain('1/2 fertig');
    vi.useRealTimers();
  });

  it('nutzt "Übertragung" als Label bei gemischten Uploads/Downloads', async () => {
    const store = makeStore();
    await store.dispatch(handleSftpTransfer(makeTransfer({ id: 'a', direction: 'upload', status: 'running', totalBytes: 10, transferredBytes: 5 })));
    await store.dispatch(
      handleSftpTransfer(makeTransfer({ id: 'b', direction: 'download', status: 'running', totalBytes: 10, transferredBytes: 5 })),
    );
    expect(store.getState().notifications.items[0]?.title).toContain('Übertragung');
  });

  it('nutzt die vorab gescannte Gesamtzahl + Gesamtgroesse fuer fertig/gesamt', async () => {
    const store = makeStore();
    store.dispatch(setSftpBatchTotal({ total: 10, totalBytes: 1000 }));
    await store.dispatch(handleSftpTransfer(makeTransfer({ id: 'a', status: 'running', totalBytes: 10, transferredBytes: 5 })));

    const items = store.getState().notifications.items;
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toContain('10');
    expect(items[0]?.message).toMatch(/0\/10 fertig/);
    // Nenner ist die vorab gescannte Gesamtgroesse (1000), nicht nur die bekannte Datei.
    expect(items[0]?.message).toContain('5 B / 1000 B');
  });

  it('erzeugt keine Duplikat-Toasts bei aufeinanderfolgenden Events', async () => {
    const store = makeStore();
    for (let i = 0; i < 5; i += 1) {
      await store.dispatch(
        handleSftpTransfer(makeTransfer({ id: 'a', status: 'running', totalBytes: 100, transferredBytes: i * 10 })),
      );
    }
    expect(store.getState().notifications.items).toHaveLength(1);
  });
});

describe('cancelSftpTransfers', () => {
  it('cancelt alle aktiven Transfers des Batches', async () => {
    const store = makeStore();
    const cancel = vi.fn().mockResolvedValue(undefined);
    (globalThis as Record<string, unknown>).window = { api: { sftp: { cancel } } };

    await store.dispatch(handleSftpTransfer(makeTransfer({ id: 'a', status: 'running' })));
    await store.dispatch(handleSftpTransfer(makeTransfer({ id: 'b', status: 'queued' })));
    await store.dispatch(cancelSftpTransfers());

    expect(cancel).toHaveBeenCalledWith({ id: 'a' });
    expect(cancel).toHaveBeenCalledWith({ id: 'b' });
  });
});

describe('formatSpeed', () => {
  it('formatiert Byte-Raten lesbar', () => {
    expect(formatSpeed(0)).toBe('0 B/s');
    expect(formatSpeed(500)).toBe('500 B/s');
    expect(formatSpeed(1024)).toBe('1 KB/s');
    expect(formatSpeed(200 * 1024)).toBe('200 KB/s');
    expect(formatSpeed(5 * 1024 * 1024)).toBe('5 MB/s');
  });
});

describe('upsertTransfer: erledigte Transfers werden aufgeraeumt', () => {
  it('entfernt einen Transfer aus der Liste, sobald er done ist', () => {
    const current = [makeTransfer({ id: 'a', status: 'running' }), makeTransfer({ id: 'b', status: 'running' })];
    const next = upsertTransfer(current, makeTransfer({ id: 'a', status: 'done', transferredBytes: 1000 }));
    expect(next.map((t) => t.id)).toEqual(['b']);
  });

  it('entfernt auch abgebrochene (canceled) Transfers', () => {
    const current = [makeTransfer({ id: 'a', status: 'running' })];
    const next = upsertTransfer(current, makeTransfer({ id: 'a', status: 'canceled' }));
    expect(next).toHaveLength(0);
  });

  it('behaelt fehlgeschlagene (error) Transfers sichtbar', () => {
    const current = [makeTransfer({ id: 'a', status: 'running' })];
    const next = upsertTransfer(current, makeTransfer({ id: 'a', status: 'error', error: 'x' }));
    expect(next).toHaveLength(1);
    expect(next[0]?.status).toBe('error');
  });

  it('fuegt einen neuen Transfer hinzu bzw. aktualisiert einen bestehenden', () => {
    const next = upsertTransfer([], makeTransfer({ id: 'a', status: 'running' }));
    expect(next).toHaveLength(1);

    const updated = upsertTransfer(next, makeTransfer({ id: 'a', status: 'running', transferredBytes: 400 }));
    expect(updated).toHaveLength(1);
    expect(updated[0]?.transferredBytes).toBe(400);
  });
});

afterEach(() => {
  vi.useRealTimers();
});
