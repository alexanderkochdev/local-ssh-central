import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslation } from '../../i18n/useTranslation.js';
import type { PaneEntry } from './FilePane.js';

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
    return '—';
  }
  return new Date(ts).toLocaleString();
}

interface PropertiesDialogProps {
  entry: PaneEntry | null;
  onClose: () => void;
}

/** Details zu einer Datei/einem Ordner. */
export function PropertiesDialog({ entry, onClose }: PropertiesDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={Boolean(entry)} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('sftp.properties')}</DialogTitle>
      <DialogContent>
        {entry && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Row label={t('sftp.sortName')} value={entry.name} />
            <Row label={t('sftp.type')} value={entry.isDirectory ? t('sftp.folder') : t('sftp.file')} />
            <Row label={t('sftp.path')} value={entry.path} mono />
            {!entry.isDirectory && <Row label={t('sftp.size')} value={formatSize(entry.size)} />}
            <Row label={t('sftp.modified')} value={formatDate(entry.modifiedAt)} />
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('action.close')}</Button>
      </DialogActions>
    </Dialog>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <Box sx={{ display: 'flex', gap: 1 }}>
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 90 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={mono ? { fontFamily: 'monospace', wordBreak: 'break-all' } : {}}>
        {value}
      </Typography>
    </Box>
  );
}
