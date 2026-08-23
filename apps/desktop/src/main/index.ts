import { app, dialog, ipcMain, type BrowserWindow } from 'electron';
import log from 'electron-log/main';
import { join } from 'node:path';
import {
  IpcChannels,
  USER_SETTINGS_DEFAULTS,
  VAULT_SETTINGS_DEFAULTS,
  type SettingsChangedPayload,
  type SettingsScope,
  type UserSettingsValues,
  type VaultSettingsValues,
} from '@ssh-central/ipc-contracts';
import { VaultService } from './services/vault-service.js';
import { HostStore } from './services/host-store.js';
import { UserSettings } from './services/user-settings.js';
import { VaultSettings } from './services/vault-settings.js';
import { KdbxVaultSettingsStorage } from './services/kdbx-vault-settings-storage.js';
import { SshService } from './services/ssh-service.js';
import { SftpService } from './services/sftp-service.js';
import { resolveConnectionConfig } from './services/credential-resolver.js';
import { registerIpc } from './ipc/router.js';
import type { AppServices } from './ipc/types.js';
import { createMainWindow } from './windows.js';
import { registerAppProtocol, registerAppSchemePrivileges } from './protocol.js';
import { SessionWindowManager } from './session-windows.js';
import { PluginManager, type PluginServices } from './plugin/plugin-manager.js';
import { registerPluginSchemePrivileges, registerPluginProtocol } from './plugin/plugin-protocol.js';
import { createPluginDialogBroker } from './ipc/plugins.ipc.js';

// MUSS vor app.whenReady() erfolgen (privilegierte Schema-Registrierung).
registerAppSchemePrivileges();
registerPluginSchemePrivileges();
log.initialize();

// Unbehandelte Fehler im Main-Process festhalten (elektron-log).
process.on('uncaughtException', (err) => {
  log.error('[main] uncaughtException:', err);
});
process.on('unhandledRejection', (reason) => {
  log.error('[main] unhandledRejection:', reason);
});
const services = {} as AppServices;
let mainWindow: BrowserWindow | null = null;
let sessionWindows: SessionWindowManager | null = null;
let plugins: PluginManager | null = null;

// Schema-getriebene Settings (ipc-contracts).
// - UserSettings: geräteweit in %APPDATA%/@ssh-local (vor dem Unlock verfuegbar)
// - VaultSettings: pro Vault in der .kdbx (portabel) - KDBX-Persistenz in Phase 2,
//   bis dahin als In-Memory-Stub, damit die Architektur bereits voll verdrahtet ist.
let userSettings: UserSettings | null = null;
let vaultSettings: VaultSettings | null = null;

/** Pusht eine Settings-Aenderung an alle Fenster (user UND vault). */
function emitSettings(scope: SettingsScope, values: UserSettingsValues | VaultSettingsValues): void {
  emit(IpcChannels.settingsChanged, { scope, values } satisfies SettingsChangedPayload);
}

/** Wendet Vault-Settings an, die im Main wirken (Auto-Lock + SFTP-Parallelitaet). */
function applyVaultSettings(values: VaultSettingsValues): void {
  // Auto-Lock
  const minutes = values.autoLockMinutes;
  autoLockMs = minutes > 0 ? minutes * 60_000 : 0;
  clearAutoLock();
  if (autoLockMs > 0) {
    scheduleAutoLock();
  }
  // SFTP-Parallelitaet
  services.sftp?.setConcurrency(Math.max(1, Math.min(16, values.sftpConcurrency)));
}

/** Laedt die VaultSettings aus der gerade entsperrten .kdbx, wendet Wirkungen an und meldet den Stand an die UI. */
async function reloadVaultSettings(): Promise<void> {
  if (!vaultSettings) {
    return;
  }
  await vaultSettings.load();
  applyVaultSettings(vaultSettings.get());
  emitSettings('vault', vaultSettings.get());
}

// ------------------------------------------------------------------ Auto-Lock
let autoLockMs = 15 * 60 * 1000;
let autoLockTimer: NodeJS.Timeout | null = null;

function clearAutoLock(): void {
  if (autoLockTimer) {
    clearTimeout(autoLockTimer);
    autoLockTimer = null;
  }
}

function scheduleAutoLock(): void {
  if (autoLockMs <= 0 || !services.vault?.underlying || services.vault.underlying.state !== 'unlocked') {
    return;
  }
  clearAutoLock();
  autoLockTimer = setTimeout(() => {
    log.info('[main] auto-lock nach Inaktivitaet');
    void services.ssh?.dispose();
    void services.sftp?.dispose();
    services.vault?.lock();
    emit(IpcChannels.vaultEvent, { type: 'autoLocked', reason: 'Inaktivitaet' });
  }, autoLockMs);
}

/** Sendet ein Ereignis an das Hauptfenster, Session-Fenster UND alle Plugin-Listener. */
function emit(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
  sessionWindows?.broadcast(channel, payload);
  plugins?.emit(channel, payload);
}

app.whenReady().then(async () => {
  const userData = app.getPath('userData');
  log.info('[main] app ready');

  // Renderer fuer Produktion ueber app:// servieren (ES-Module, kein file://-Problem).
  registerAppProtocol(join(__dirname, '../renderer'));
  log.info('[main] app protocol registered');

  const vault = new VaultService();
  const hosts = new HostStore(join(userData, 'hosts.json'));
  await hosts.load();

  // Settings-Provider (Schema-getrieben, ipc-contracts).
  const appDataBase = app.getPath('appData'); // %APPDATA% (Roaming)
  userSettings = new UserSettings(join(appDataBase, '@ssh-local'));
  await userSettings.load();

  // VaultSettings liegen IN der .kdbx (dedizierter "SSH Central/Settings"-Eintrag).
  // Hinweis: Bei gelocktem/fehlendem Vault bleiben die In-Memory-Defaults aktiv; nach dem
  // Unlock werden die Vault-Settings ueber den Unlock-Flow neu geladen (siehe router).
  vaultSettings = new VaultSettings(new KdbxVaultSettingsStorage(vault.underlying));
  await vaultSettings.load();

  // Plugin-Protocol registrieren (serviert plugin://-UI-Dateien).
  registerPluginProtocol(join(userData, 'plugins'));

  // Loest Verbindungsparameter aus Host-Metadaten + Vault auf (nur Main-Process),
  // durchlaeuft dabei die Plugin-Middleware-Kette (Erweitern/Ueberschreiben).
  const getConfig = async (hostId: string) => {
    const host = hosts.getById(hostId);
    if (!host) {
      throw new Error('Host nicht gefunden.');
    }
    if (vault.underlying.state !== 'unlocked') {
      throw new Error('Der Tresor ist gesperrt. Bitte zuerst entsperren.');
    }
    return plugins!.resolveConnectionConfig(host, () =>
      Promise.resolve(resolveConnectionConfig(host, vault.underlying)),
    );
  };

  // TOFU: Host-Key-Fingerprint nach dem ersten erfolgreichen Connect am Host speichern.
  const persistFingerprint = (hostId: string, fingerprint: string): Promise<void> =>
    hosts.setFingerprint(hostId, fingerprint);

  services.vault = vault;
  services.hosts = hosts;
  services.ssh = new SshService(
    getConfig,
    (event) => emit(IpcChannels.sshEvent, event),
    persistFingerprint,
  );
  services.sftp = new SftpService(
    getConfig,
    (event) => emit(IpcChannels.sftpEvent, event),
    persistFingerprint,
  );
  sessionWindows = new SessionWindowManager(services);

  // Dialog-Broker: Plugin-Dialoge -> Renderer anzeigen, Antwort zurueck.
  const pluginBroker = createPluginDialogBroker(emit);

  // PluginManager mit App-Services verdrahten (Host-Faehigkeiten + Bridge).
  const pluginServices: PluginServices = {
    hosts: () => hosts.list(),
    getUserSettings: () => userSettings?.get() ?? { ...USER_SETTINGS_DEFAULTS },
    getVaultSettings: () => vaultSettings?.get() ?? { ...VAULT_SETTINGS_DEFAULTS },
    openTerminal: async (hostId, command) => {
      const session = await services.ssh.connect(hostId);
      return { sessionId: session.id };
    },
    writeTerminal: async (sessionId, data) => services.ssh.write(sessionId, data),
    resizeTerminal: async (sessionId, cols, rows) => services.ssh.resize(sessionId, cols, rows),
    closeTerminal: async (sessionId) => services.ssh.disconnect(sessionId),
    sftpTransfer: async (direction, hostId, localPath, remotePath) => {
      const { handle } = await services.sftp.open(hostId);
      const transfer =
        direction === 'upload'
          ? services.sftp.upload(handle, localPath, remotePath)
          : services.sftp.download(handle, localPath, remotePath);
      return { id: transfer.id };
    },
    sftpCancel: async (id) => services.sftp.cancel(id),
    openWindow: async (url, opts) => ({ id: sessionWindows!.openPanel(url, opts) }),
    closeWindow: async (id) => sessionWindows!.closeWindow(id),
    openTerminalWindow: async (hostId, command) => {
      const session = await services.ssh.connect(hostId, 80, 24, command);
      const id = sessionWindows!.openTerminalWindow(hostId, session.id);
      return { id, sessionId: session.id };
    },
    openSftpWindow: async (hostId) => ({ id: sessionWindows!.openSftpWindow(hostId) }),
    dialog: (request, plugin) => pluginBroker.show(request, plugin),
    emitToUi: (push) => emit(IpcChannels.pluginsIpcEvent, push),
  };
  plugins = new PluginManager(join(userData, 'plugins'), pluginServices);
  await plugins.loadAll();

  registerIpc(
    services,
    emit,
    () => emit(IpcChannels.vaultEvent, { type: 'locked' }),
    () => {
      scheduleAutoLock();
      // Nach dem Entsperren die VaultSettings aus der geoeffneten .kdbx laden.
      void reloadVaultSettings();
    },
    plugins,
    pluginBroker,
  );

  // Neue Terminal-/SFTP-Fenster oeffnen (unbegrenzt parallel).
  ipcMain.on(IpcChannels.windowOpen, (_event, request: { kind: 'terminal' | 'sftp'; id: string }) => {
    sessionWindows?.open(request.kind, request.id);
  });

  // Einstellungen, die im Main wirken.
  ipcMain.on(IpcChannels.settingsAutoLock, (_event, minutes: number) => {
    autoLockMs = minutes > 0 ? minutes * 60_000 : 0;
    clearAutoLock();
    if (autoLockMs > 0) {
      scheduleAutoLock();
    }
    log.info(`[main] auto-lock auf ${minutes} min gesetzt`);
  });
  ipcMain.on(IpcChannels.settingsSftpConcurrency, (_event, concurrency: number) => {
    services.sftp.setConcurrency(Math.max(1, Math.min(16, concurrency)));
  });

  // Schema-getriebene Settings (ipc-contracts): ein Handler fuer User UND Vault.
  ipcMain.handle(IpcChannels.settingsGet, async () => ({
    user: userSettings!.get(),
    vault: vaultSettings!.get(),
  }));
  ipcMain.handle(
    IpcChannels.settingsSet,
    async (
      _event,
      request: { scope: SettingsScope; patch: Partial<UserSettingsValues> | Partial<VaultSettingsValues> },
    ) => {
      if (request.scope === 'user') {
        const values = await userSettings!.update(request.patch as Partial<UserSettingsValues>);
        emitSettings('user', values);
        return values;
      }
      const values = await vaultSettings!.update(request.patch as Partial<VaultSettingsValues>);
      applyVaultSettings(values);
      emitSettings('vault', values);
      return values;
    },
  );

  // Native Ordner-/Datei-Dialoge (fuer SettingDefinition type 'folder'/'file').
  ipcMain.handle(IpcChannels.dialogPickFolder, async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
  ipcMain.handle(IpcChannels.dialogPickFile, async () => {
    const result = await dialog.showOpenDialog({ properties: ['openFile'] });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  mainWindow = createMainWindow();
  // Jede Renderer-Ipc aktivitaet setzt den Auto-Lock-Timer zurueck.
  mainWindow.webContents.on('ipc-message', () => scheduleAutoLock());
  log.info('[main] window created');
});

// Beim Beenden alle Verbindungen schliessen und entschluesseltes Material verwerfen.
app.on('before-quit', () => {
  sessionWindows?.closeAll();
  void services.ssh?.dispose();
  void services.sftp?.dispose();
  services.vault?.lock();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
