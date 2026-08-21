import { createRequire } from 'node:module';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import log from 'electron-log';
import type { Host, PluginInfo, PluginTabData } from '@ssh-central/ipc-contracts';
import type { HostConnectionConfig } from '@ssh-central/ssh-core';
import { extractZip } from './unzip.js';
import type {
  ConnectionConfigMiddleware,
  LoadedPlugin,
  PluginApi,
  PluginEventListener,
  PluginManifest,
  PluginModule,
  PluginTabDef,
  TabDataProvider,
} from './types.js';

// Echter Node-require zum Laden externer CJS-Plugin-Module aus beliebigen Pfaden.
// Basis ist egal (wir laden nur absolute Pfade); process.cwd() funktioniert in
// gebuendelter CJS-Main UND in Vitest (ESM).
const requireShim = createRequire(join(process.cwd(), 'plugin-noop.js'));

interface RegisteredConfigMiddleware {
  name: string;
  handler: ConnectionConfigMiddleware;
}
interface RegisteredEventListener {
  name: string;
  fn: PluginEventListener;
}

/**
 * Verwaltet lokal installierte Plugins (ZIP-Installation) und verdrahtet deren Hooks
 * in die Main-Services (Credential-Aufloesung, Events, Tab-Erweiterung).
 */
export class PluginManager {
  private loaded: LoadedPlugin[] = [];
  private configMiddlewares: RegisteredConfigMiddleware[] = [];
  private eventListeners: RegisteredEventListener[] = [];
  private tabProviders = new Map<string, TabDataProvider>();
  private hostsProvider: (() => Host[]) | null = null;

  constructor(private readonly pluginsDir: string) {}

  /** Setzt die Quelle fuer `api.services.hosts.list()` (wird im Main verdrahtet). */
  setHostsProvider(provider: () => Host[]): void {
    this.hostsProvider = provider;
  }

  list(): PluginInfo[] {
    return this.loaded.map((p) => ({
      name: p.name,
      version: p.version,
      description: p.description,
      enabled: p.enabled,
      tabs: p.tabs,
    }));
  }

  async loadAll(): Promise<void> {
    this.reset();
    await fs.mkdir(this.pluginsDir, { recursive: true });
    const entries = await fs.readdir(this.pluginsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      await this.loadDir(join(this.pluginsDir, entry.name));
    }
  }

  /** Installiert ein Plugin aus einer ZIP-Datei und laedt den Manager neu. */
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
    await fs.rm(join(this.pluginsDir, name), { recursive: true, force: true });
  }

  /** Laeuft die Credential-Aufloesung durch die Plugin-Middleware-Kette. */
  async resolveConnectionConfig(
    host: Host,
    buildBase: () => Promise<HostConnectionConfig>,
  ): Promise<HostConnectionConfig> {
    let index = 0;
    const next = async (): Promise<HostConnectionConfig> => {
      const middleware = this.configMiddlewares[index++];
      if (!middleware) {
        return buildBase();
      }
      return middleware.handler(host, next);
    };
    return next();
  }

  /** Leitet ein Main-Event an alle Plugin-Listener weiter. */
  emit(channel: string, payload: unknown): void {
    for (const { fn } of this.eventListeners) {
      try {
        fn(channel, payload);
      } catch (err) {
        log.error('[plugins] Event-Listener fehlgeschlagen:', err);
      }
    }
  }

  async getTab(plugin: string, tabId: string): Promise<PluginTabData> {
    const provider = this.tabProviders.get(`${plugin}:${tabId}`);
    if (!provider) {
      throw new Error(`Tab "${plugin}:${tabId}" nicht gefunden.`);
    }
    return provider(tabId);
  }

  // ------------------------------------------------------------------ intern

  private reset(): void {
    this.loaded = [];
    this.configMiddlewares = [];
    this.eventListeners = [];
    this.tabProviders.clear();
  }

  private async loadDir(dir: string): Promise<void> {
    const manifest = await this.readManifest(dir);
    if (!manifest?.name || manifest.sshCentral?.enabled === false) {
      return;
    }
    const mainPath = join(dir, manifest.main ?? 'index.js');
    if (!(await this.exists(mainPath))) {
      return;
    }
    try {
      const mod = requireShim(mainPath) as PluginModule;
      if (typeof mod?.register !== 'function') {
        return;
      }
      this.loaded.push({
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        dir,
        enabled: true,
        tabs: manifest.sshCentral?.tabs ?? [],
      });
      mod.register(this.buildApi(manifest.name));
    } catch (err) {
      log.error(`[plugins] Laden von "${manifest.name}" fehlgeschlagen:`, err);
    }
  }

  private buildApi(name: string): PluginApi {
    return {
      log: {
        info: (msg) => log.info(`[plugin:${name}] ${msg}`),
        warn: (msg) => log.warn(`[plugin:${name}] ${msg}`),
        error: (msg) => log.error(`[plugin:${name}] ${msg}`),
      },
      hooks: {
        resolveConnectionConfig: (handler) =>
          this.configMiddlewares.push({ name, handler }),
      },
      events: {
        on: (fn) => this.eventListeners.push({ name, fn }),
      },
      tabs: {
        register: (tab: PluginTabDef, provider: TabDataProvider) => {
          this.tabProviders.set(`${name}:${tab.id}`, provider);
          // Bereits geladene Plugin-Liste um den Tab ergaenzen (Meta).
          const plugin = this.loaded.find((p) => p.name === name);
          if (plugin && !plugin.tabs.some((t) => t.id === tab.id)) {
            plugin.tabs.push(tab);
          }
        },
      },
      services: {
        hosts: {
          list: () => this.hostsProvider?.() ?? [],
        },
      },
    };
  }

  private async readManifest(dir: string): Promise<PluginManifest | null> {
    try {
      const raw = await fs.readFile(join(dir, 'package.json'), 'utf8');
      return JSON.parse(raw) as PluginManifest;
    } catch {
      return null;
    }
  }

  private async findPluginDir(root: string): Promise<string> {
    if (await this.exists(join(root, 'package.json'))) {
      return root;
    }
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
