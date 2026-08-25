import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import type { UpdateCheckResult } from '@ssh-central/ipc-contracts';
import { useTranslation } from '../../i18n/useTranslation.js';

interface UpdateDialogProps {
  /** Ergebnis des Update-Checks (nur anzeigen, wenn available + latest). */
  result: UpdateCheckResult | null;
  onClose: () => void;
}

/** Erinnert den User einmalig pro Start an ein verfuegbares Update (GitHub-Release). */
export function UpdateDialog({ result, onClose }: UpdateDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={Boolean(result?.available && result.latest)} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('update.title')}</DialogTitle>
      <DialogContent>
        <Alert severity="info">
          {t('update.body').replace('{version}', result?.latest ?? '')}
        </Alert>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('update.later')}</Button>
        <Button
          variant="contained"
          onClick={() => {
            if (result?.url) {
              window.api.update.open(result.url);
            }
            onClose();
          }}
        >
          {t('update.gotoRelease')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
