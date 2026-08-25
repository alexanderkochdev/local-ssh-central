import { create } from 'zustand';

interface PaletteState {
  open: boolean;
  openPalette(): void;
  closePalette(): void;
  toggle(): void;
}

/** Globaler Zustand der Command Palette (Strg+P). */
export const usePaletteStore = create<PaletteState>((set, get) => ({
  open: false,
  openPalette: () => set({ open: true }),
  closePalette: () => set({ open: false }),
  toggle: () => set({ open: !get().open }),
}));
