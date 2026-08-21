import { app, ipcMain, type BrowserWindow } from 'electron';
import log from 'electron-log/main';
import { join } from 'node:path';
import { IpcChannels } from '@ssh-central/ipc-contracts';
import { VaultService } from './services/vault-service.js';
import { HostStore } from './services/host-store.js';
import { SshService } from './services/ssh-service.js';
import { SftpService } from './services/sftp-service.js';
import { resolveConnectionConfig } from './services/credential-resolver.js';
import { registerIpc } from './ipc/router.js';
import type { AppServices } from './ipc/types.js';
import { createMainWindow } from './windows.js';
import { registerAppProtocol, registerAppSchemePrivileges } from './protocol.js';
import { SessionWindowManager } from './session-windows.js';
import { PluginManager } from './plugin/plugin-manager.js';

// MUSS vor app.whenReady() erfolgen (privilegierte Schema-Registrierung).
registerAppSchemePrivileges();
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

  // Plugins laden (lokal installierte ZIPs in userData/plugins).
  plugins = new PluginManager(join(userData, 'plugins'));
  plugins.setHostsProvider(() => hosts.list());
  await plugins.loadAll();

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

  registerIpc(
    services,
    emit,
    () => emit(IpcChannels.vaultEvent, { type: 'locked' }),
    () => scheduleAutoLock(),
    plugins,
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
