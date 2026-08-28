// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AutoUpdateState, UpdateCheckResult } from '@ssh-central/ipc-contracts';
import { UpdateDialog } from '../src/features/update/UpdateDialog.js';
import { formatBytes, formatUpdateProgress } from '../src/features/update/progress.js';

function makeState(patch: Partial<AutoUpdateState> = {}): AutoUpdateState {
  return {
    stage: 'idle',
    version: null,
    percent: 0,
    transferred: 0,
    total: 0,
    bytesPerSecond: 0,
    message: null,
    ...patch,
  };
}

function makeResult(patch: Partial<UpdateCheckResult> = {}): UpdateCheckResult {
  return {
    current: '1.3.0',
    latest: '1.4.0',
    available: true,
    url: 'https://github.com/alexanderkochdev/ssh-central/releases/tag/v1.4.0',
    canAutoUpdate: true,
    ...patch,
  };
}

/**
 * Verdrahtet ein Update-API-Double. `push` erlaubt es, Main-Fortschritt zu simulieren,
 * ohne die Komponente neu zu rendern (genau wie der echte `update:state`-Push).
 */
function mockUpdateApi() {
  const listeners: ((state: AutoUpdateState) => void)[] = [];
  const api = {
    check: vi.fn().mockResolvedValue(makeResult()),
    open: vi.fn(),
    download: vi.fn().mockResolvedValue(makeState({ stage: 'downloading' })),
    install: vi.fn(),
    onState: vi.fn((handler: (state: AutoUpdateState) => void) => {
      listeners.push(handler);
      return () => {
        listeners.splice(listeners.indexOf(handler), 1);
      };
    }),
  };
  (window as unknown as Record<string, unknown>).api = { update: api };
  // Der Push kommt im Betrieb aus dem Main-Process - in React-Tests muss er in act()
  // laufen, damit das Re-Render vor der Assertion abgeschlossen ist.
  const push = (state: AutoUpdateState) => {
    act(() => {
      listeners.forEach((listener) => listener(state));
    });
  };
  return { api, push };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('formatBytes', () => {
  it('formatiert Groessen mit passender Einheit', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(-5)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1024 * 1024 * 1.5)).toBe('1.5 MB');
    expect(formatBytes(1024 ** 3)).toBe('1.0 GB');
  });

  it('faengt ungueltige Werte ab', () => {
    expect(formatBytes(Number.NaN)).toBe('0 B');
  });
});

describe('formatUpdateProgress', () => {
  it('zeigt uebertragene Menge, Gesamtgroesse, Prozent und Rate', () => {
    const text = formatUpdateProgress(
      makeState({ percent: 25, transferred: 1024, total: 4096, bytesPerSecond: 2048 }),
    );
    expect(text).toBe('1.0 KB / 4.0 KB (25%) - 2.0 KB/s');
  });

  it('bleibt ohne Gesamtgroesse sinnvoll', () => {
    expect(formatUpdateProgress(makeState({ transferred: 2048 }))).toBe('2.0 KB');
    expect(formatUpdateProgress(makeState({ percent: 10 }))).toBe('10%');
    expect(formatUpdateProgress(null)).toBe('');
  });
});

describe('UpdateDialog', () => {
  it('bleibt geschlossen, wenn kein Update verfuegbar ist', () => {
    mockUpdateApi();
    render(<UpdateDialog result={makeResult({ available: false })} onClose={vi.fn()} />);
    expect(screen.queryByText('Update verfügbar')).toBeNull();
  });

  it('laedt bei auto-update-faehigen Builds direkt in der App', async () => {
    const { api } = mockUpdateApi();
    render(<UpdateDialog result={makeResult()} onClose={vi.fn()} />);

    expect(screen.getByText(/Eine neue Version 1.4.0/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Herunterladen' }));
    expect(api.download).toHaveBeenCalledTimes(1);
    expect(api.open).not.toHaveBeenCalled();
  });

  it('verweist ohne Auto-Update-Faehigkeit auf die Release-Seite', async () => {
    const { api } = mockUpdateApi();
    const onClose = vi.fn();
    const result = makeResult({ canAutoUpdate: false });
    render(<UpdateDialog result={result} onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: 'Zum Release' }));
    expect(api.open).toHaveBeenCalledWith(result.url);
    expect(api.download).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('zeigt den Fortschritt und sperrt das Wegklicken waehrend des Downloads', () => {
    const { push } = mockUpdateApi();
    render(<UpdateDialog result={makeResult()} onClose={vi.fn()} />);

    push(makeState({ stage: 'downloading', percent: 40, transferred: 4096, total: 10240 }));

    expect(screen.getByText('4.0 KB / 10.0 KB (40%)')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Später' })).toHaveProperty('disabled', true);
  });

  it('bietet nach dem Download den Neustart an', async () => {
    const { api, push } = mockUpdateApi();
    render(<UpdateDialog result={makeResult()} onClose={vi.fn()} />);

    push(makeState({ stage: 'downloaded', percent: 100, version: '1.4.0' }));

    expect(screen.getByText(/Version 1.4.0 ist bereit/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Neu starten & installieren' }));
    expect(api.install).toHaveBeenCalledTimes(1);
  });

  it('zeigt bei Fehlern die Meldung und faellt auf die Release-Seite zurueck', async () => {
    const { api, push } = mockUpdateApi();
    render(<UpdateDialog result={makeResult()} onClose={vi.fn()} />);

    push(makeState({ stage: 'error', message: 'Signatur ungueltig' }));

    expect(screen.getByText('Signatur ungueltig')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Zum Release' }));
    expect(api.open).toHaveBeenCalled();
  });
});
