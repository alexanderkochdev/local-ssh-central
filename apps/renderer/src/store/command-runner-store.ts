import { create } from 'zustand';

interface CommandRunnerState {
  open: boolean;
  openRunner(): void;
  closeRunner(): void;
}

/** Dialogzustand des Multi-Host Command Runners (von HostsView + Command Palette aus oeffenbar). */
export const useCommandRunnerStore = create<CommandRunnerState>((set) => ({
  open: false,
  openRunner: () => set({ open: true }),
  closeRunner: () => set({ open: false }),
}));
