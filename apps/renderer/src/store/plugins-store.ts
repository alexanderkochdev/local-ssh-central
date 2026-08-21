import { create } from 'zustand';
import type { PluginInfo } from '@ssh-central/ipc-contracts';

interface PluginsState {
  plugins: PluginInfo[];
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  install: () => Promise<void>;
  uninstall: (name: string) => Promise<void>;
}

/** Zentrale Plugin-Verwaltung (Liste, Installation aus ZIP, Deinstallation). */
export const usePluginsStore = create<PluginsState>((set) => ({
  plugins: [],
  loading: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const plugins = await window.api.plugins.list();
      set({ plugins, loading: false });
    } catch (error) {
      set({ loading: false, error: (error as Error).message });
    }
  },

  install: async () => {
    set({ loading: true, error: null });
    try {
      const plugins = await window.api.plugins.install();
      set({ plugins, loading: false });
    } catch (error) {
      set({ loading: false, error: (error as Error).message });
    }
  },

  uninstall: async (name: string) => {
    set({ loading: true, error: null });
    try {
      const plugins = await window.api.plugins.uninstall(name);
      set({ plugins, loading: false });
    } catch (error) {
      set({ loading: false, error: (error as Error).message });
    }
  },
}));
