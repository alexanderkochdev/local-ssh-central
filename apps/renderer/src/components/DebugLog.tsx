import { useCallback, useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import BugReportIcon from '@mui/icons-material/BugReport';

export interface DebugEntry {
  time: string;
  msg: string;
}

/** Hook fuer ein kleines, anhaengendes Debug-Log (Laufzeit-Schritte fuer den Entwickler). */
export function useDebugLog() {
  const [entries, setEntries] = useState<DebugEntry[]>([]);
  const add = useCallback((msg: string) => {
    setEntries((prev) => [...prev, { time: new Date().toLocaleTimeString('de-DE'), msg }]);
  }, []);
  const clear = useCallback(() => setEntries([]), []);
  return { entries, add, clear };
}

/** Debug-Panel oben rechts im Fenster - listet Lade-/Verbindungs-Schritte zeilenweise auf. */
export function DebugLog({ entries }: { entries: DebugEntry[] }) {
  const [open, setOpen] = useState(true);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (boxRef.current) {
      boxRef.current.scrollTop = boxRef.current.scrollHeight;
    }
  }, [entries]);

  if (!open) {
    return (
      <Box sx={{ position: 'fixed', top: 8, right: 8, zIndex: 1000 }}>
        <Tooltip title="Debug-Log öffnen">
          <IconButton size="small" onClick={() => setOpen(true)}>
            <BugReportIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 8,
        right: 8,
        zIndex: 1000,
        width: 400,
        maxWidth: '60vw',
        maxHeight: 240,
        overflow: 'auto',
        bgcolor: 'rgba(0,0,0,0.78)',
        color: '#9fe6a0',
        fontFamily: 'monospace',
        fontSize: 11,
        lineHeight: 1.4,
        borderRadius: 1,
        p: 1,
        boxShadow: 2,
      }}
      ref={boxRef}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5, color: '#ddd' }}>
        <span>Debug</span>
        <IconButton size="small" color="inherit" onClick={() => setOpen(false)} sx={{ p: 0 }}>
          ✕
        </IconButton>
      </Box>
      {entries.map((entry, i) => (
        <div key={i}>
          <span style={{ color: '#7aa' }}>{entry.time}</span> {entry.msg}
        </div>
      ))}
      {entries.length === 0 && <div style={{ color: '#777' }}>(keine Schritte)</div>}
    </Box>
  );
}
