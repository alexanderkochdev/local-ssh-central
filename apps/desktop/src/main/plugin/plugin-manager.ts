import { createRequire } from 'node:module';
import { promises as fs, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import log from 'electron-log';
import type {
  Host,
  PluginDialogRequest,
  PluginInfo,
  PluginIpcInvokeResponse,
  PluginLogEntry,
  PluginLogLevel,
  PluginPermission,
  PluginTabData,
} from '@ssh-central/ipc-contracts';
import type { HostConnectionConfig } from '@ssh-central/ssh-core';
import { extractZip } from './unzip.js';
import type {
  ConnectionConfigMiddleware,
  DialogKind,
  IpcSenderInfo,
  LoadedPlugin,
  PluginApi,
  PluginEventListener,
  PluginManifest,
  PluginModule,
  TabDataProvider,
  TabFocusListener,
} from './types.js';

const requireShim = createRequire(join(process.cwd(), 'plugin-noop.js'));

/** Von der App in den PluginManager injizierte Faehigkeiten (Services + Bridge). */
export interface PluginServices {
  hosts: () => Host[];
  openTerminal(hostId: string, command?: string): Promise<{ sessionId: string }>;
  writeTerminal(sessionId: string, data: string): Promise<void>;
  resizeTerminal(sessionId: string, cols: number, rows: number): Promise<void>;
  closeTerminal(sessionId: string): Promise<void>;
  sftpTransfer(
    direction: 'upload' | 'download',
    hostId: string,
    localPath: string,
    remotePath: string,
  ): Promise<{ id: string }>;
  sftpCancel(id: string): Promise<void>;
  openWindow(url: string, opts?: { title?: string; width?: number; height?: number }): Promise<{ id: string }>;
  closeWindow(id: string): Promise<void>;
  dialog(request: Omit<PluginDialogRequest, 'plugin'>, plugin: string): Promise<string | boolean | null>;
  emitToUi(push: { plugin: string; channel: string; payload: unknown }): void;
}

const IPC_PREFIX = 'plugin:';

/** Verwaltet Plugins: Laden, Hooks, Events, Tabs, IPC-Bridge, Dialoge, Secrets, Persistenz, Berechtigungen, Host-Faehigkeiten. */
export class PluginManager {
  private loaded: LoadedPlugin[] = [];
  private configMiddlewares: { name: string; handler: ConnectionConfigMiddleware }[] = [];
  private eventListeners: { name: string; fn: PluginEventListener }[] = [];
  private tabProviders = new Map<string, { provider: TabDataProvider; url?: string }>();
  private tabFocusListeners = new Map<string, TabFocusListener>();
  private ipcHandlers = new Map<string, (req: unknown, sender: IpcSenderInfo) => Promise<unknown>>();
  private ipcListeners = new Map<string, (req: unknown, sender: IpcSenderInfo) => void>();
  private permissionListeners = new Map<string, (perms: PluginPermission[]) => void>();
  private logs: PluginLogEntry[] = [];
  private readonly LOG_LIMIT = 500;

  constructor(
    private readonly pluginsDir: string,
    private readonly services: PluginServices,
  ) {}

  list(): PluginInfo[] {
    return this.loaded.map((p) => ({
      name: p.name,
      version: p.version,
      description: p.description,
      enabled: p.enabled,
      tabs: p.tabs,
      hasUi: p.hasUi,
      permissions: this.permissionsFor(p.name),
    }));
  }

  /** Plugin-Logs abrufen (optional gefiltert nach Plugin-ID). */
  getLogs(plugin?: string): PluginLogEntry[] {
    return plugin ? this.logs.filter((l) => l.plugin === plugin) : [...this.logs];
  }

  async loadAll(): Promise<void> {
    this.reset();
    await fs.mkdir(this.pluginsDir, { recursive: true });
    const entries = await fs.readdir(this.pluginsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        await this.loadDir(join(this.pluginsDir, entry.name));
      }
    }
  }

  async installFromZip(zipPath: string): Promise<void> {
    const tmp = join(this.pluginsDir, `.install-${Date.now()}`);
    try {
      await extractZip(zipPath, tmp);
      const pluginDir = await this.findPluginDir(tmp);
      const manifest = await this.readManifest(pluginDir);
      if (!manifest?.name || !manifest.version) {
        throw new Error('Kein gueltiges Plugin-Manifest (package.json) im Archiv gefunden.');
      }
      const target = join(this.pluginsDir, manifest.name);
      await fs.rm(target, { recursive: true, force: true });
      await fs.cp(pluginDir, target, { recursive: true });
    } finally {
      await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
    }
  }

  async uninstall(name: string): Promise<void> {
    this.disposePlugin(name);
    await fs.rm(join(this.pluginsDir, name), { recursive: true, force: true });
    await fs.rm(join(this.pluginsDir, '.secrets', `${name}.json`), { force: true }).catch(() => {});
    await this.revokeAllPermissions(name);
  }

  async setEnabled(name: string, enabled: boolean): Promise<void> {
    const manifestPath = join(this.pluginsDir, name, 'package.json');
    const manifest = await this.readManifest(join(this.pluginsDir, name));
    if (!manifest) {
      throw new Error('Manifest nicht aenderbar.');
    }
    manifest.sshCentral = { ...(manifest.sshCentral ?? {}), enabled };
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    await this.loadAll();
  }

  async clearPluginData(name: string): Promise<void> {
    await fs.rm(join(this.pluginsDir, name, 'data'), { recursive: true, force: true }).catch(() => {});
    await fs.rm(join(this.pluginsDir, '.secrets', `${name}.json`), { force: true }).catch(() => {});
  }

  // ------------------------------------------------------------ Hooks & Events

  async resolveConnectionConfig(
    host: Host,
    buildBase: () => Promise<HostConnectionConfig>,
  ): Promise<HostConnectionConfig> {
    let index = 0;
    const next = async (): Promise<HostConnectionConfig> => {
      const mw = this.configMiddlewares[index++];
      if (!mw) return buildBase();
      return mw.handler(host, next);
    };
    return next();
  }

  emit(channel: string, payload: unknown): void {
    for (const { fn } of this.eventListeners) {
      try {
        fn(channel, payload);
      } catch (err) {
        log.error('[plugins] Event-Listener fehlgeschlagen:', err);
      }
    }
  }

  // ------------------------------------------------------------ Tabs / UI

  async getTab(plugin: string, tabId: string): Promise<PluginTabData> {
    const entry = this.tabProviders.get(`${plugin}:${tabId}`);
    if (!entry) throw new Error(`Tab "${plugin}:${tabId}" nicht gefunden.`);
    const data = await entry.provider(tabId, { url: entry.url });
    if (entry.url && !data.url) {
      return { ...data, url: entry.url };
    }
    return data;
  }

  setTabFocus(plugin: string, tabId: string, type: 'opened' | 'closed' | 'focused' | 'blurred'): void {
    const listener = this.tabFocusListeners.get(plugin);
    try {
      listener?.({ type, tabId });
    } catch (err) {
      log.error('[plugins] Tab-Focus-Listener fehlgeschlagen:', err);
    }
  }

  // ------------------------------------------------------------ IPC-Bridge

  async invokeIpc(req: {
    plugin: string;
    channel: string;
    payload: unknown;
  }): Promise<PluginIpcInvokeResponse> {
    const handler = this.ipcHandlers.get(`${IPC_PREFIX}${req.plugin}:${req.channel}`);
    if (!handler) {
      const listener = this.ipcListeners.get(`${IPC_PREFIX}${req.plugin}:${req.channel}`);
      if (listener) {
        try {
          listener(req.payload, {});
        } catch (err) {
          return { ok: false, error: (err as Error).message };
        }
        return { ok: true };
      }
      return { ok: false, error: `Kanal "${req.channel}" nicht registriert.` };
    }
    try {
      const value = await handler(req.payload, {});
      return { ok: true, value };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  // ------------------------------------------------------------ Dialoge

  private async showDialog(plugin: string, kind: DialogKind, opts: Record<string, unknown>): Promise<string | boolean | null> {
    const request: Omit<PluginDialogRequest, 'plugin'> = { kind, ...opts } as Omit<PluginDialogRequest, 'plugin'>;
    return this.services.dialog(request, plugin);
  }

  // ------------------------------------------------------------ Secrets / Persistenz / Berechtigungen

  async secretSet(name: string, key: string, value: string): Promise<void> {
    const safe = this.getSafeStorage();
    if (!safe?.isEncryptionAvailable()) throw new Error('System-Keystore nicht verfuegbar.');
    const data = await this.readSecrets(name);
    data[key] = safe.encryptString(value).toString('base64');
    await this.writeSecrets(name, data);
  }
  async secretGet(name: string, key: string): Promise<string | undefined> {
    const safe = this.getSafeStorage();
    if (!safe?.isEncryptionAvailable()) return undefined;
    const data = await this.readSecrets(name);
    const enc = data[key];
    if (!enc) return undefined;
    try {
      return safe.decryptString(Buffer.from(enc, 'base64'));
    } catch {
      return undefined;
    }
  }
  async secretDelete(name: string, key: string): Promise<void> {
    const data = await this.readSecrets(name);
    delete data[key];
    await this.writeSecrets(name, data);
  }
  async secretList(name: string): Promise<string[]> {
    return Object.keys(await this.readSecrets(name));
  }

  async storageSet(name: string, key: string, value: string): Promise<void> {
    const data = await this.readStorage(name);
    data[key] = value;
    await this.writeStorage(name, data);
  }
  async storageGet(name: string, key: string): Promise<string | undefined> {
    return (await this.readStorage(name))[key];
  }
  async storageDelete(name: string, key: string): Promise<void> {
    const data = await this.readStorage(name);
    delete data[key];
    await this.writeStorage(name, data);
  }
  storageDir(name: string): string {
    return join(this.pluginsDir, name, 'data');
  }

  permissionsFor(name: string): PluginPermission[] {
    const all = this.readPermissions();
    return all[name] ?? this.defaultPermissions(name);
  }

  /**
   * Least Privilege: Ohne erteilte Berechtigung wird beim ersten Zugriff ein
   * Berechtigungs-Dialog angezeigt. Bei Zustimmung wird dauerhaft erteilt, sonst geworfen.
   */
  private async requirePermission(name: string, permission: PluginPermission): Promise<void> {
    if (this.permissionsFor(name).includes(permission)) {
      return;
    }
    const granted = await this.services.dialog(
      {
        kind: 'confirm',
        title: 'Plugin-Berechtigung angefragt',
        message: `Das Plugin "${name}" moechte auf "${permission}" zugreifen. Erlauben?`,
        okLabel: 'Erlauben',
        cancelLabel: 'Verweigern',
      },
      name,
    );
    if (granted) {
      await this.grantPermission(name, permission);
      return;
    }
    throw new Error(`Berechtigung "${permission}" wurde verweigert.`);
  }
  async grantPermission(name: string, permission: PluginPermission): Promise<void> {
    const all = this.readPermissions();
    const list = all[name] ?? [];
    if (!list.includes(permission)) list.push(permission);
    all[name] = list;
    await this.writePermissions(all);
    this.permissionListeners.get(name)?.([...list]);
  }
  async revokePermission(name: string, permission: PluginPermission): Promise<void> {
    const all = this.readPermissions();
    all[name] = (all[name] ?? []).filter((p) => p !== permission);
    await this.writePermissions(all);
    this.permissionListeners.get(name)?.([...all[name]]);
  }
  private async revokeAllPermissions(name: string): Promise<void> {
    const all = this.readPermissions();
    delete all[name];
    await this.writePermissions(all);
  }

  // ------------------------------------------------------------ intern

  private reset(): void {
    for (const p of this.loaded) this.disposePlugin(p.name);
    this.loaded = [];
    this.configMiddlewares = [];
    this.eventListeners = [];
    this.tabProviders.clear();
    this.tabFocusListeners.clear();
    this.ipcHandlers.clear();
    this.ipcListeners.clear();
    this.permissionListeners.clear();
  }

  private disposePlugin(name: string): void {
    const p = this.loaded.find((l) => l.name === name);
    try {
      p?.dispose?.();
    } catch (err) {
      log.error(`[plugins] dispose von "${name}" fehlgeschlagen:`, err);
    }
  }

  private async loadDir(dir: string): Promise<void> {
    const manifest = await this.readManifest(dir);
    if (!manifest?.name || manifest.sshCentral?.enabled === false) return;
    const mainPath = join(dir, manifest.main ?? 'index.js');
    if (!(await this.exists(mainPath))) return;
    try {
      const mod = requireShim(mainPath) as PluginModule;
      if (typeof mod?.register !== 'function') return;
      const hasUi = Boolean(manifest.sshCentral?.ui?.entry);
      const uiEntry = manifest.sshCentral?.ui?.entry;
      const plugin: LoadedPlugin = {
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        dir,
        enabled: true,
        tabs: manifest.sshCentral?.tabs ?? [],
        hasUi,
        uiEntry,
        session: new Map(),
      };
      this.loaded.push(plugin);
      const api = this.buildApi(plugin, manifest);
      mod.register(api);
      if (typeof mod.dispose === 'function') {
        plugin.dispose = () => mod.dispose?.(api);
      }
    } catch (err) {
      log.error(`[plugins] Laden von "${manifest.name}" fehlgeschlagen:`, err);
    }
  }

  private buildApi(plugin: LoadedPlugin, manifest: PluginManifest): PluginApi {
    const name = plugin.name;
    const uiUrl = plugin.hasUi ? `plugin://${name}/${plugin.uiEntry ?? 'index.html'}` : undefined;

    const api: PluginApi = {
      meta: { id: () => name },
      log: {
        info: (m) => this.captureLog(name, 'info', m),
        warn: (m) => this.captureLog(name, 'warn', m),
        error: (m) => this.captureLog(name, 'error', m),
      },
      hooks: {
        resolveConnectionConfig: (handler) => this.configMiddlewares.push({ name, handler }),
      },
      events: {
        on: (fn) => this.eventListeners.push({ name, fn }),
      },
      tabs: {
        register: (tab, provider) => {
          this.tabProviders.set(`${name}:${tab.id}`, { provider, url: uiUrl });
          if (!plugin.tabs.some((t) => t.id === tab.id)) plugin.tabs.push(tab);
        },
        onFocus: (listener) => this.tabFocusListeners.set(name, listener),
      },
      ipc: {
        handle: (channel, handler) =>
          this.ipcHandlers.set(`${IPC_PREFIX}${name}:${channel}`, handler as never),
        on: (channel, handler) =>
          this.ipcListeners.set(`${IPC_PREFIX}${name}:${channel}`, handler),
        send: (channel, payload) => this.services.emitToUi({ plugin: name, channel, payload }),
        stream: (channel, payload) => this.services.emitToUi({ plugin: name, channel, payload }),
      },
      dialog: {
        prompt: (o) => this.showDialog(name, 'prompt', o) as Promise<string | null>,
        multiline: (o) => this.showDialog(name, 'multiline', o) as Promise<string | null>,
        secret: (o) => this.showDialog(name, 'secret', o) as Promise<string | null>,
        confirm: (o) => this.showDialog(name, 'confirm', o) as Promise<boolean>,
        select: (o) => this.showDialog(name, 'select', o) as Promise<string | null>,
      },
      secrets: {
        set: (k, v) => this.secretSet(name, k, v),
        get: (k) => this.secretGet(name, k),
        delete: (k) => this.secretDelete(name, k),
        list: () => this.secretList(name),
      },
      storage: {
        get: (k) => this.storageGet(name, k),
        set: (k, v) => this.storageSet(name, k, v),
        delete: (k) => this.storageDelete(name, k),
        dir: async () => this.storageDir(name),
        clear: () => this.clearPluginData(name),
      },
      session: {
        get: (k) => plugin.session.get(k),
        set: (k, v) => void plugin.session.set(k, v),
        delete: (k) => void plugin.session.delete(k),
      },
      permissions: {
        list: async () => this.permissionsFor(name),
        onChanged: (listener) => this.permissionListeners.set(name, listener),
      },
      services: {
        hosts: { list: () => this.services.hosts() },
      },
      terminal: {
        open: async (hostId, o) => {
          await this.requirePermission(name, 'terminal');
          return this.services.openTerminal(hostId, o?.command);
        },
        write: async (sessionId, data) => {
          await this.requirePermission(name, 'terminal');
          return this.services.writeTerminal(sessionId, data);
        },
        resize: async (sessionId, cols, rows) => {
          await this.requirePermission(name, 'terminal');
          return this.services.resizeTerminal(sessionId, cols, rows);
        },
        close: async (sessionId) => {
          await this.requirePermission(name, 'terminal');
          return this.services.closeTerminal(sessionId);
        },
      },
      sftp: {
        upload: async (hostId, local, remote) => {
          await this.requirePermission(name, 'sftp');
          return this.services.sftpTransfer('upload', hostId, local, remote);
        },
        download: async (hostId, local, remote) => {
          await this.requirePermission(name, 'sftp');
          return this.services.sftpTransfer('download', hostId, local, remote);
        },
        cancel: async (id) => {
          await this.requirePermission(name, 'sftp');
          return this.services.sftpCancel(id);
        },
      },
      windows: {
        openPanel: async (url, o) => {
          await this.requirePermission(name, 'windows');
          return this.services.openWindow(url, o);
        },
        closePanel: async (id) => {
          await this.requirePermission(name, 'windows');
          return this.services.closeWindow(id);
        },
      },
    };
    return api;
  }

  // ------------------------------------------------------------ Datei-Helfer

  /** Erfasst einen Plugin-Log-Eintrag (Ring-Puffer) + schreibt ins App-Log. */
  private captureLog(name: string, level: PluginLogLevel, message: string): void {
    this.logs.push({ plugin: name, level, message, ts: Date.now() });
    if (this.logs.length > this.LOG_LIMIT) {
      this.logs.splice(0, this.logs.length - this.LOG_LIMIT);
    }
    const fn = level === 'warn' ? log.warn : level === 'error' ? log.error : log.info;
    fn(`[plugin:${name}] ${message}`);
  }

  /** Lazy-Zugriff auf Electron safeStorage (im Test/ohne Electron undefined). */
  private getSafeStorage(): Electron.SafeStorage | undefined {
    try {
      const electron = requireShim('electron') as typeof import('electron');
      return electron.safeStorage;
    } catch {
      return undefined;
    }
  }

  private secretPath(name: string): string {
    return join(this.pluginsDir, '.secrets', `${name}.json`);
  }
  private async readSecrets(name: string): Promise<Record<string, string>> {
    try {
      return JSON.parse(await fs.readFile(this.secretPath(name), 'utf8'));
    } catch {
      return {};
    }
  }
  private async writeSecrets(name: string, data: Record<string, string>): Promise<void> {
    const p = this.secretPath(name);
    await fs.mkdir(dirname(p), { recursive: true });
    const tmp = `${p}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data), 'utf8');
    await fs.rename(tmp, p);
  }

  private storagePath(name: string): string {
    return join(this.storageDir(name), 'storage.json');
  }
  private async readStorage(name: string): Promise<Record<string, string>> {
    try {
      return JSON.parse(await fs.readFile(this.storagePath(name), 'utf8'));
    } catch {
      return {};
    }
  }
  private async writeStorage(name: string, data: Record<string, string>): Promise<void> {
    const p = this.storagePath(name);
    await fs.mkdir(dirname(p), { recursive: true });
    const tmp = `${p}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data), 'utf8');
    await fs.rename(tmp, p);
  }

  private defaultPermissions(name: string): PluginPermission[] {
    const plugin = this.loaded.find((l) => l.name === name);
    if (!plugin) return [];
    try {
      const manifest = JSON.parse(readFileSync(join(plugin.dir, 'package.json'), 'utf8')) as PluginManifest;
      const declared = manifest.sshCentral?.permissions;
      if (!declared) return [];
      return (Object.keys(declared) as PluginPermission[]).filter((p) => declared[p] === true);
    } catch {
      return [];
    }
  }

  private permissionsPath(): string {
    return join(this.pluginsDir, 'permissions.json');
  }
  private readPermissions(): Record<string, PluginPermission[]> {
    try {
      return JSON.parse(readFileSync(this.permissionsPath(), 'utf8'));
    } catch {
      return {};
    }
  }
  private async writePermissions(data: Record<string, PluginPermission[]>): Promise<void> {
    await fs.mkdir(this.pluginsDir, { recursive: true });
    const tmp = `${this.permissionsPath()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data), 'utf8');
    await fs.rename(tmp, this.permissionsPath());
  }

  private async readManifest(dir: string): Promise<PluginManifest | null> {
    try {
      return JSON.parse(await fs.readFile(join(dir, 'package.json'), 'utf8'));
    } catch {
      return null;
    }
  }

  private async findPluginDir(root: string): Promise<string> {
    if (await this.exists(join(root, 'package.json'))) return root;
    const entries = await fs.readdir(root, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && (await this.exists(join(root, entry.name, 'package.json')))) {
        return join(root, entry.name);
      }
    }
    throw new Error('Kein package.json im Plugin-Archiv gefunden.');
  }

  private async exists(p: string): Promise<boolean> {
    try {
      await fs.access(p);
      return true;
    } catch {
      return false;
    }
  }
}
