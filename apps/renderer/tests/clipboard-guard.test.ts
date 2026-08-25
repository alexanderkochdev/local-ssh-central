import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClipboardGuard } from '../src/lib/clipboard-guard.js';

/** Fake-Clipboard, das den aktuellen Text merkt (wie navigator.clipboard). */
function makeClipboard() {
  let text = '';
  return {
    readText: vi.fn(async () => text),
    writeText: vi.fn(async (t: string) => {
      text = t;
    }),
  };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('ClipboardGuard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('kopiert den Wert und leert die Zwischenablage nach Ablauf, wenn unveraendert', async () => {
    const clipboard = makeClipboard();
    const guard = new ClipboardGuard(clipboard, 30_000);

    await guard.copy('geheim');
    expect(clipboard.writeText).toHaveBeenLastCalledWith('geheim');

    // Nach 30 s ist der bewachte Wert noch da -> wird geleert.
    vi.advanceTimersByTime(30_000);
    await flush();
    expect(clipboard.writeText).toHaveBeenLastCalledWith('');
  });

  it('greift NICHT ein, wenn der User direkt (nicht ueber den Guard) etwas anderes kopiert hat', async () => {
    const clipboard = makeClipboard();
    const guard = new ClipboardGuard(clipboard, 30_000);

    await guard.copy('geheim');
    // User kopiert direkt in die Zwischenablage (umgeht den Guard).
    await clipboard.writeText('anderes');

    vi.advanceTimersByTime(30_000);
    await flush();
    // Der bewachte Wert ist noch 'geheim', die Zwischenablage aber 'anderes' -> nicht leeren.
    expect(clipboard.writeText).not.toHaveBeenLastCalledWith('');
  });

  it('copy setzt den Timer zurueck (mehrfaches Kopieren verlaengert die Frist)', async () => {
    const clipboard = makeClipboard();
    const guard = new ClipboardGuard(clipboard, 30_000);

    await guard.copy('a');
    vi.advanceTimersByTime(20_000);
    await guard.copy('b'); // Timer wird neu gestartet
    vi.advanceTimersByTime(20_000);
    await flush();
    // Noch nicht 30 s seit dem letzten copy -> noch nicht geleert.
    expect(clipboard.writeText).not.toHaveBeenLastCalledWith('');

    vi.advanceTimersByTime(10_000);
    await flush();
    expect(clipboard.writeText).toHaveBeenLastCalledWith('');
  });

  it('copy ueberschreibt die Frist pro Aufruf (clearAfterMs) und leert danach', async () => {
    const clipboard = makeClipboard();
    const guard = new ClipboardGuard(clipboard, 30_000);

    await guard.copy('geheim', 10_000);
    vi.advanceTimersByTime(9_999);
    await flush();
    // Noch nicht abgelaufen (Frist ist 10 s, nicht 30 s).
    expect(clipboard.writeText).not.toHaveBeenLastCalledWith('');

    vi.advanceTimersByTime(1);
    await flush();
    expect(clipboard.writeText).toHaveBeenLastCalledWith('');
  });

  it('copy mit 0 Sekunden leert nie (bewusster Opt-out)', async () => {
    const clipboard = makeClipboard();
    const guard = new ClipboardGuard(clipboard, 10_000);

    await guard.copy('geheim', 0);
    vi.advanceTimersByTime(60_000);
    await flush();
    expect(clipboard.writeText).toHaveBeenLastCalledWith('geheim');
    expect(clipboard.writeText).not.toHaveBeenLastCalledWith('');
  });

  it('dispose bricht eine laufende Bewachung ab', async () => {
    const clipboard = makeClipboard();
    const guard = new ClipboardGuard(clipboard, 30_000);

    await guard.copy('geheim');
    guard.dispose();
    vi.advanceTimersByTime(60_000);
    await flush();
    expect(clipboard.writeText).toHaveBeenLastCalledWith('geheim');
    expect(clipboard.writeText).not.toHaveBeenLastCalledWith('');
  });
});
