import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import RefreshIcon from '@mui/icons-material/Refresh';
import type { PluginInfo, PluginLogEntry } from '@ssh-central/ipc-contracts';
import { useTranslation } from '../../i18n/useTranslation.js';

interface PluginLogsDialogProps {
  open: boolean;
  plugins: PluginInfo[];
  onClose: () => void;
}

const LEVEL_COLOR: Record<string, string> = {
  info: 'text.secondary',
  warn: 'warning.main',
  error: 'error.main',
};

/** Zeigt Plugin-Logs, filterbar nach Plugin-ID (US-9.2). */
export function PluginLogsDialog({ open, plugins, onClose }: PluginLogsDialogProps) {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<PluginLogEntry[]>([]);
  const [filter, setFilter] = useState<string>('');

  async function refresh() {
    setLogs(await window.api.plugins.getLogs(filter || undefined));
  }

  useEffect(() => {
    if (open) {
      void refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, filter]);

  const visible = logs.filter((l) => !filter || l.plugin === filter);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{t('plugins.logsTitle')}</DialogTitle>
      <DialogContent sx={{ pt: '8px !important', display: 'flex', flexDirection: 'column', gap: 1, minHeight: 300 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Select size="small" value={filter} onChange={(e) => setFilter(e.target.value)} sx={{ minWidth: 180 }}>
            <MenuItem value="">{t('plugins.all')}</MenuItem>
            {plugins.map((p) => (
              <MenuItem key={p.name} value={p.name}>
                {p.name}
              </MenuItem>
            ))}
          </Select>
          <Box sx={{ flexGrow: 1 }} />
          <IconButton size="small" title={t('action.refresh')} onClick={() => void refresh()}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Box>
        {visible.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t('plugins.noLogs')}
          </Typography>
        ) : (
          <Box
            sx={{ overflow: 'auto', flex: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1 }}
          >
            {visible.map((entry, i) => (
              <Typography
                key={`${entry.plugin}-${entry.ts}-${i}`}
                variant="caption"
                sx={{ display: 'block', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}
                color={LEVEL_COLOR[entry.level] ?? 'text.secondary'}
              >
                {new Date(entry.ts).toLocaleTimeString()} [{entry.plugin}] {entry.message}
              </Typography>
            ))}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('action.close')}</Button>
      </DialogActions>
    </Dialog>
  );
}
