import { create } from 'zustand';
import { IpcChannels } from '@ssh-central/ipc-contracts';
import type { VaultEvent, VaultInfo, VaultMeta, VaultStatus } from '@ssh-central/ipc-contracts';

interface VaultState {
  info: VaultInfo | null;
  status: VaultStatus | 'checking';
  error: string | null;
  loading: boolean;
  check: () => Promise<void>;
  list: () => Promise<VaultMeta[]>;
  switchVault: (name: string) => Promise<void>;
  create: (name: string, masterPassword: string) => Promise<void>;
  unlock: (masterPassword: string) => Promise<void>;
  lock: () => Promise<void>;
  changeMasterPassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  clearError: () => void;
  /** Abonniert Lock-/Auto-Lock-Events vom Main. Gibt eine Off-Funktion zurueck. */
  init: () => () => void;
}

export const useVaultStore = create<VaultState>((set) => ({
  info: null,
  status: 'checking',
  error: null,
  loading: false,

  check: async () => {
    set({ status: 'checking', error: null });
    const info = await window.api.vault.status();
    set({ info, status: info.status });
  },

  list: async () => window.api.vault.list(),

  switchVault: async (name) => {
    set({ loading: true, error: null });
    try {
      const info = await window.api.vault.switch(name);
      set({ info, status: info.status });
    } catch (err) {
      set({ error: (err as Error).message });
    } finally {
      set({ loading: false });
    }
  },

  create: async (name, masterPassword) => {
    set({ loading: true, error: null });
    try {
      await window.api.vault.create({ name, masterPassword });
      set({ status: 'unlocked' });
    } catch (err) {
      set({ error: (err as Error).message });
    } finally {
      set({ loading: false });
    }
  },

  unlock: async (masterPassword) => {
    set({ loading: true, error: null });
    try {
      await window.api.vault.unlock({ masterPassword });
      set({ status: 'unlocked' });
    } catch (err) {
      set({ error: (err as Error).message });
    } finally {
      set({ loading: false });
    }
  },

  lock: async () => {
    await window.api.vault.lock();
    set({ status: 'locked' });
  },

  changeMasterPassword: async (currentPassword, newPassword) => {
    set({ loading: true, error: null });
    try {
      await window.api.vault.changeMasterPassword({ currentPassword, newPassword });
      return true;
    } catch (err) {
      set({ error: (err as Error).message });
      return false;
    } finally {
      set({ loading: false });
    }
  },

  clearError: () => set({ error: null }),

  init: () =>
    window.api.onEvent(IpcChannels.vaultEvent, (payload) => {
      const event = payload as VaultEvent;
      if (event.type === 'locked' || event.type === 'autoLocked') {
        set({ status: 'locked', error: event.type === 'autoLocked' ? 'Tresor nach Inaktivitaet gesperrt.' : null });
      } else if (event.type === 'unlocked') {
        set({ status: 'unlocked' });
      }
    }),
}));
