/** Plugin-System: Metadaten + Tab-Erweiterung. Plugins sind private, lokal installierte Module. */

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
}

export interface PluginTabRequest {
  plugin: string;
  tabId: string;
}

/** Von einem Plugin-Tab gelieferter Inhalt (einfacher, textbasierter Vertrag). */
export interface PluginTabData {
  title: string;
  body: string;
}
