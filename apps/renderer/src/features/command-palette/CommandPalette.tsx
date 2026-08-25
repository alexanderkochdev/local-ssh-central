import { useEffect, useMemo, useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import TextField from '@mui/material/TextField';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import ListItemIcon from '@mui/material/ListItemIcon';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import TerminalIcon from '@mui/icons-material/Terminal';
import FolderSharedIcon from '@mui/icons-material/FolderShared';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import StorageIcon from '@mui/icons-material/Storage';
import LockIcon from '@mui/icons-material/Lock';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import type { VaultEntrySummary } from '@ssh-central/ipc-contracts';
import { usePaletteStore } from '../../store/palette-store.js';
import { useWorkspaceStore } from '../../store/workspace-store.js';
import { useCommandRunnerStore } from '../../store/command-runner-store.js';
import { useHostsStore } from '../../store/hosts-store.js';
import { useSettingsStore } from '../../store/settings-store.js';
import { useTranslation } from '../../i18n/useTranslation.js';
import { useAppDispatch } from '../../store/index.js';
import { pushNotification } from '../../store/notificationsSlice.js';
import { clipboardGuard } from '../../lib/clipboard-guard.js';
import {
  filterPaletteItems,
  orderedPaletteSections,
  type PaletteItem,
  type PaletteSection,
} from './palette-utils.js';
import { CopyPasswordConfirmDialog } from '../vault/CopyPasswordConfirmDialog.js';

const SECTION_LABEL: Record<PaletteSection, string> = {
  actions: 'palette.sectionActions',
  hosts: 'palette.sectionHosts',
  vault: 'palette.sectionVault',
};

/**
 * Globale Command Palette (Strg+P): durchsucht Hosts, Tresor-Eintraege und Aktionen.
 * Verbinden/SFTP oeffnen Fenster, Passwoerter werden mit Clipboard-Guard kopiert.
 */
export function CommandPalette() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const open = usePaletteStore((s) => s.open);
  const closePalette = usePaletteStore((s) => s.closePalette);
  const setView = useWorkspaceStore((s) => s.setView);
  const openRunner = useCommandRunnerStore((s) => s.openRunner);
  const { hosts, loaded, load } = useHostsStore();
  const clipboardClearSeconds = useSettingsStore((s) => s.vault.clipboardClearSeconds);
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<VaultEntrySummary[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [copyTarget, setCopyTarget] = useState<{ id: string; title: string } | null>(null);

  // Beim Oeffnen Query + Eintraege zuruecksetzen und Daten nachladen.
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setEntries([]);
      void window.api.vault.entries.list().then(setEntries);
      if (!loaded) {
        void load();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const items = useMemo<PaletteItem[]>(() => {
    const list: PaletteItem[] = [
      {
        id: 'action:hosts',
        section: 'actions',
        label: t('palette.goHosts'),
        icon: <StorageIcon fontSize="small" />,
        action: () => setView('hosts'),
      },
      {
        id: 'action:vault',
        section: 'actions',
        label: t('palette.goVault'),
        icon: <LockIcon fontSize="small" />,
        action: () => setView('vault'),
      },
      {
        id: 'action:run',
        section: 'actions',
        label: t('palette.runCommand'),
        icon: <PlayArrowIcon fontSize="small" />,
        action: () => openRunner(),
      },
      ...hosts.map((host): PaletteItem => ({
        id: `host:connect:${host.id}`,
        section: 'hosts',
        label: host.name,
        hint: `${host.username}@${host.host}:${host.port} · ${t('palette.connect')}`,
        icon: <TerminalIcon fontSize="small" />,
        action: () => window.api.windows.openTerminal(host.id),
      })),
      ...hosts.map((host): PaletteItem => ({
        id: `host:sftp:${host.id}`,
        section: 'hosts',
        label: host.name,
        hint: `${host.username}@${host.host}:${host.port} · ${t('palette.openSftp')}`,
        icon: <FolderSharedIcon fontSize="small" />,
        action: () => window.api.windows.openSftp(host.id),
      })),
      ...entries
        .filter((entry) => !entry.hasKeyData)
        .map((entry): PaletteItem => ({
          id: `vault:copy:${entry.id}`,
          section: 'vault',
          label: entry.title || t('vault.untitled'),
          hint: `${entry.userName ?? ''} · ${t('palette.copyPassword')}`,
          icon: <ContentCopyIcon fontSize="small" />,
          action: () => setCopyTarget({ id: entry.id, title: entry.title || t('vault.untitled') }),
        })),
    ];
    return list;
  }, [hosts, entries, t, setView, openRunner]);

  const filtered = filterPaletteItems(items, query);

  // Aktive Sektionen in Anzeige-Reihenfolge, nur mit Treffern.
  const sections = orderedPaletteSections(filtered);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, open]);

  function execute(item: PaletteItem) {
    closePalette();
    item.action();
  }

  function copyPassword(id: string) {
    void (async () => {
      try {
        const password = await window.api.vault.entries.get({ id });
        if (!password) {
          dispatch(
            pushNotification({ type: 'error', title: t('clipboard.copyFailed'), message: 'Kein Passwort.' }),
          );
          return;
        }
        await clipboardGuard.copy(password, clipboardClearSeconds * 1000);
        const title =
          clipboardClearSeconds > 0
            ? t('clipboard.copied').replace('{seconds}', String(clipboardClearSeconds))
            : t('clipboard.copiedNever');
        dispatch(pushNotification({ type: 'success', title }));
      } catch (err) {
        dispatch(
          pushNotification({
            type: 'error',
            title: t('clipboard.copyFailed'),
            message: (err as Error).message,
          }),
        );
      }
    })();
  }

  return (
    <Dialog open={open} onClose={closePalette} fullWidth maxWidth="sm">
      <DialogContent sx={{ p: 1 }}>
        <TextField
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && filtered.length > 0) {
              execute(filtered[Math.min(selectedIndex, filtered.length - 1)]!);
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setSelectedIndex((i) => Math.max(i - 1, 0));
            }
          }}
          placeholder={t('palette.placeholder')}
          variant="outlined"
          size="small"
          fullWidth
          autoFocus
          sx={{ mb: 1 }}
        />

        <Box sx={{ maxHeight: 360, overflow: 'auto' }}>
          {filtered.length === 0 ? (
            <Typography color="text.secondary" sx={{ px: 2, py: 3 }}>
              {t('palette.noResults')}
            </Typography>
          ) : (
            sections.map((section) => (
              <Box key={section}>
                <Typography variant="caption" color="text.secondary" sx={{ px: 2, py: 0.5, display: 'block' }}>
                  {t(SECTION_LABEL[section])}
                </Typography>
                <List dense disablePadding>
                  {filtered
                    .map((item, index) => ({ item, index }))
                    .filter(({ item }) => item.section === section)
                    .map(({ item, index }) => (
                      <ListItemButton
                        key={item.id}
                        selected={index === selectedIndex}
                        onClick={() => execute(item)}
                        onMouseEnter={() => setSelectedIndex(index)}
                      >
                        <ListItemIcon sx={{ minWidth: 32 }}>{item.icon}</ListItemIcon>
                        <ListItemText primary={item.label} secondary={item.hint} />
                      </ListItemButton>
                    ))}
                </List>
              </Box>
            ))
          )}
        </Box>
      </DialogContent>

      <CopyPasswordConfirmDialog
        open={Boolean(copyTarget)}
        entryName={copyTarget?.title}
        seconds={clipboardClearSeconds}
        onClose={() => setCopyTarget(null)}
        onConfirm={() => {
          const target = copyTarget;
          setCopyTarget(null);
          if (target) {
            void copyPassword(target.id);
          }
        }}
      />
    </Dialog>
  );
}
