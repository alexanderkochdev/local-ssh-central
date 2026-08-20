import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { EmptyState } from '@ssh-central/ui';
import { DebugLog, useDebugLog } from '../../components/DebugLog.js';
import { useSettingsStore } from '../../store/settings-store.js';
import { TerminalSession } from './TerminalSession.js';

interface TerminalWindowProps {
  hostId: string;
}

/**
 * Unabhaengiges Terminal-Fenster fuer eine Session. Verbindet sich selbst ueber die
 * Host-ID und zeigt das xterm.js-Terminal fullscreen. Beim Schliessen wird die
 * Session im Main-Process getrennt. Debug-Schritte erscheinen oben links.
 */
export function TerminalWindow({ hostId }: TerminalWindowProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const { entries, add } = useDebugLog();
  const settings = useSettingsStore((s) => s.settings);

  useEffect(() => {
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
        {settings.showDebugLog && <DebugLog entries={entries} />}
        <EmptyState title="Verbindung fehlgeschlagen" description={error} />
      </>
    );
  }

  if (!sessionId) {
    return (
      <>
        {settings.showDebugLog && <DebugLog entries={entries} />}
        <Box sx={{ display: 'grid', placeItems: 'center', height: '100%' }}>
          <CircularProgress />
        </Box>
      </>
    );
  }

  return (
    <Box sx={{ height: '100%', width: '100%', bgcolor: '#0d1117' }}>
      <TerminalSession sessionId={sessionId} />
    </Box>
  );
}
