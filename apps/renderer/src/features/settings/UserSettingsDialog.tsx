import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import { USER_SETTINGS_SECTIONS, type SettingValue, type UserSettingsValues } from '@ssh-central/ipc-contracts';
import { useTranslation } from '../../i18n/useTranslation.js';
import { useSettingsStore } from '../../store/settings-store.js';
import { SettingsRenderer } from '../../components/settings/SettingsRenderer.js';

interface UserSettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Geräteweite Einstellungen (Theme, Sprache, Terminal, Debug) - verfuegbar schon auf dem
 * Login-Screen. Rendert den USER_SETTINGS_SECTIONS-Baum ueber die generische SettingsRenderer.
 */
export function UserSettingsDialog({ open, onClose }: UserSettingsDialogProps) {
  const { t } = useTranslation();
  const user = useSettingsStore((s) => s.user);
  const setUser = useSettingsStore((s) => s.setUser);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('settings.user.title')}</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column' }}>
        <SettingsRenderer
          sections={USER_SETTINGS_SECTIONS}
          values={user as unknown as Record<string, SettingValue>}
          onChange={(key, value) =>
            setUser({ [key]: value } as Partial<UserSettingsValues>)
          }
          t={t}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('action.close')}</Button>
      </DialogActions>
    </Dialog>
  );
}
