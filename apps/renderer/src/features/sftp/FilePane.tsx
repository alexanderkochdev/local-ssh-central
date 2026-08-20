import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import Checkbox from '@mui/material/Checkbox';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import RefreshIcon from '@mui/icons-material/Refresh';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import FolderIcon from '@mui/icons-material/Folder';
import CircularProgress from '@mui/material/CircularProgress';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import ClearAllIcon from '@mui/icons-material/ClearAll';
import { Virtuoso } from 'react-virtuoso';
import { useTranslation } from '../../i18n/useTranslation.js';

export interface PaneEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  modifiedAt?: number;
}

export type SortBy = 'name' | 'size' | 'modified';
export type SortDir = 'asc' | 'desc';

interface FilePaneProps {
  title: string;
  path: string;
  entries: PaneEntry[];
  loading: boolean;
  selected: Set<string>;
  onToggleSelect: (entry: PaneEntry) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  /** Aktionen fuer die Auswahl (z.B. Upload/Download/Delete-Gruppen-Buttons). */
  selectionActions?: ReactNode;
  onUp: () => void;
  /** Navigiert zu einem (auch manuell eingegebenen) Pfad. */
  onNavigatePath: (path: string) => void;
  onNavigate: (entry: PaneEntry) => void;
  /** Rechtsklick auf ein Item. */
  onItemContextMenu?: (entry: PaneEntry, x: number, y: number) => void;
  /** Rechtsklick auf die leere Flaeche / Hintergrund. */
  onPaneContextMenu?: (x: number, y: number) => void;
  /** Linksklick auf eine Datei -> oeffnen (mit Programmauswahl). */
  onOpenFile?: (entry: PaneEntry) => void;
  /** Drag-Start eines Items. */
  onFileDragStart?: (entry: PaneEntry, e: DragEvent) => void;
  /** Drop auf das Pane. */
  onPaneDrop?: (e: DragEvent) => void;
}

function formatSize(bytes?: number): string {
  if (bytes === undefined) {
    return '';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(ts?: number): string {
  if (!ts) {
    return '';
  }
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Sortiert Eintraege: Ordner immer zuerst, dann nach Feld in angegebener Richtung. */
function sortEntries(entries: PaneEntry[], sortBy: SortBy, sortDir: SortDir): PaneEntry[] {
  const dir = sortDir === 'asc' ? 1 : -1;
  return [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1;
    }
    const cmp =
      sortBy === 'name'
        ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
        : sortBy === 'size'
          ? (a.size ?? 0) - (b.size ?? 0)
          : (a.modifiedAt ?? 0) - (b.modifiedAt ?? 0);
    return cmp * dir;
  });
}

/** Ein File-Pane (lokal oder remote) mit Checkbox-Mehrfachauswahl, Pfad, Navigation und Sortierung. */
export function FilePane({
  title,
  path,
  entries,
  loading,
  selected,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  selectionActions,
  onUp,
  onNavigatePath,
  onNavigate,
  onItemContextMenu,
  onPaneContextMenu,
  onOpenFile,
  onFileDragStart,
  onPaneDrop,
}: FilePaneProps) {
  const { t } = useTranslation();
  const [pathInput, setPathInput] = useState(path);
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  useEffect(() => {
    setPathInput(path);
  }, [path]);

  const sorted = useMemo(() => sortEntries(entries, sortBy, sortDir), [entries, sortBy, sortDir]);

  return (
    <Box
      sx={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}
      onContextMenu={(e) => {
        e.preventDefault();
        onPaneContextMenu?.(e.clientX, e.clientY);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(e) => {
        e.preventDefault();
        onPaneDrop?.(e);
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, p: 0.5, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="subtitle2" sx={{ pl: 1, minWidth: 60, flexShrink: 0 }}>
          {title}
        </Typography>
        <IconButton size="small" onClick={onUp} title={t('sftp.up')}>
          <ArrowUpwardIcon fontSize="small" />
        </IconButton>
        <TextField
          size="small"
          variant="outlined"
          value={pathInput}
          onChange={(e) => setPathInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onNavigatePath(pathInput.trim());
            }
          }}
          sx={{
            flex: 1,
            minWidth: 0,
            '& .MuiInputBase-root': { fontSize: 12, fontFamily: 'monospace' },
          }}
        />
        <IconButton size="small" onClick={() => onNavigatePath(pathInput.trim())} title={t('sftp.refresh')}>
          <RefreshIcon fontSize="small" />
        </IconButton>
        <Select
          size="small"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          sx={{ fontSize: 12, minWidth: 92 }}
        >
          <MenuItem value="name">{t('sftp.sortName')}</MenuItem>
          <MenuItem value="size">{t('sftp.sortSize')}</MenuItem>
          <MenuItem value="modified">{t('sftp.sortModified')}</MenuItem>
        </Select>
        <Tooltip title={sortDir === 'asc' ? t('sftp.asc') : t('sftp.desc')}>
          <IconButton size="small" onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}>
            {sortDir === 'asc' ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Box>

      {selected.size > 0 && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 1,
            py: 0.5,
            borderBottom: 1,
            borderColor: 'divider',
            bgcolor: 'action.selected',
          }}
        >
          <Typography variant="caption" sx={{ mr: 1, whiteSpace: 'nowrap' }}>
            {selected.size} {t('sftp.selected')}
          </Typography>
          <Button size="small" onClick={onSelectAll}>
            <DoneAllIcon fontSize="small" sx={{ mr: 0.5 }} />
            {t('sftp.selectAll')}
          </Button>
          <Button size="small" onClick={onClearSelection}>
            <ClearAllIcon fontSize="small" sx={{ mr: 0.5 }} />
            {t('sftp.clearSelection')}
          </Button>
          <Box sx={{ flexGrow: 1 }} />
          {selectionActions}
        </Box>
      )}

      {loading ? (
        <Box sx={{ display: 'grid', placeItems: 'center', flex: 1 }}>
          <CircularProgress size={24} />
        </Box>
      ) : sorted.length === 0 ? (
        <Box sx={{ display: 'grid', placeItems: 'center', flex: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {t('sftp.empty')}
          </Typography>
        </Box>
      ) : (
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <Virtuoso
            data={sorted}
            itemContent={(_, entry) => {
              const isChecked = selected.has(entry.path);
              const details = entry.isDirectory ? '' : formatSize(entry.size);
              return (
                <List dense sx={{ py: 0 }}>
                  <ListItemButton
                    selected={isChecked}
                    draggable
                    onDragStart={(e) => onFileDragStart?.(entry, e)}
                    onClick={() => (entry.isDirectory ? onNavigate(entry) : onOpenFile?.(entry))}
                    onDoubleClick={() => entry.isDirectory && onNavigate(entry)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onItemContextMenu?.(entry, e.clientX, e.clientY);
                    }}
                  >
                    <Checkbox
                      edge="start"
                      size="small"
                      checked={isChecked}
                      tabIndex={-1}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleSelect(entry);
                      }}
                    />
                    <ListItemIcon sx={{ minWidth: 28 }}>
                      {entry.isDirectory ? (
                        <FolderIcon color="primary" fontSize="small" />
                      ) : (
                        <InsertDriveFileIcon fontSize="small" />
                      )}
                    </ListItemIcon>
                    <ListItemText
                      primary={entry.name}
                      secondary={details ? `${details} · ${formatDate(entry.modifiedAt)}` : formatDate(entry.modifiedAt)}
                      sx={{
                        '& .MuiListItemText-primary': { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
                      }}
                    />
                  </ListItemButton>
                </List>
              );
            }}
          />
        </Box>
      )}
    </Box>
  );
}

/** Liefert den Eltern-Pfad. */
export function parentPath(p: string): string {
  if (p === '/' || p === '') {
    return p;
  }
  const normalized = p.replace(/\/+$/, '');
  const idx = normalized.lastIndexOf('/');
  if (idx <= 0) {
    return '/';
  }
  return normalized.slice(0, idx);
}

/** Fuegt Pfadsegmente an (forward-slash). */
export function joinPath(base: string, name: string): string {
  if (base === '/') {
    return `/${name}`;
  }
  return `${base.replace(/\/+$/, '')}/${name}`;
}

/** Eltern-Pfad fuer lokale (Windows-)Pfade. Laufwerk-Root fuehrt zurueck zur Laufwerks-Auswahl (''). */
export function parentLocalPath(p: string): string {
  if (!p) {
    return '';
  }
  const normalized = p.replace(/[\\/]+$/, '');
  // Aktueller Pfad IST das Laufwerk-Root (z.B. "C:\") -> Laufwerks-Auswahl.
  if (/^[A-Za-z]:$/.test(normalized)) {
    return '';
  }
  const idx = Math.max(normalized.lastIndexOf('\\'), normalized.lastIndexOf('/'));
  if (idx <= 0) {
    return '';
  }
  let parent = normalized.slice(0, idx);
  // Laufwerk (z.B. "C") -> "C:\" (absoluter Pfad).
  if (/^[A-Za-z]:$/.test(parent)) {
    parent = `${parent}\\`;
  }
  return parent;
}
