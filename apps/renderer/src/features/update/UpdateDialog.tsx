import { useEffect, useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { AutoUpdateState, UpdateCheckResult } from '@ssh-central/ipc-contracts';
import { useTranslation } from '../../i18n/useTranslation.js';
import { formatUpdateProgress } from './progress.js';

interface UpdateDialogProps {
  /** Ergebnis des Update-Checks (nur anzeigen, wenn available + latest). */
  result: UpdateCheckResult | null;
  onClose: () => void;
}

/**
 * Erinnert einmalig pro Start an ein verfuegbares Update (GitHub-Release).
 *
 * Kann sich der Build selbst aktualisieren (`canAutoUpdate`, also Windows-Installation oder
 * Linux-AppImage), laedt der Dialog das Update direkt herunter und installiert es nach
 * Bestaetigung mit einem Neustart. Sonst fuehrt der Button auf die Release-Seite
 * (.deb wird vom Paketmanager verwaltet, im Dev-Modus gibt es nichts zu ersetzen).
 */
export function UpdateDialog({ result, onClose }: UpdateDialogProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<AutoUpdateState | null>(null);

  // Fortschritt des In-App-Downloads (Main -> Renderer).
  useEffect(() => {
    return window.api.update.onState(setState);
  }, []);

  const open = Boolean(result?.available && result.latest);
  const version = result?.latest ?? '';
  const stage = state?.stage ?? 'idle';
  const isDownloading = stage === 'downloading';
  const isDownloaded = stage === 'downloaded';
  const isFailed = stage === 'error';
  // Nach dem Start des Downloads darf der Dialog nicht mehr weggeklickt werden, damit der
  // User den Abschluss (Neustart-Angebot) nicht verpasst.
  const canDismiss = !isDownloading;

  const body = isFailed
    ? (state?.message ?? t('update.failed'))
    : isDownloaded
      ? t('update.readyToInstall').replace('{version}', version)
      : t('update.body').replace('{version}', version);

  return (
    <Dialog
      open={open}
      onClose={canDismiss ? onClose : undefined}
      fullWidth
      maxWidth="xs"
      aria-label={t('update.title')}
    >
      <DialogTitle>{t('update.title')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Alert severity={isFailed ? 'error' : isDownloaded ? 'success' : 'info'}>{body}</Alert>
          {isDownloading ? (
            <Stack spacing={0.5}>
              <LinearProgress variant="determinate" value={state?.percent ?? 0} />
              <Typography variant="caption" color="text.secondary">
                {formatUpdateProgress(state)}
              </Typography>
            </Stack>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={!canDismiss}>
          {t('update.later')}
        </Button>
        {isDownloaded ? (
          <Button variant="contained" onClick={() => window.api.update.install()}>
            {t('update.restartAndInstall')}
          </Button>
        ) : result?.canAutoUpdate && !isFailed ? (
          <Button
            variant="contained"
            disabled={isDownloading}
            onClick={() => {
              void window.api.update.download();
            }}
          >
            {isDownloading ? t('update.downloading') : t('update.downloadAndInstall')}
          </Button>
        ) : (
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
        )}
      </DialogActions>
    </Dialog>
  );
}
