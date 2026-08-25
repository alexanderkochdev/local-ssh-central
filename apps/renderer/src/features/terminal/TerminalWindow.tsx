import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { EmptyState } from '@ssh-central/ui';
import { DebugLog, useDebugLog } from '../../components/DebugLog.js';
import { useSettingsStore } from '../../store/settings-store.js';
import { useSessionMetaStore, DEFAULT_SESSION_COLOR } from '../../store/session-meta-store.js';
import { TerminalSession } from './TerminalSession.js';
import { SessionBar } from './SessionBar.js';

interface TerminalWindowProps {
  hostId: string;
  /** Bestehende (geteilte) Session, an die sich das Fenster anhaengt. Ohne Wert wird eine neue erzeugt. */
  sessionId?: string;
}

/**
 * Unabhaengiges Terminal-Fenster fuer eine Session. Verbindet sich ueber die Host-ID
 * und zeigt das xterm.js-Terminal fullscreen. Wird eine `sessionId` uebergeben, haengt
 * sich das Fenster an diese bestehende Session an (keine Duplikat-Verbindung) - die
 * Session beendet dann der Main-Process beim Schliessen des Fensters. Debug-Schritte
 * erscheinen oben links.
 */
export function TerminalWindow({ hostId, sessionId: presetSession }: TerminalWindowProps) {
  const [sessionId, setSessionId] = useState<string | null>(presetSession ?? null);
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(presetSession ?? null);
  const { entries, add } = useDebugLog();
  const user = useSettingsStore((s) => s.user);
  // Session-Farbe als visueller Anker: linke Leiste + Debug-Log-Akzent (Primitiv-Selektor).
  const sessionColor = useSessionMetaStore((s) =>
    sessionId ? (s.metas[sessionId]?.color ?? DEFAULT_SESSION_COLOR) : DEFAULT_SESSION_COLOR,
  );

  // Session-Metadaten (Name/Farbe) beim Schliessen des Fensters aufraeumen.
  useEffect(() => {
    if (!sessionId) {
      return;
    }
    return () => useSessionMetaStore.getState().remove(sessionId);
  }, [sessionId]);

  useEffect(() => {
    // Bestehende (geteilte) Session: nur anhaengen, keine neue Verbindung aufbauen.
    if (presetSession) {
      sessionIdRef.current = presetSession;
      setSessionId(presetSession);
      setError(null);
      add(`Terminal-Fenster fuer Host ${hostId}`);
      add(`An bestehende Session angehaengt: ${presetSession}`);
      return;
    }

    let cancelled = false;
    sessionIdRef.current = null;
    setSessionId(null);
    setError(null);
    add(`Terminal-Fenster fuer Host ${hostId}`);
    add('Verbinde mit SSH...');

    window.api.ssh
      .connect({ hostId, cols: 80, rows: 24 })
      .then(({ sessionId: id }) => {
        if (!cancelled) {
          sessionIdRef.current = id;
          setSessionId(id);
          // Session an den Main-Process melden: Er trennt sie zuverlaessig beim
          // Fensterschliessen (React-Unmount-Cleanup laeuft dort nicht zuverlaessig).
          window.api.windows.attachSession(id);
          add(`Session erstellt: ${id}`);
          add('Verbunden.');
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
          add(`Fehler: ${err.message}`);
        }
      });

    return () => {
      cancelled = true;
      const id = sessionIdRef.current;
      if (id) {
        add(`Session beendet: ${id}`);
        void window.api.ssh.disconnect({ sessionId: id });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostId]);

  if (error) {
    return (
      <>
        {user.showDebugLog && <DebugLog entries={entries} />}
        <EmptyState title="Verbindung fehlgeschlagen" description={error} />
      </>
    );
  }

  if (!sessionId) {
    return (
      <>
        {user.showDebugLog && <DebugLog entries={entries} />}
        <Box sx={{ display: 'grid', placeItems: 'center', height: '100%' }}>
          <CircularProgress />
        </Box>
      </>
    );
  }

  return (
    <Box sx={{ height: '100%', width: '100%', bgcolor: '#0d1117', display: 'flex', flexDirection: 'column' }}>
      {sessionId && <SessionBar sessionId={sessionId} />}
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {/* Farb-Anker: durchgehende Leiste links in der Session-Farbe */}
        <Box sx={{ width: 4, flexShrink: 0, bgcolor: sessionColor }} />
        <Box sx={{ flex: 1, minHeight: 0, position: 'relative' }}>
          {user.showDebugLog && <DebugLog entries={entries} accentColor={sessionColor} />}
          <TerminalSession sessionId={sessionId} fontSize={user.terminalFontSize} />
        </Box>
      </Box>
    </Box>
  );
}
