import { create } from 'zustand';
import type { Host, HostUpsertRequest } from '@ssh-central/ipc-contracts';

interface HostsState {
  hosts: Host[];
  loading: boolean;
  /** True, sobald mindestens ein Ladevorgang abgeschlossen wurde (verhindert Load-Schleifen). */
  loaded: boolean;
  load: () => Promise<void>;
  save: (request: HostUpsertRequest) => Promise<Host>;
  remove: (id: string) => Promise<void>;
}

/** Zentrale Host-Verwaltung (CRUD). Secrets fliessen nur transient ueber `request.secrets` an den Main. */
export const useHostsStore = create<HostsState>((set, get) => ({
  hosts: [],
  loading: false,
  loaded: false,

  load: async () => {
    set({ loading: true });
    try {
      const hosts = await window.api.hosts.list();
      set({ hosts, loading: false, loaded: true });
    } catch (error) {
      console.error('Hosts laden fehlgeschlagen:', error);
      set({ loading: false, loaded: true });
    }
  },

  save: async (request) => {
    const saved = await window.api.hosts.upsert(request);
    set({ hosts: [...get().hosts.filter((h) => h.id !== saved.id), saved] });
    return saved;
  },

  remove: async (id) => {
    await window.api.hosts.remove({ id });
    set({ hosts: get().hosts.filter((h) => h.id !== id) });
  },
}));
