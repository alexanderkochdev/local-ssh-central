import { useEffect, useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { OpenerInfo } from '@ssh-central/ipc-contracts';
import { useTranslation } from '../../i18n/useTranslation.js';
import { useSettingsStore } from '../../store/settings-store.js';
import type { Locale } from '../../i18n/translations.js';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

/** Einstellungen: Sprache (i18n), Design, Terminal, Auto-Lock, SFTP-Parallelitaet. */
export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const { t } = useTranslation();
  const settings = useSettingsStore((s) => s.settings);
  const set = useSettingsStore((s) => s.set);
  const [openers, setOpeners] = useState<OpenerInfo[]>([]);
  const [openersLoaded, setOpenersLoaded] = useState(false);

  useEffect(() => {
    if (open) {
      setOpenersLoaded(false);
      void window.api.fs.listOpeners().then((list) => {
        setOpeners(list);
        setOpenersLoaded(true);
      });
    }
  }, [open]);

  function setLanguage(language: Locale) {
    set({ language });
  }

  function setAutoLock(minutes: number) {
    set({ autoLockMinutes: minutes });
    window.api.settings.setAutoLock(minutes);
  }

  function setConcurrency(n: number) {
    set({ sftpConcurrency: n });
    window.api.settings.setSftpConcurrency(n);
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('settings.title')}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: '8px !important' }}>
        <Box>
          <Typography variant="subtitle2">{t('settings.language')}</Typography>
          <TextField select value={settings.language} onChange={(e) => setLanguage(e.target.value as Locale)} fullWidth size="small">
            <MenuItem value="de">Deutsch</MenuItem>
            <MenuItem value="en">English</MenuItem>
          </TextField>
        </Box>

        <Box>
          <Typography variant="subtitle2">{t('settings.theme')}</Typography>
          <TextField select value={settings.theme} onChange={(e) => set({ theme: e.target.value as 'dark' | 'light' })} fullWidth size="small">
            <MenuItem value="dark">{t('settings.dark')}</MenuItem>
            <MenuItem value="light">{t('settings.light')}</MenuItem>
          </TextField>
        </Box>

        <Box>
          <Typography variant="subtitle2">{t('settings.terminalFontSize')}</Typography>
          <TextField
            type="number"
            value={settings.terminalFontSize}
            onChange={(e) => set({ terminalFontSize: Math.max(8, Math.min(24, Number(e.target.value) || 13)) })}
            fullWidth
            size="small"
          />
        </Box>

        <Box>
          <Typography variant="subtitle2">{t('settings.autoLock')}</Typography>
          <TextField select value={settings.autoLockMinutes} onChange={(e) => setAutoLock(Number(e.target.value))} fullWidth size="small">
            <MenuItem value={0}>{t('settings.never')}</MenuItem>
            <MenuItem value={5}>5 {t('settings.minutes')}</MenuItem>
            <MenuItem value={15}>15 {t('settings.minutes')}</MenuItem>
            <MenuItem value={30}>30 {t('settings.minutes')}</MenuItem>
            <MenuItem value={60}>60 {t('settings.minutes')}</MenuItem>
          </TextField>
        </Box>

        <Box>
          <Typography variant="subtitle2">{t('settings.sftpConcurrency')}</Typography>
          <TextField
            type="number"
            value={settings.sftpConcurrency}
            onChange={(e) => setConcurrency(Number(e.target.value) || 3)}
            fullWidth
            size="small"
            slotProps={{ htmlInput: { min: 1, max: 16 } }}
          />
        </Box>

        <Box>
          <Typography variant="subtitle2">{t('settings.defaultOpener')}</Typography>
          {/* Select erst rendern, wenn die Opener-Liste geladen ist - sonst wuerde der
              gespeicherte Wert (z.B. 'vscode') vor dem Laden als out-of-range gemeldet. */}
          {!openersLoaded ? (
            <TextField select value="" disabled fullWidth size="small">
              <MenuItem value="">…</MenuItem>
            </TextField>
          ) : (
            <TextField select value={settings.defaultOpener} onChange={(e) => set({ defaultOpener: e.target.value })} fullWidth size="small">
              <MenuItem value="default">{t('sftp.systemDefault')}</MenuItem>
              <MenuItem value="__ask__">{t('settings.alwaysAsk')}</MenuItem>
              {openers.map((o) => (
                <MenuItem key={o.id} value={o.id}>
                  {o.name}
                </MenuItem>
              ))}
            </TextField>
          )}
        </Box>

        <FormControlLabel
          control={<Switch checked={settings.showDebugLog} onChange={(e) => set({ showDebugLog: e.target.checked })} />}
          label={t('settings.showDebug')}
        />

        {Object.keys(settings.fileOpeners).length > 0 && (
          <Box>
            <Typography variant="subtitle2">{t('settings.fileOpeners')}</Typography>
            {Object.entries(settings.fileOpeners).map(([ext, opener]) => (
              <Box key={ext} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" sx={{ flex: 1, fontFamily: 'monospace' }}>
                  .{ext} → {opener}
                </Typography>
                <Button
                  size="small"
                  onClick={() => {
                    const next = { ...settings.fileOpeners };
                    delete next[ext];
                    set({ fileOpeners: next });
                  }}
                >
                  {t('settings.remove')}
                </Button>
              </Box>
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
