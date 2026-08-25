import { create } from 'zustand';

interface WorkspaceState {
  /** Aktive View im Hauptfenster: 'hosts' | 'vault' | 'plugin:<name>:<tabId>'. */
  view: string;
  setView(view: string): void;
}

/**
 * Aktive Hauptfenster-View. Im zentralen Store, damit auch die Command Palette
 * (z.B. "Zu Hosts" / "Zum Tresor") die View wechseln kann.
 */
export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  view: 'hosts',
  setView: (view) => set({ view }),
}));
