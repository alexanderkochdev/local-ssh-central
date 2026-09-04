import { create } from 'zustand';
import type { PluginInfo } from '@ssh-central/ipc-contracts';

interface WorkspaceState {
  /** Aktive View im Hauptfenster: 'hosts' | 'vault' | 'plugin:<name>:<tabId>'. */
  view: string;
  setView(view: string): void;
}

/**
 * Zentrale Hauptfenster-View. Im Store, damit auch die Command Palette
 * (z.B. "Zu Hosts" / "Zum Tresor") die View wechseln kann.
 */
export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  view: 'hosts',
  setView: (view) => set({ view }),
}));

/**
 * Pure Entscheidung fuer die aktive View: Bleibt eine 'plugin:<name>:<tabId>'-View bestehen,
 * solange das Plugin aktiviert (enabled) ist; andernfalls faellt die View auf 'hosts' zurueck.
 * Verhindert, dass nach dem Deaktivieren/Deinstallieren eines Plugins dessen jetzt toter
 * Tab weiter als aktive View haengt (PluginPanel wuerde sonst einen Fehler zeigen).
 */
export function resolveActiveView(view: string, plugins: PluginInfo[]): string {
  if (!view.startsWith('plugin:')) return view;
  const name = view.split(':')[1] ?? '';
  const stillEnabled = plugins.some((p) => p.name === name && p.enabled);
  return stillEnabled ? view : 'hosts';
}
