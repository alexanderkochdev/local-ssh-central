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
  sshEvent: 'ssh:event',

  // Einstellungen (wirken im Main-Process)
  settingsAutoLock: 'settings:autoLock',
  settingsSftpConcurrency: 'settings:sftpConcurrency',

  // Fenster-Verwaltung (neue Terminal-/SFTP-Fenster)
  windowOpen: 'window:open',

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
} as const;

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels];
