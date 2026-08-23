import { useEffect, useState } from 'react';
import { VaultGate } from './features/vault/VaultGate.js';
import { Workspace } from './features/workspace/Workspace.js';
import { TerminalWindow } from './features/terminal/TerminalWindow.js';
import { SftpWindow } from './features/sftp/SftpWindow.js';
import { NotificationBridge } from './components/NotificationBridge.js';
import { NotificationsContainer } from './components/NotificationsContainer.js';
import { useVaultStore } from './store/vault-store.js';
import { useSettingsStore } from './store/settings-store.js';

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
  const autoLockMinutes = useSettingsStore((s) => s.settings.autoLockMinutes);
  const [route] = useState<Route>(parseHash);

  // Auf Lock-/Auto-Lock-Events vom Main reagieren.
  useEffect(() => {
    return init();
  }, [init]);

  // Persistierte Auto-Lock-Einstellung beim Start (und bei Aenderung) an den Main syncen,
  // damit sie nach einem Neustart tatsaechlich greift - der Main startet sonst mit 15-min-Default.
  useEffect(() => {
    window.api.settings.setAutoLock(autoLockMinutes);
  }, [autoLockMinutes]);

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
    </>
  );
}
