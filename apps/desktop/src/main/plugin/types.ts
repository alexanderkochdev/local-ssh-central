import type {
  Host,
  PluginPermission,
  PluginTabData,
} from '@ssh-central/ipc-contracts';
import type { HostConnectionConfig } from '@ssh-central/ssh-core';

/** Tab, den ein Plugin zu Hosts/Vault hinzufuegen kann. */
export interface PluginTabDef {
  id: string;
  label: string;
}

/** Manifest eines Plugins (package.json im Plugin-Ordner). */
export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  main?: string;
  sshCentral?: {
    enabled?: boolean;
    tabs?: PluginTabDef[];
    ui?: { entry: string };
    permissions?: Partial<Record<PluginPermission, boolean>>;
  };
}

/** Von einem Plugin exportiertes Modul (CommonJS: module.exports = { register, dispose }). */
export interface PluginModule {
  register(api: PluginApi): void;
  dispose?(api: PluginApi): void;
}

/** Middleware fuer die Credential-Aufloesung. `next()` fuehrt den restlichen Pfad aus. */
export type ConnectionConfigMiddleware = (
  host: Host,
  next: () => Promise<HostConnectionConfig>,
) => Promise<HostConnectionConfig>;

export type PluginEventListener = (channel: string, payload: unknown) => void;

export type TabDataProvider = (
  tabId: string,
  ctx?: { url?: string },
) => Promise<PluginTabData>;

export type TabFocusListener = (event: {
  type: 'opened' | 'closed' | 'focused' | 'blurred';
  tabId: string;
}) => void;

/** Ipc-Handler: Request/Response. */
export type IpcHandler<TReq = unknown, TRes = unknown> = (
  req: TReq,
  sender: IpcSenderInfo,
) => Promise<TRes>;
export type IpcListener = (req: unknown, sender: IpcSenderInfo) => void;
export interface IpcSenderInfo {
  tabId?: string;
  windowId?: string;
}

export type DialogKind = 'prompt' | 'multiline' | 'secret' | 'confirm' | 'select';

/** Interne API, die ein Plugin in `register(api)` erhaelt. */
export interface PluginApi {
  meta: {
    /** Stabile, eindeutige Plugin-ID (gleich bei Deaktivieren/Entfernen). */
    id(): string;
  };
  log: {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
  };
  hooks: {
    /** Credential-Aufloesung erweitern/ueberschreiben (z.B. eigene Secret-Quelle). */
    resolveConnectionConfig(handler: ConnectionConfigMiddleware): void;
  };
  events: {
    /** Auf ssh/sftp/vault-Events reagieren. */
    on(listener: PluginEventListener): void;
  };
  tabs: {
    /** Einen zusaetzlichen Tab bei Hosts/Vault registrieren. */
    register(tab: PluginTabDef, provider: TabDataProvider): void;
    /** Fokus-/Lebenszyklus-Events des Tabs. */
    onFocus(listener: TabFocusListener): void;
  };
  ipc: {
    /** Request/Response: UI ruft, Plugin antwortet. */
    handle<TReq = unknown, TRes = unknown>(channel: string, handler: IpcHandler<TReq, TRes>): void;
    /** Fire-and-Forget: UI sendet, Plugin verarbeitet. */
    on(channel: string, handler: IpcListener): void;
    /** Push: Plugin sendet eine Nachricht an seine UI. */
    send<T = unknown>(channel: string, payload: T): void;
    /** Streaming: Plugin sendet wiederholte Datenpakete an seine UI. */
    stream<T = unknown>(channel: string, payload: T): void;
  };
  dialog: {
    prompt(opts: { title: string; label?: string; defaultValue?: string }): Promise<string | null>;
    multiline(opts: { title: string; label?: string; defaultValue?: string }): Promise<string | null>;
    secret(opts: { title: string; label?: string }): Promise<string | null>;
    confirm(opts: { title: string; message: string; okLabel?: string; cancelLabel?: string }): Promise<boolean>;
    select(opts: {
      title: string;
      message: string;
      options: { value: string; label: string }[];
    }): Promise<string | null>;
  };
  secrets: {
    /** Verschluesselt speichern (Klartext verlaeuft nie in Logs). */
    set(key: string, value: string): Promise<void>;
    get(key: string): Promise<string | undefined>;
    delete(key: string): Promise<void>;
    list(): Promise<string[]>;
  };
  storage: {
    /** Dauerhaft speichern (ueberlebt Neustarts/Updates), isoliert pro Plugin. */
    get(key: string): Promise<string | undefined>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
    /** Pfad zum persistenten Plugin-Datenverzeichnis. */
    dir(): Promise<string>;
    /** Komplett loeschen (alle Daten + Secrets). */
    clear(): Promise<void>;
  };
  session: {
    get(key: string): unknown;
    set(key: string, value: unknown): void;
    delete(key: string): void;
  };
  permissions: {
    /** Aktuell erteilte Faehigkeiten des Plugins. */
    list(): Promise<PluginPermission[]>;
    /** Auf Aenderungen der eigenen Rechte reagieren. */
    onChanged(listener: (perms: PluginPermission[]) => void): void;
  };
  services: {
    hosts: {
      list(): Host[];
    };
  };
  terminal: {
    open(hostId: string, opts?: { command?: string }): Promise<{ sessionId: string }>;
    write(sessionId: string, data: string): Promise<void>;
    resize(sessionId: string, cols: number, rows: number): Promise<void>;
    close(sessionId: string): Promise<void>;
  };
  sftp: {
    upload(hostId: string, localPath: string, remotePath: string): Promise<{ id: string }>;
    download(hostId: string, localPath: string, remotePath: string): Promise<{ id: string }>;
    cancel(id: string): Promise<void>;
  };
  windows: {
    openPanel(url: string, opts?: { title?: string; width?: number; height?: number }): Promise<{ id: string }>;
    closePanel(id: string): Promise<void>;
    /** Oeffnet ein Terminal-Fenster fuer eine geteilte Session; `sessionId` ist via api.terminal steuerbar. */
    openTerminal(hostId: string, opts?: { command?: string }): Promise<{ id: string; sessionId: string }>;
    /** Oeffnet ein SFTP-Fenster (Dateimanager) fuer den Host. */
    openSftp(hostId: string): Promise<{ id: string }>;
    /** Schliesst ein zuvor geoeffnetes Fenster (Panel, Terminal oder SFTP). */
    closeWindow(id: string): Promise<void>;
  };
}

/** Ein geladenes, aktives Plugin. */
export interface LoadedPlugin {
  name: string;
  version: string;
  description?: string;
  dir: string;
  enabled: boolean;
  tabs: PluginTabDef[];
  hasUi: boolean;
  uiEntry?: string;
  /** Beim Deaktivieren/Entfernen aufzurufende dispose-Funktion. */
  dispose?: () => void;
  session: Map<string, unknown>;
}


