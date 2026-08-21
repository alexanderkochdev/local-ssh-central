import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import type { PluginPermission } from '@ssh-central/ipc-contracts';
import { usePluginsStore } from '../../store/plugins-store.js';
import { useTranslation } from '../../i18n/useTranslation.js';
import { PluginLogsDialog } from './PluginLogsDialog.js';

interface PluginsDialogProps {
  open: boolean;
  onClose: () => void;
}

const ALL_PERMISSIONS: PluginPermission[] = ['hosts', 'terminal', 'sftp', 'windows'];

/** Verwaltet lokal installierte Plugins: Liste, ZIP-Installation, Enable/Disable, Berechtigungen, Daten. */
export function PluginsDialog({ open, onClose }: PluginsDialogProps) {
  const { t } = useTranslation();
  const { plugins, loading, error, load, install, uninstall } = usePluginsStore();
  const [notice, setNotice] = useState<string | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);

  async function reload() {
    await load();
    setNotice(null);
  }
  useEffect(() => {
    if (open) {
      void load();
    }
  }, [open, load]);

  async function toggleEnabled(name: string, enabled: boolean) {
    await window.api.plugins.setEnabled({ name, enabled });
    await reload();
  }
  async function togglePermission(name: string, permission: PluginPermission, granted: boolean) {
    if (granted) {
      await window.api.plugins.grantPermission({ plugin: name, permission });
    } else {
      await window.api.plugins.revokePermission({ plugin: name, permission });
    }
    await reload();
  }
  async function clearData(name: string) {
    await window.api.plugins.storageClear(name);
    setNotice(t('plugins.dataCleared'));
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('plugins.title')}</DialogTitle>
      <DialogContent sx={{ pt: '8px !important', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {error && <Alert severity="error">{error}</Alert>}
        {notice && <Alert severity="success">{notice}</Alert>}
        {loading ? (
          <Box sx={{ display: 'grid', placeItems: 'center', py: 3 }}>
            <CircularProgress />
          </Box>
        ) : plugins.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t('plugins.empty')}
          </Typography>
        ) : (
          <List dense disablePadding sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {plugins.map((plugin) => (
              <Box key={plugin.name} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1 }}>
                <ListItem disablePadding>
                  <ListItemText
                    primary={plugin.name}
                    secondary={`v${plugin.version}${plugin.tabs.length > 0 ? ` · ${plugin.tabs.length} Tab(s)` : ''}`}
                  />
                  <FormControlLabel
                    control={
                      <Switch size="small" checked={plugin.enabled} onChange={(e) => void toggleEnabled(plugin.name, e.target.checked)} />
                    }
                    label={plugin.enabled ? t('plugins.enabled') : t('plugins.disabled')}
                  />
                  <IconButton size="small" title={t('plugins.clearData')} onClick={() => void clearData(plugin.name)}>
                    <DeleteSweepIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" title={t('action.delete')} onClick={() => void uninstall(plugin.name)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </ListItem>
                <Box sx={{ pl: 2, pt: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">
                    {t('plugins.permissions')}
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {ALL_PERMISSIONS.map((perm) => {
                      const granted = plugin.permissions.includes(perm);
                      return (
                        <FormControlLabel
                          key={perm}
                          control={
                            <Switch
                              size="small"
                              checked={granted}
                              onChange={(e) => void togglePermission(plugin.name, perm, e.target.checked)}
                            />
                          }
                          label={perm}
                        />
                      );
                    })}
                  </Box>
                </Box>
              </Box>
            ))}
          </List>
        )}
        <Typography variant="caption" color="text.secondary">
          {t('plugins.tabsHint')}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('action.close')}</Button>
        <Button onClick={() => setLogsOpen(true)}>{t('plugins.logs')}</Button>
        <Button startIcon={<AddIcon />} variant="contained" onClick={() => void install()} disabled={loading}>
          {t('plugins.install')}
        </Button>
      </DialogActions>
      <PluginLogsDialog open={logsOpen} plugins={plugins} onClose={() => setLogsOpen(false)} />
    </Dialog>
  );
}
