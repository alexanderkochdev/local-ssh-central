import { useEffect } from 'react';
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
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { usePluginsStore } from '../../store/plugins-store.js';
import { useTranslation } from '../../i18n/useTranslation.js';

interface PluginsDialogProps {
  open: boolean;
  onClose: () => void;
}

/** Verwaltet lokal installierte Plugins: Liste, ZIP-Installation, Deinstallation. */
export function PluginsDialog({ open, onClose }: PluginsDialogProps) {
  const { t } = useTranslation();
  const { plugins, loading, error, load, install, uninstall } = usePluginsStore();

  useEffect(() => {
    if (open) {
      void load();
    }
  }, [open, load]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('plugins.title')}</DialogTitle>
      <DialogContent sx={{ pt: '8px !important', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {error && <Alert severity="error">{error}</Alert>}
        {loading ? (
          <Box sx={{ display: 'grid', placeItems: 'center', py: 3 }}>
            <CircularProgress />
          </Box>
        ) : plugins.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t('plugins.empty')}
          </Typography>
        ) : (
          <List dense disablePadding>
            {plugins.map((plugin) => (
              <ListItem
                key={plugin.name}
                disablePadding
                secondaryAction={
                  <IconButton size="small" title={t('action.delete')} onClick={() => void uninstall(plugin.name)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                }
              >
                <ListItemText
                  primary={plugin.name}
                  secondary={`v${plugin.version}${plugin.tabs.length > 0 ? ` · ${plugin.tabs.length} Tab(s)` : ''}`}
                />
              </ListItem>
            ))}
          </List>
        )}
        <Typography variant="caption" color="text.secondary">
          {t('plugins.tabsHint')}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('action.close')}</Button>
        <Button startIcon={<AddIcon />} variant="contained" onClick={() => void install()} disabled={loading}>
          {t('plugins.install')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
