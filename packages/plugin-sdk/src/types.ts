// Das SDK ist selbststaendig (keine Abhaengigkeit auf weitere @ssh-central/*-Pakete),
// damit es ausserhalb des Monorepos per file:/git-Referenz installierbar ist.

/** Permission / Faehigkeit eines Plugins. */
export type PluginPermission = 'hosts' | 'terminal' | 'sftp' | 'windows' | 'settings';

/** Geräteweite UserSettings (read-only für Plugins). */
export interface UserSettingsValues {
  language: string;
  theme: 'dark' | 'light';
  terminalFontSize: number;
  showDebugLog: boolean;
  /** Ziel (Host/IP), das für die Latenz-Anzeige regelmäßig angepingt wird. */
  pingTarget: string;
  /** Hardware-Infoleiste (CPU/RAM/GPU/Disk/Netzwerk) unten im Hauptfenster anzeigen. */
  showSystemBar: boolean;
}

/** Pro-Vault Settings (read-only fuer Plugins). */
export interface VaultSettingsValues {
  autoLockMinutes: number;
  sftpConcurrency: number;
  defaultOpener: string;
  /** Sekunden, nach denen ein kopiertes Passwort aus der Zwischenablage entfernt wird (0 = nie). */
  clipboardClearSeconds: number;
  fileOpeners: Record<string, string>;
}

/** Host-Metadaten (nur Referenzen auf Vault-Secrets, nie Klartext). */
export interface Host {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authMethod: 'password' | 'key';
  secrets: {
    passwordRef?: string;
    keyRef?: string;
    keyPassphraseRef?: string;
  };
  tags: string[];
  fingerprint?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

/** Inhalt eines Tabs (Text oder UI-Seiten-URL). */
export interface PluginTabData {
  title: string;
  body?: string;
  /** Falls gesetzt: laedt die Plugin-UI-Seite (plugin://) statt Klartext. */
  url?: string;
  /** Initiale Daten fuer die UI-Seite. */
  data?: unknown;
}

/** Verbindungskonfiguration, die ein Plugin in `resolveConnectionConfig` liefern darf. */
export interface HostConnectionConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
  readyTimeout?: number;
  keepaliveInterval?: number;
  expectedFingerprint?: string;
}

/** Tab, den ein Plugin zu Hosts/Vault hinzufuegen kann. */
export interface PluginTabDef {
  id: string;
  label: string;
}

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

export interface IpcSenderInfo {
  tabId?: string;
  windowId?: string;
}

export type IpcHandler<TReq = unknown, TRes = unknown> = (
  req: TReq,
  sender: IpcSenderInfo,
) => Promise<TRes>;

export type IpcListener = (req: unknown, sender: IpcSenderInfo) => void;

/** Vollstaendige Plugin-API, die ein Plugin in `register(api)` erhaelt. */
export interface PluginApi {
  meta: {
    id(): string;
  };
  log: {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
  };
  hooks: {
    resolveConnectionConfig(handler: ConnectionConfigMiddleware): void;
  };
  events: {
    on(listener: PluginEventListener): void;
  };
  tabs: {
    register(tab: PluginTabDef, provider: TabDataProvider): void;
    onFocus(listener: TabFocusListener): void;
  };
  ipc: {
    handle<TReq = unknown, TRes = unknown>(channel: string, handler: IpcHandler<TReq, TRes>): void;
    on(channel: string, handler: IpcListener): void;
    send<T = unknown>(channel: string, payload: T): void;
    stream<T = unknown>(channel: string, payload: T): void;
  };
  dialog: {
    prompt(opts: { title: string; label?: string; defaultValue?: string }): Promise<string | null>;
    multiline(opts: { title: string; label?: string; defaultValue?: string }): Promise<string | null>;
    secret(opts: { title: string; label?: string }): Promise<string | null>;
    confirm(opts: { title: string; message: string; okLabel?: string; cancelLabel?: string }): Promise<boolean>;
    select(opts: { title: string; message: string; options: { value: string; label: string }[] }): Promise<string | null>;
  };
  secrets: {
    set(key: string, value: string): Promise<void>;
    get(key: string): Promise<string | undefined>;
    delete(key: string): Promise<void>;
    list(): Promise<string[]>;
  };
  storage: {
    get(key: string): Promise<string | undefined>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
    dir(): Promise<string>;
    clear(): Promise<void>;
  };
  session: {
    get(key: string): unknown;
    set(key: string, value: unknown): void;
    delete(key: string): void;
  };
  permissions: {
    list(): Promise<PluginPermission[]>;
    onChanged(listener: (perms: PluginPermission[]) => void): void;
  };
  services: {
    hosts: { list(): Host[] };
  };
  settings: {
    /** Read-only Snapshot der User- + Vault-Settings (Permission 'settings'). */
    getAll(): Promise<{ user: UserSettingsValues; vault: VaultSettingsValues }>;
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
    /** Oeffnet ein eigenes Terminal-Fenster fuer den Host. Erzeugt eine geteilte
     *  Session (keine Duplikat-Verbindung); `sessionId` kann via `api.terminal.*`
     *  zur Steuerung derselben Session verwendet werden. */
    openTerminal(hostId: string, opts?: { command?: string }): Promise<{ id: string; sessionId: string }>;
    /** Oeffnet ein eigenes SFTP-Fenster (Dateimanager) fuer den Host. */
    openSftp(hostId: string): Promise<{ id: string }>;
    /** Schliesst ein zuvor geoeffnetes Fenster (Panel, Terminal oder SFTP). */
    closeWindow(id: string): Promise<void>;
  };
}

/** Ein Plugin-Modul (CommonJS: module.exports = { register, dispose? }). */
export interface PluginModule {
  register(api: PluginApi): void;
  dispose?(api: PluginApi): void;
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
