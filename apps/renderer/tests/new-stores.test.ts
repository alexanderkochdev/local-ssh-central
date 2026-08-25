import { describe, it, expect, beforeEach } from 'vitest';
import {
  useSessionMetaStore,
  DEFAULT_SESSION_COLOR,
  SESSION_COLORS,
} from '../src/store/session-meta-store.js';
import { usePaletteStore } from '../src/store/palette-store.js';
import { useCommandRunnerStore } from '../src/store/command-runner-store.js';
import { useWorkspaceStore } from '../src/store/workspace-store.js';

// Zustand-Stores sind Singletons: initialen Zustand einfrieren und je Test zuruecksetzen.
const initialMeta = useSessionMetaStore.getState();
const initialPalette = usePaletteStore.getState();
const initialRunner = useCommandRunnerStore.getState();
const initialWorkspace = useWorkspaceStore.getState();

beforeEach(() => {
  useSessionMetaStore.setState(initialMeta, true);
  usePaletteStore.setState(initialPalette, true);
  useCommandRunnerStore.setState(initialRunner, true);
  useWorkspaceStore.setState(initialWorkspace, true);
});

describe('useSessionMetaStore', () => {
  it('get liefert Default (leerer Name, Standardfarbe), solange nichts gesetzt ist', () => {
    const meta = useSessionMetaStore.getState().get('s1');
    expect(meta.name).toBe('');
    expect(meta.color).toBe(DEFAULT_SESSION_COLOR);
  });

  it('setName und setColor werden pro Session gespeichert', () => {
    useSessionMetaStore.getState().setName('s1', 'prod');
    useSessionMetaStore.getState().setColor('s1', SESSION_COLORS[0]);

    const meta = useSessionMetaStore.getState().get('s1');
    expect(meta.name).toBe('prod');
    expect(meta.color).toBe(SESSION_COLORS[0]);
  });

  it('setColor ueberschreibt nicht einen vorhandenen Namen', () => {
    useSessionMetaStore.getState().setName('s1', 'prod');
    useSessionMetaStore.getState().setColor('s1', SESSION_COLORS[2]);
    expect(useSessionMetaStore.getState().get('s1').name).toBe('prod');
  });

  it('remove loescht die Metadaten einer Session', () => {
    useSessionMetaStore.getState().setName('s1', 'prod');
    useSessionMetaStore.getState().remove('s1');
    expect(useSessionMetaStore.getState().get('s1').name).toBe('');
  });
});

describe('usePaletteStore', () => {
  it('open/close/toggle steuern den Dialog', () => {
    usePaletteStore.getState().openPalette();
    expect(usePaletteStore.getState().open).toBe(true);

    usePaletteStore.getState().closePalette();
    expect(usePaletteStore.getState().open).toBe(false);

    usePaletteStore.getState().toggle();
    expect(usePaletteStore.getState().open).toBe(true);
  });
});

describe('useCommandRunnerStore', () => {
  it('open/close steuern den Dialog', () => {
    useCommandRunnerStore.getState().openRunner();
    expect(useCommandRunnerStore.getState().open).toBe(true);
    useCommandRunnerStore.getState().closeRunner();
    expect(useCommandRunnerStore.getState().open).toBe(false);
  });
});

describe('useWorkspaceStore', () => {
  it('setView wechselt die aktive View', () => {
    expect(useWorkspaceStore.getState().view).toBe('hosts');
    useWorkspaceStore.getState().setView('vault');
    expect(useWorkspaceStore.getState().view).toBe('vault');
  });
});
