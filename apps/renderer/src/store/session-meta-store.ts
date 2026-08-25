import { create } from 'zustand';

/** Farbpalette fuer die Session-Farbmarkierung (Tab/Leiste). */
export const SESSION_COLORS = [
  '#e53935', // Rot (produktiv/kritisch)
  '#43a047', // Gruen (Dev/ok)
  '#1e88e5', // Blau
  '#fb8c00', // Orange
  '#8e24aa', // Violett
  '#00897b', // Teal
  '#fdd835', // Gelb
] as const;

export const DEFAULT_SESSION_COLOR = SESSION_COLORS[1]!;

export interface SessionMeta {
  name: string;
  color: string;
}

interface SessionMetaState {
  metas: Record<string, SessionMeta>;
  /** Liefert die Metadaten einer Session (mit Default, falls noch nicht gesetzt). */
  get(sessionId: string): SessionMeta;
  setName(sessionId: string, name: string): void;
  setColor(sessionId: string, color: string): void;
  /** Entfernt die Metadaten einer geschlossenen Session (Aufraeumen). */
  remove(sessionId: string): void;
}

const emptyMeta = (): SessionMeta => ({ name: '', color: DEFAULT_SESSION_COLOR });

/**
 * Transiente Metadaten offener Sessions (Anzeigename + Farbmarkierung).
 * Pro Terminal-Fenster; wird beim Schliessen der Session aufgeraeumt.
 */
export const useSessionMetaStore = create<SessionMetaState>((set, get) => ({
  metas: {},

  get: (sessionId) => get().metas[sessionId] ?? emptyMeta(),

  setName: (sessionId, name) =>
    set((state) => ({
      metas: {
        ...state.metas,
        [sessionId]: { ...(state.metas[sessionId] ?? emptyMeta()), name },
      },
    })),

  setColor: (sessionId, color) =>
    set((state) => ({
      metas: {
        ...state.metas,
        [sessionId]: { ...(state.metas[sessionId] ?? emptyMeta()), color },
      },
    })),

  remove: (sessionId) =>
    set((state) => {
      const { [sessionId]: _removed, ...rest } = state.metas;
      return { metas: rest };
    }),
}));
