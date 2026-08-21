/** Typen fuer die Plugin-UI-Seite (im iframe) - `window.sshCentral`-Bridge. */

export interface SshCentralPush {
  type: 'push' | 'response';
  channel?: string;
  payload?: unknown;
}

export interface SshCentralBridge {
  /** Request/Response zum Plugin-Modul im Main-Process. */
  invoke<TReq = unknown, TRes = unknown>(channel: string, payload?: TReq): Promise<TRes>;
  /** Fire-and-Forget an das Plugin-Modul. */
  send<T = unknown>(channel: string, payload: T): void;
  /** Globaler Empfaenger fuer Nachrichten vom Plugin. */
  onMessage(fn: (msg: SshCentralPush) => void): void;
  /** Empfangen von Pushes auf einem bestimmten Kanal. */
  on<T = unknown>(channel: string, fn: (payload: T) => void): void;
  /** Empfangen von Streaming-Daten auf einem bestimmten Kanal. */
  onStream<T = unknown>(channel: string, fn: (chunk: T) => void): void;
}

declare global {
  interface Window {
    sshCentral?: SshCentralBridge;
  }
}
