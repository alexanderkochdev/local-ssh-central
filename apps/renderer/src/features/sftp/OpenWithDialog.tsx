import { useEffect, useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import ListItemIcon from '@mui/material/ListItemIcon';
import Checkbox from '@mui/material/Checkbox';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import AppsIcon from '@mui/icons-material/Apps';
import CircularProgress from '@mui/material/CircularProgress';
import type { OpenerInfo } from '@ssh-central/ipc-contracts';
import { useTranslation } from '../../i18n/useTranslation.js';

interface OpenWithDialogProps {
  open: boolean;
  fileName: string;
  onClose: () => void;
  /** openerId + ob fuer diese Dateiendung gemerkt werden soll. */
  onOpen: (openerId: string, remember: boolean) => void;
}

/** Waehlt ein Programm zum Oeffnen einer Datei (mit "fuer Endung merken"). */
export function OpenWithDialog({ open, fileName, onClose, onOpen }: OpenWithDialogProps) {
  const { t } = useTranslation();
  const [openers, setOpeners] = useState<OpenerInfo[]>([]);
  const [remember, setRemember] = useState(true);
  const ext = getExt(fileName);

  useEffect(() => {
    if (open) {
      setRemember(true);
      void window.api.fs.listOpeners().then(setOpeners);
    }
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('sftp.openWith')}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1, wordBreak: 'break-all' }}>
          {fileName}
          {ext ? ` (${ext.toUpperCase()})` : ''}
        </Typography>
        <List dense>
          <ListItemButton onClick={() => onOpen('default', remember)}>
            <ListItemIcon sx={{ minWidth: 32 }}>
              <AppsIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary={t('sftp.systemDefault')} />
          </ListItemButton>
          {openers.length === 0 ? (
            <Box sx={{ display: 'grid', placeItems: 'center', p: 2 }}>
              <CircularProgress size={22} />
            </Box>
          ) : (
            openers.map((o) => (
              <ListItemButton key={o.id} onClick={() => onOpen(o.id, remember)}>
                <ListItemIcon sx={{ minWidth: 32 }}>
                  <OpenInNewIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText primary={o.name} secondary={o.command} />
              </ListItemButton>
            ))
          )}
        </List>
        <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
          <Checkbox size="small" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <Typography variant="body2">
            {ext ? `${t('sftp.alwaysWithProgram')} (${ext.toUpperCase()})` : t('settings.never')}
          </Typography>
        </Box>
      </DialogContent>
    </Dialog>
  );
}

export function getExt(name: string): string {
  const idx = name.lastIndexOf('.');
  if (idx <= 0 || idx === name.length - 1) {
    return '';
  }
  return name.slice(idx + 1).toLowerCase();
}
