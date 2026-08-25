import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';
import { useTranslation } from '../../i18n/useTranslation.js';

interface CopyPasswordConfirmDialogProps {
  open: boolean;
  /** Optionaler Anzeigename des Eintrags (z.B. "GitHub"). */
  entryName?: string;
  /** Auto-Clear-Frist in Sekunden aus den Vault-Settings (0 = nie leeren). */
  seconds: number;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * Sicherheits-Bestaetigung vor dem Kopieren eines Vault-Passworts in die Zwischenablage.
 * Das Passwort wird als Klartext in die Zwischenablage gelegt - der User muss dem
 * bewusst zustimmen, bevor der Clipboard-Guard (Auto-Clear nach konfigurierter Zeit) greift.
 */
export function CopyPasswordConfirmDialog({
  open,
  entryName,
  seconds,
  onClose,
  onConfirm,
}: CopyPasswordConfirmDialogProps) {
  const { t } = useTranslation();
  const body =
    seconds > 0
      ? t('clipboard.confirmBody').replace('{seconds}', String(seconds))
      : t('clipboard.confirmBodyNever');

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('clipboard.confirmTitle')}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Alert severity="warning">{body}</Alert>
        {entryName && (
          <Typography variant="body2" color="text.secondary">
            {`${t('clipboard.confirmEntry')}: ${entryName}`}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('action.cancel')}</Button>
        <Button variant="contained" onClick={onConfirm}>
          {t('action.copy')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
