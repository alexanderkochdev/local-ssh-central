import { useEffect, useState } from 'react';
import { VaultGate } from './features/vault/VaultGate.js';
import { Workspace } from './features/workspace/Workspace.js';
import { TerminalWindow } from './features/terminal/TerminalWindow.js';
import { SftpWindow } from './features/sftp/SftpWindow.js';
import { NotificationBridge } from './components/NotificationBridge.js';
import { NotificationsContainer } from './components/NotificationsContainer.js';
import { UpdateDialog } from './features/update/UpdateDialog.js';
import { useVaultStore } from './store/vault-store.js';
import { useSettingsStore } from './store/settings-store.js';
import { usePaletteStore } from './store/palette-store.js';
import type { UpdateCheckResult } from '@ssh-central/ipc-contracts';

type Route = { kind: 'terminal' | 'sftp'; id: string; sessionId?: string } | null;

/** Liest das Hash-Routing (#/terminal/<hostId>[?session=..] | #/sftp/<hostId>) fuer Session-Fenster. */
function parseHash(): Route {
  const match = window.location.hash.match(/^#\/(terminal|sftp)\/([^/?]+)(?:\?([^/]*))?/);
  if (!match) {
    return null;
  }
  const kind = match[1] as 'terminal' | 'sftp';
  const id = decodeURIComponent(match[2]!);
  const sessionId = new URLSearchParams(match[3] ?? '').get('session') ?? undefined;
  return { kind, id, sessionId };
}

/**
 * Root der App. Session-Fenster (Terminal/SFTP) werden ueber den Hash geroutet und
 * rendern ihre Komponente fullscreen; das Hauptfenster zeigt Vault-/Workspace-Flow
 * plus das Notification-System (unten rechts).
 */
export default function App() {
  const status = useVaultStore((state) => state.status);
  const init = useVaultStore((state) => state.init);
  const initSettings = useSettingsStore((state) => state.init);
  const [route] = useState<Route>(parseHash);
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null);

  // Globale Command-Palette: Strg+P / Strg+K im Hauptfenster (nicht in Session-Fenstern).
  useEffect(() => {
    if (route) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        usePaletteStore.getState().toggle();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [route]);

  // Auf Lock-/Auto-Lock-Events vom Main reagieren.
  useEffect(() => {
    return init();
  }, [init]);

  // Settings einmalig laden + auf Main-Pushes (z.B. nach Unlock) hoeren.
  useEffect(() => {
    return initSettings();
  }, [initSettings]);

  // GitHub-Update-Check (einmalig pro Start, nur im Hauptfenster, nicht-blockierend).
  useEffect(() => {
    if (route) {
      return;
    }
    let cancelled = false;
    window.api.update
      .check()
      .then((result) => {
        if (!cancelled && result.available && result.latest) {
          setUpdateResult(result);
        }
      })
      .catch(() => {
        // Offline/API-Fehler -> still ignorieren (kein Update-Noise).
      });
    return () => {
      cancelled = true;
    };
  }, [route]);

  if (route?.kind === 'terminal') {
    return <TerminalWindow hostId={route.id} sessionId={route.sessionId} />;
  }
  if (route?.kind === 'sftp') {
    return <SftpWindow hostId={route.id} />;
  }

  return (
    <>
      <NotificationBridge />
      {status === 'unlocked' ? <Workspace /> : <VaultGate />}
      <NotificationsContainer />
      <UpdateDialog result={updateResult} onClose={() => setUpdateResult(null)} />
    </>
  );
}
