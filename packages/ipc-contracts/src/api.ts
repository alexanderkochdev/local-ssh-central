import type { IpcChannels } from './channels.js';
import type {
  GenerateSshKeyRequest,
  ImportSshKeyRequest,
  SshKeyResult,
  VaultChangeMasterPasswordRequest,
  VaultCreateOptions,
  VaultEntryCreateRequest,
  VaultEntryDeleteRequest,
  VaultEntrySummary,
  VaultEntryUpdateRequest,
  VaultInfo,
  VaultMeta,
  VaultUnlockRequest,
} from './vault.js';
import type { Host, HostDeleteRequest, HostUpsertRequest } from './hosts.js';
import type {
  ConnectRequest,
  DisconnectRequest,
  ResizeRequest,
  SessionInfo,
  SshEvent,
  WriteRequest,
} from './ssh.js';
import type {
  CancelTransferRequest,
  FsListRequest,
  FsListResponse,
  SftpEvent,
  TransferInfo,
  TransferRequest,
} from './sftp.js';
import type {
  ListLocalRequest,
  ListLocalResponse,
  LocalFileEntry,
  MkdirLocalRequest,
  OpenerInfo,
} from './fs.js';
import type {
  PluginInfo,
  PluginTabData,
  PluginTabRequest,
} from './plugins.js';

/**
 * Die vollstaendige, typisierte API, die der Preload via contextBridge als `window.api`
 * exponiert. Der Renderer darf NUR diese Methoden verwenden - kein direkter Zugriff
 * auf fs/net/child_process.
 */
export interface SshCentralApi {
  vault: {
    status(): Promise<VaultInfo>;
    list(): Promise<VaultMeta[]>;
    switch(name: string): Promise<VaultInfo>;
    create(options: VaultCreateOptions): Promise<void>;
    unlock(request: VaultUnlockRequest): Promise<void>;
    lock(): Promise<void>;
    changeMasterPassword(request: VaultChangeMasterPasswordRequest): Promise<void>;
    entries: {
      list(): Promise<VaultEntrySummary[]>;
      create(request: VaultEntryCreateRequest): Promise<string>;
      update(request: VaultEntryUpdateRequest): Promise<void>;
      remove(request: VaultEntryDeleteRequest): Promise<void>;
    };
    keys: {
      generate(request: GenerateSshKeyRequest): Promise<SshKeyResult>;
      import(request: ImportSshKeyRequest): Promise<SshKeyResult>;
    };
  };
  hosts: {
    list(): Promise<Host[]>;
    upsert(request: HostUpsertRequest): Promise<Host>;
    remove(request: HostDeleteRequest): Promise<void>;
  };
  ssh: {
    connect(request: ConnectRequest): Promise<{ sessionId: string }>;
    disconnect(request: DisconnectRequest): Promise<void>;
    resize(request: ResizeRequest): Promise<void>;
    write(request: WriteRequest): Promise<void>;
    listSessions(): Promise<SessionInfo[]>;
  };
  sftp: {
    open(request: { hostId: string }): Promise<{ handle: string; cwd: string }>;
    close(request: { handle: string }): Promise<void>;
    openRemote(request: { handle: string; remotePath: string; openerId: string }): Promise<void>;
    createFile(request: { handle: string; path: string }): Promise<void>;
    list(request: FsListRequest): Promise<FsListResponse>;
    mkdir(request: FsListRequest): Promise<void>;
    rename(handle: string, oldPath: string, newPath: string): Promise<void>;
    remove(handle: string, path: string, isDirectory: boolean): Promise<void>;
    upload(request: TransferRequest): Promise<TransferInfo>;
    download(request: TransferRequest): Promise<TransferInfo>;
    cancel(request: CancelTransferRequest): Promise<void>;
  };
  fs: {
    home(): Promise<string>;
    listDrives(): Promise<LocalFileEntry[]>;
    listLocal(request: ListLocalRequest): Promise<ListLocalResponse>;
    mkdirLocal(request: MkdirLocalRequest): Promise<void>;
    deleteLocal(request: { path: string; isDirectory: boolean }): Promise<void>;
    renameLocal(request: { oldPath: string; newPath: string }): Promise<void>;
    openPath(path: string): Promise<void>;
    listOpeners(): Promise<OpenerInfo[]>;
    openWith(request: { path: string; openerId: string }): Promise<void>;
    createFileLocal(path: string): Promise<void>;
    openInVscode(request: { folder?: string; remote?: { user?: string; host: string; path: string } }): Promise<void>;
  };
  /**
   * Einstellungen, die im Main-Process wirken (Auto-Lock, SFTP-Parallelitaet).
   */
  settings: {
    setAutoLock(minutes: number): void;
    setSftpConcurrency(concurrency: number): void;
  };
  /**
   * Oeffnet neue, unabhaengige Fenster fuer Terminal-/SFTP-Sessions (unbegrenzt parallel).
   * Jedes Fenster verbindet sich selbst ueber die Host-ID.
   */
  windows: {
    openTerminal(hostId: string): void;
    openSftp(hostId: string): void;
  };
  /**
   * Plugin-Verwaltung: lokal installierte Plugins (aus ZIP) auflisten, installieren und
   * deinstallieren. `install()` oeffnet einen nativen Datei-Dialog im Main-Process.
   * `getTab` liefert den Inhalt eines von einem Plugin registrierten Tabs.
   */
  plugins: {
    list(): Promise<PluginInfo[]>;
    install(): Promise<PluginInfo[]>;
    uninstall(name: string): Promise<PluginInfo[]>;
    getTab(request: PluginTabRequest): Promise<PluginTabData>;
  };
  /**
   * Ereignis-Abo. Fuer Terminal-/SFTP-Stroeme wird stattdessen ein MessageChannel
   * ueber `stream:setup` verwendet (siehe Desktop-Implementierung).
   */
  onEvent(channel: (typeof IpcChannels)[keyof typeof IpcChannels], handler: (payload: unknown) => void): () => void;
}

export type { VaultInfo, Host, SessionInfo, SftpEvent, SshEvent, TransferInfo, LocalFileEntry };
