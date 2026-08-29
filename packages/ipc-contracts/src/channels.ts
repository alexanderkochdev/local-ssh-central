/**
 * Zentrale IPC-Channel-Namen. Nur Typen/Constants - keinerlei Laufzeit-Logik.
 * Diese Names muessen zwischen Preload (window.api) und Main (IpcRouter) identisch sein.
 */

export const IpcChannels = {
  // Vault
  vaultStatus: 'vault:status',
  vaultList: 'vault:list',
  vaultSwitch: 'vault:switch',
  vaultCreate: 'vault:create',
  vaultUnlock: 'vault:unlock',
  vaultLock: 'vault:lock',
  vaultChangeMasterPassword: 'vault:changeMasterPassword',
  vaultEntriesList: 'vault:entriesList',
  vaultEntryCreate: 'vault:entryCreate',
  vaultEntryUpdate: 'vault:entryUpdate',
  vaultEntryDelete: 'vault:entryDelete',
  vaultEntryGet: 'vault:entryGet',
  vaultKeyGenerate: 'vault:keyGenerate',
  vaultKeyImport: 'vault:keyImport',
  vaultEvent: 'vault:event',

  // Hosts (Metadata; Secrets liegen im Vault)
  hostsList: 'hosts:list',
  hostsUpsert: 'hosts:upsert',
  hostsDelete: 'hosts:delete',

  // SSH
  sshConnect: 'ssh:connect',
  sshDisconnect: 'ssh:disconnect',
  sshResize: 'ssh:resize',
  sshWrite: 'ssh:write',
  sshListSessions: 'ssh:listSessions',
  sshExec: 'ssh:exec',
  sshEvent: 'ssh:event',

  // Einstellungen (Schema-getrieben: User geräteweit, Vault pro .kdbx)
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  settingsChanged: 'settings:changed',
  // Bestehende Main-wirksame Kanäle (bis der Renderer vollständig migriert ist).
  settingsAutoLock: 'settings:autoLock',
  settingsSftpConcurrency: 'settings:sftpConcurrency',

  // Native Dialoge (Ordner-/Datei-Picker fuer 'folder'/'file'-SettingDefinition,
  // Speicherziel fuer "Herunterladen zu ...")
  dialogPickFolder: 'dialog:pickFolder',
  dialogPickFile: 'dialog:pickFile',
  dialogSaveFile: 'dialog:saveFile',

  // System-Ressourcen (CPU, RAM, GPU, Speicher) fuer die Statusleiste
  systemGetStats: 'system:getStats',

  // Zwischenablage (u.eber Electron-Main, damit Leeren auch ohne Renderer-Fokus zuverlaessig funktioniert)
  clipboardWrite: 'clipboard:write',
  clipboardRead: 'clipboard:read',

  // GitHub-Update-Check (nicht-blockierend beim App-Start)
  updateCheck: 'update:check',
  updateOpen: 'update:open',
  // In-App-Update (electron-updater): Download anstossen, installieren, Fortschritt
  updateDownload: 'update:download',
  updateInstall: 'update:install',
  updateState: 'update:state',

  // Fenster-Verwaltung (neue Terminal-/SFTP-Fenster)
  windowOpen: 'window:open',
  windowSetTitle: 'window:setTitle',
  windowAttachSession: 'window:attachSession',
  windowAttachSftp: 'window:attachSftp',

  // SFTP
  sftpOpen: 'sftp:open',
  sftpClose: 'sftp:close',
  sftpList: 'sftp:list',
  sftpMkdir: 'sftp:mkdir',
  sftpRename: 'sftp:rename',
  sftpRemove: 'sftp:remove',
  sftpUpload: 'sftp:upload',
  sftpDownload: 'sftp:download',
  sftpCancel: 'sftp:cancel',
  sftpSetBatchTotal: 'sftp:setBatchTotal',
  sftpEvent: 'sftp:event',

  // Lokales Dateisystem
  fsHome: 'fs:home',
  fsListDrives: 'fs:listDrives',
  fsListLocal: 'fs:listLocal',
  fsMkdirLocal: 'fs:mkdirLocal',
  fsDeleteLocal: 'fs:deleteLocal',
  fsRenameLocal: 'fs:renameLocal',
  fsOpenPath: 'fs:openPath',
  fsListOpeners: 'fs:listOpeners',
  fsOpenWith: 'fs:openWith',
  fsCreateFileLocal: 'fs:createFileLocal',
  fsOpenInVscode: 'fs:openInVscode',
  sftpOpenRemote: 'sftp:openRemote',
  sftpCreateFile: 'sftp:createFile',

  // Streaming - MessageChannel-Kanaele werden pro Session separat uebergeben
  streamSetup: 'stream:setup',

  // Plugins (Installation aus ZIP, Verwaltung, Tab-Daten)
  pluginsList: 'plugins:list',
  pluginsInstall: 'plugins:install',
  pluginsUninstall: 'plugins:uninstall',
  pluginsGetTab: 'plugins:getTab',
  pluginsSetEnabled: 'plugins:setEnabled',
  pluginsTabFocus: 'plugins:tabFocus',

  // Plugin IPC-Bridge (UI <-> Plugin-Modul)
  pluginsIpcInvoke: 'plugins:ipc:invoke',
  pluginsIpcEvent: 'plugins:ipc:event',

  // Plugin Dialoge (Main -> Renderer anzeigen, Renderer -> Main antworten)
  pluginsUiDialog: 'plugins:ui:dialog',
  pluginsDialog: 'plugins:dialog',
  pluginsDialogResponse: 'plugins:dialog:response',

  // Plugin Secrets (verschluesselt pro Plugin)
  pluginsSecretSet: 'plugins:secret:set',
  pluginsSecretGet: 'plugins:secret:get',
  pluginsSecretDelete: 'plugins:secret:delete',
  pluginsSecretList: 'plugins:secret:list',

  // Plugin Persistenz
  pluginsStorageSet: 'plugins:storage:set',
  pluginsStorageGet: 'plugins:storage:get',
  pluginsStorageDelete: 'plugins:storage:delete',
  pluginsStorageClear: 'plugins:storage:clear',

  // Plugin Berechtigungen
  pluginsPermissionsList: 'plugins:permissions:list',
  pluginsPermissionGrant: 'plugins:permissions:grant',
  pluginsPermissionRevoke: 'plugins:permissions:revoke',
  pluginsLogs: 'plugins:logs',

  // Plugin Host-Faehigkeiten (P3)
  pluginsTerminalOpen: 'plugins:terminal:open',
  pluginsTerminalWrite: 'plugins:terminal:write',
  pluginsTerminalClose: 'plugins:terminal:close',
  pluginsSftpTransfer: 'plugins:sftp:transfer',
  pluginsSftpCancel: 'plugins:sftp:cancel',
  pluginsWindowOpen: 'plugins:window:open',
  pluginsWindowClose: 'plugins:window:close',
} as const;

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels];
