import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import { VAULT_SETTINGS_SECTIONS, type SettingValue, type VaultSettingsValues } from '@ssh-central/ipc-contracts';
import { useTranslation } from '../../i18n/useTranslation.js';
import { useSettingsStore } from '../../store/settings-store.js';
import { SettingsRenderer } from '../../components/settings/SettingsRenderer.js';

interface VaultSettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Pro-Vault-Einstellungen (Auto-Lock, SFTP-Parallelität, Datei-Openers) - werden in der
 * .kdbx gespeichert (portabel). Rendert den VAULT_SETTINGS_SECTIONS-Baum generisch.
 */
export function VaultSettingsDialog({ open, onClose }: VaultSettingsDialogProps) {
  const { t } = useTranslation();
  const vault = useSettingsStore((s) => s.vault);
  const setVault = useSettingsStore((s) => s.setVault);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('settings.vault.title')}</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column' }}>
        <SettingsRenderer
          sections={VAULT_SETTINGS_SECTIONS}
          values={vault as unknown as Record<string, SettingValue>}
          onChange={(key, value) =>
            setVault({ [key]: value } as Partial<VaultSettingsValues>)
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
