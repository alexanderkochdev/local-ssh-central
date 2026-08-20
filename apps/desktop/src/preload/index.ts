import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannels, type SshCentralApi } from '@ssh-central/ipc-contracts';

/**
 * Exponiert die typisierte `window.api` via contextBridge. Der Renderer erhaelt ausschliesslich
 * diese schlanke API - kein direkter Zugriff auf Electron-, Node- oder Filesystem-Module.
 */
const api: SshCentralApi = {
  vault: {
    status: () => ipcRenderer.invoke(IpcChannels.vaultStatus),
    list: () => ipcRenderer.invoke(IpcChannels.vaultList),
    switch: (name) => ipcRenderer.invoke(IpcChannels.vaultSwitch, name),
    create: (request) => ipcRenderer.invoke(IpcChannels.vaultCreate, request),
    unlock: (request) => ipcRenderer.invoke(IpcChannels.vaultUnlock, request),
    lock: () => ipcRenderer.invoke(IpcChannels.vaultLock),
    changeMasterPassword: (request) =>
      ipcRenderer.invoke(IpcChannels.vaultChangeMasterPassword, request),
    entries: {
      list: () => ipcRenderer.invoke(IpcChannels.vaultEntriesList),
      create: (request) => ipcRenderer.invoke(IpcChannels.vaultEntryCreate, request),
      update: (request) => ipcRenderer.invoke(IpcChannels.vaultEntryUpdate, request),
      remove: (request) => ipcRenderer.invoke(IpcChannels.vaultEntryDelete, request),
    },
    keys: {
      generate: (request) => ipcRenderer.invoke(IpcChannels.vaultKeyGenerate, request),
      import: (request) => ipcRenderer.invoke(IpcChannels.vaultKeyImport, request),
    },
  },
  hosts: {
    list: () => ipcRenderer.invoke(IpcChannels.hostsList),
    upsert: (request) => ipcRenderer.invoke(IpcChannels.hostsUpsert, request),
    remove: (request) => ipcRenderer.invoke(IpcChannels.hostsDelete, request),
  },
  ssh: {
    connect: (request) => ipcRenderer.invoke(IpcChannels.sshConnect, request),
    disconnect: (request) => ipcRenderer.invoke(IpcChannels.sshDisconnect, request),
    resize: (request) => ipcRenderer.invoke(IpcChannels.sshResize, request),
    write: (request) => ipcRenderer.invoke(IpcChannels.sshWrite, request),
    listSessions: () => ipcRenderer.invoke(IpcChannels.sshListSessions),
  },
  sftp: {
    open: (request) => ipcRenderer.invoke(IpcChannels.sftpOpen, request),
    close: (request) => ipcRenderer.invoke(IpcChannels.sftpClose, request),
    openRemote: (request) => ipcRenderer.invoke(IpcChannels.sftpOpenRemote, request),
    createFile: (request) => ipcRenderer.invoke(IpcChannels.sftpCreateFile, request),
    list: (request) => ipcRenderer.invoke(IpcChannels.sftpList, request),
    mkdir: (request) => ipcRenderer.invoke(IpcChannels.sftpMkdir, request),
    rename: (handle, oldPath, newPath) =>
      ipcRenderer.invoke(IpcChannels.sftpRename, { handle, oldPath, newPath }),
    remove: (handle, path, isDirectory) =>
      ipcRenderer.invoke(IpcChannels.sftpRemove, { handle, path, isDirectory }),
    upload: (request) => ipcRenderer.invoke(IpcChannels.sftpUpload, request),
    download: (request) => ipcRenderer.invoke(IpcChannels.sftpDownload, request),
    cancel: (request) => ipcRenderer.invoke(IpcChannels.sftpCancel, request),
  },
  fs: {
    home: () => ipcRenderer.invoke(IpcChannels.fsHome),
    listDrives: () => ipcRenderer.invoke(IpcChannels.fsListDrives),
    listLocal: (request) => ipcRenderer.invoke(IpcChannels.fsListLocal, request),
    mkdirLocal: (request) => ipcRenderer.invoke(IpcChannels.fsMkdirLocal, request),
    deleteLocal: (request) => ipcRenderer.invoke(IpcChannels.fsDeleteLocal, request),
    renameLocal: (request) => ipcRenderer.invoke(IpcChannels.fsRenameLocal, request),
    openPath: (path) => ipcRenderer.invoke(IpcChannels.fsOpenPath, path),
    listOpeners: () => ipcRenderer.invoke(IpcChannels.fsListOpeners),
    openWith: (request) => ipcRenderer.invoke(IpcChannels.fsOpenWith, request),
    createFileLocal: (path) => ipcRenderer.invoke(IpcChannels.fsCreateFileLocal, path),
    openInVscode: (request) => ipcRenderer.invoke(IpcChannels.fsOpenInVscode, request),
  },
  windows: {
    openTerminal: (hostId) => ipcRenderer.send(IpcChannels.windowOpen, { kind: 'terminal', id: hostId }),
    openSftp: (hostId) => ipcRenderer.send(IpcChannels.windowOpen, { kind: 'sftp', id: hostId }),
  },
  settings: {
    setAutoLock: (minutes) => ipcRenderer.send(IpcChannels.settingsAutoLock, minutes),
    setSftpConcurrency: (concurrency) => ipcRenderer.send(IpcChannels.settingsSftpConcurrency, concurrency),
  },
  onEvent: (channel, handler) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => handler(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
};

contextBridge.exposeInMainWorld('api', api);
