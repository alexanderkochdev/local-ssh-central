import type { Host, PluginTabData } from '@ssh-central/ipc-contracts';
import type { HostConnectionConfig } from '@ssh-central/ssh-core';

/** Tab, den ein Plugin zu Hosts/Vault hinzufuegen kann. */
export interface PluginTabDef {
  id: string;
  label: string;
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
  };
}

/** Von einem Plugin exportiertes Modul (CommonJS: module.exports = { register }). */
export interface PluginModule {
  register(api: PluginApi): void;
}

/** Middleware fuer die Credential-Aufloesung. `next()` fuehrt den restlichen Pfad aus. */
export type ConnectionConfigMiddleware = (
  host: Host,
  next: () => Promise<HostConnectionConfig>,
) => Promise<HostConnectionConfig>;

export type PluginEventListener = (channel: string, payload: unknown) => void;

export type TabDataProvider = (tabId: string) => Promise<PluginTabData>;

/** Interne API, die ein Plugin in `register(api)` erhaelt. */
export interface PluginApi {
  log: {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
  };
  hooks: {
    /** Credential-Aufloesung erweitern/ueberschreiben (z.B. eigene Secret-Quelle). */
    resolveConnectionConfig(handler: ConnectionConfigMiddleware): void;
  };
  events: {
    /** Auf ssh/sftp/vault-Events reagieren. */
    on(listener: PluginEventListener): void;
  };
  tabs: {
    /** Einen zusaetzlichen Tab bei Hosts/Vault registrieren. */
    register(tab: PluginTabDef, provider: TabDataProvider): void;
  };
  services: {
    hosts: {
      list(): Host[];
    };
  };
}

/** Ein geladenes, aktives Plugin. */
export interface LoadedPlugin {
  name: string;
  version: string;
  description?: string;
  dir: string;
  enabled: boolean;
  tabs: PluginTabDef[];
}
