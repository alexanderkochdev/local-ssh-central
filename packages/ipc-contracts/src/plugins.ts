/** Plugin-Plattform: Metadaten, UI, IPC-Bridge, Dialoge, Secrets, Persistenz, Berechtigungen, Host-Faehigkeiten. */

export type PluginPermission = 'hosts' | 'terminal' | 'sftp' | 'windows';

export interface PluginTab {
  id: string;
  label: string;
}

/** Nicht-sensitive Plugin-Metadaten fuer den Renderer. */
export interface PluginInfo {
  name: string;
  version: string;
  description?: string;
  enabled: boolean;
  tabs: PluginTab[];
  /** true, wenn das Plugin eine eigene UI-Seite (ui.entry) mitbringt. */
  hasUi: boolean;
  /** Fuer das Plugin deklarierte/erteilte Faehigkeiten. */
  permissions: PluginPermission[];
}

// ------------------------------------------------------------ Tabs / UI

export interface PluginTabRequest {
  plugin: string;
  tabId: string;
}

/** Von einem Text-Tab gelieferter Inhalt ODER eine UI-Seite (url). */
export interface PluginTabData {
  title: string;
  body?: string;
  /** Falls gesetzt: laedt die Plugin-UI-Seite (plugin://) statt Klartext. */
  url?: string;
  /** Initiale Daten fuer die UI-Seite. */
  data?: unknown;
}

// ------------------------------------------------------------ IPC-Bridge

export interface PluginIpcInvokeRequest {
  plugin: string;
  channel: string;
  payload: unknown;
}

export interface PluginIpcInvokeResponse {
  ok: boolean;
  value?: unknown;
  error?: string;
}

export interface PluginIpcPush {
  plugin: string;
  channel: string;
  payload: unknown;
}

// ------------------------------------------------------------ Dialoge

export type PluginDialogKind = 'prompt' | 'multiline' | 'secret' | 'confirm' | 'select';

export interface PluginDialogOption {
  value: string;
  label: string;
}

export interface PluginDialogRequest {
  plugin: string;
  kind: PluginDialogKind;
  title: string;
  message?: string;
  label?: string;
  defaultValue?: string;
  okLabel?: string;
  cancelLabel?: string;
  options?: PluginDialogOption[];
}

// ------------------------------------------------------------ Secrets / Persistenz

export interface PluginSecretKeyRequest {
  plugin: string;
  key: string;
}
export interface PluginSecretSetRequest {
  plugin: string;
  key: string;
  value: string;
}
export interface PluginStorageKeyRequest {
  plugin: string;
  key: string;
}
export interface PluginStorageSetRequest {
  plugin: string;
  key: string;
  value: string;
}

// ------------------------------------------------------------ Berechtigungen

export interface PluginPermissionRequest {
  plugin: string;
  permission: PluginPermission;
}

// ------------------------------------------------------------ Host-Faehigkeiten (P3)

export interface PluginTerminalOpenRequest {
  plugin: string;
  hostId: string;
  command?: string;
}
export interface PluginTerminalWriteRequest {
  plugin: string;
  sessionId: string;
  data: string;
}
export interface PluginTerminalCloseRequest {
  plugin: string;
  sessionId: string;
}
export interface PluginSftpTransferRequest {
  plugin: string;
  direction: 'upload' | 'download';
  hostId: string;
  localPath: string;
  remotePath: string;
}
export interface PluginSftpCancelRequest {
  plugin: string;
  id: string;
}
export interface PluginWindowOpenRequest {
  plugin: string;
  url: string;
  title?: string;
  width?: number;
  height?: number;
}
export interface PluginWindowCloseRequest {
  plugin: string;
  id: string;
}

// ------------------------------------------------------------ Lebenszyklus

export interface PluginSetEnabledRequest {
  name: string;
  enabled: boolean;
}

// ------------------------------------------------------------ Logging (US-9.2)

export type PluginLogLevel = 'info' | 'warn' | 'error';

/** Ein vom Plugin ueber `api.log.*` erzeugter Log-Eintrag. */
export interface PluginLogEntry {
  plugin: string;
  level: PluginLogLevel;
  message: string;
  ts: number;
}
