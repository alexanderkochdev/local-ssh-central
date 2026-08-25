/**
 * Clipboard-Guard: kopiert ein Vault-Secret in die Zwischenablage und entfernt es nach
 * einer kurzen Zeit automatisch wieder. Schuetzt vor "geklebten" Passwoertern in der
 * Zwischenablage (z.B. nach fremdem Zugriff auf den Rechner).
 *
 * Wichtig: Es wird nur geleert, wenn in der Zwischenablage noch IMMER der bewachte Wert
 * liegt. Hat der User zwischenzeitlich etwas anderes kopiert, wird NICHT eingegriffen.
 *
 * Die Abhaengigkeiten (Clipboard + Timer) sind injizierbar, damit die Logik in Tests
 * mit Fakes ohne echten navigator.clipboard geprueft werden kann.
 */

export interface ClipboardPort {
  readText(): Promise<string>;
  writeText(text: string): Promise<void>;
}

export interface TimerPort {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

/** Standard-Implementierung, die im Browser/Electron-Renderer verwendet wird. */
export const nativeTimer: TimerPort = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

const DEFAULT_CLEAR_AFTER_MS = 10_000;

export class ClipboardGuard {
  private timer: unknown = undefined;
  private guardedValue = '';

  constructor(
    private readonly clipboard: ClipboardPort,
    private readonly clearAfterMs = DEFAULT_CLEAR_AFTER_MS,
    private readonly timers: TimerPort = nativeTimer,
  ) {}

  /**
   * Schreibt den Wert in die Zwischenablage und startet den Auto-Clear-Timer neu.
   * `clearAfterMs` ueberschreibt die Default-Frist pro Aufruf (z.B. aus den Vault-Settings).
   * 0/negativ = nie leeren (bewusster Opt-out).
   */
  async copy(value: string, clearAfterMs?: number): Promise<void> {
    await this.clipboard.writeText(value);
    this.guardedValue = value;
    if (this.timer !== undefined) {
      this.timers.clearTimeout(this.timer);
      this.timer = undefined;
    }
    const delay = clearAfterMs ?? this.clearAfterMs;
    if (delay > 0) {
      this.timer = this.timers.setTimeout(() => void this.expire(), delay);
    }
  }

  private async expire(): Promise<void> {
    this.timer = undefined;
    const current = await this.clipboard.readText();
    if (current === this.guardedValue) {
      await this.clipboard.writeText('');
    }
  }

  /** Entfernt eine laufende Bewachung (z.B. beim Sperren des Tresors). */
  dispose(): void {
    if (this.timer !== undefined) {
      this.timers.clearTimeout(this.timer);
      this.timer = undefined;
    }
  }
}

/**
 * Prozess-globale Instanz fuer den Renderer. Nutzt die Electron-Main-Zwischenablage
 * (via IPC) statt navigator.clipboard, damit das Leeren auch dann zuverlaessig
 * funktioniert, wenn das Fenster den Fokus verloren hat. Die tatsaechliche Frist kommt
 * pro Aufruf aus den Vault-Settings (Default 10 s).
 */
const ipcClipboardPort: ClipboardPort = {
  readText: () => window.api.clipboard.read(),
  writeText: (text) => window.api.clipboard.write(text),
};

export const clipboardGuard = new ClipboardGuard(ipcClipboardPort, DEFAULT_CLEAR_AFTER_MS);
