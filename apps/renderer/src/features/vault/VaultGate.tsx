import { useEffect, useState, type FormEvent } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import MenuItem from '@mui/material/MenuItem';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import AddIcon from '@mui/icons-material/Add';
import SettingsIcon from '@mui/icons-material/Settings';
import { useVaultStore } from '../../store/vault-store.js';
import { useSettingsStore } from '../../store/settings-store.js';
import { useTranslation } from '../../i18n/useTranslation.js';
import { MIN_MASTER_PASSWORD_LENGTH, type VaultMeta } from '@ssh-central/ipc-contracts';
import { UserSettingsDialog } from '../settings/UserSettingsDialog.js';
import { SystemBar } from '../../components/SystemBar.js';

/** Login-Screen: Datenbank wechseln, neue erstellen, entsperren. */
export function VaultGate() {
  const { t } = useTranslation();
  const { status, error, loading, check, list, switchVault, create, unlock } = useVaultStore();
  const showSystemBar = useSettingsStore((s) => s.user.showSystemBar);
  const [vaults, setVaults] = useState<VaultMeta[]>([]);
  const [activeName, setActiveName] = useState('');
  const [password, setPassword] = useState('');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupConfirm, setSetupConfirm] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newConfirm, setNewConfirm] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    void (async () => {
      await check();
      const v = await list();
      setVaults(v);
      setActiveName(v.find((x) => x.active)?.name ?? '');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshVaults() {
    const v = await list();
    setVaults(v);
  }

  async function handleSwitch(name: string) {
    setActiveName(name);
    setPassword('');
    setSetupPassword('');
    setSetupConfirm('');
    await switchVault(name);
  }

  async function handleCreateDatabase() {
    if (!newName.trim() || newPassword.length < MIN_MASTER_PASSWORD_LENGTH || newPassword !== newConfirm) {
      return;
    }
    await create(newName.trim(), newPassword);
    setCreateOpen(false);
    setNewName('');
    setNewPassword('');
    setNewConfirm('');
    await refreshVaults();
    setActiveName(newName.trim());
  }

  async function handleSetup(event: FormEvent) {
    event.preventDefault();
    if (activeName && setupPassword === setupConfirm && setupPassword.length >= MIN_MASTER_PASSWORD_LENGTH) {
      await create(activeName, setupPassword);
    }
  }

  async function handleUnlock(event: FormEvent) {
    event.preventDefault();
    await unlock(password);
  }

  if (status === 'checking') {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    );
  }

  const needsSetup = status === 'no-vault';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box
        sx={{ display: 'grid', placeItems: 'center', flex: 1, minHeight: 0, bgcolor: 'background.default', p: 2 }}
      >
        <Box
          sx={{
            display: 'flex',
          flexDirection: 'column',
          gap: 2,
          width: 400,
          maxWidth: '100%',
          p: 4,
          bgcolor: 'background.paper',
          borderRadius: 2,
        }}
      >
        <Box sx={{ textAlign: 'center', position: 'relative' }}>
          <Box
            component="img"
            src="/ssh-central-logo.png"
            alt={t('app.title')}
            sx={{ width: 88, height: 88, objectFit: 'contain', display: 'block', mx: 'auto' }}
          />
          {/* Geräteweite Settings schon auf dem Login-Screen öffnen (kein Unlock nötig). */}
          <Tooltip title={t('settings.user.title')}>
            <IconButton
              size="small"
              onClick={() => setSettingsOpen(true)}
              sx={{ position: 'absolute', top: 0, right: 0 }}
            >
              <SettingsIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
          <TextField
            select
            label={t('vault.selectDatabase')}
            value={activeName}
            onChange={(e) => void handleSwitch(e.target.value)}
            fullWidth
            size="small"
          >
            {vaults.map((v) => (
              <MenuItem key={v.name} value={v.name}>
                {v.name}
              </MenuItem>
            ))}
          </TextField>
          <Tooltip title={t('vault.newDatabase')}>
            <IconButton size="small" color="inherit" onClick={() => setCreateOpen(true)}>
              <AddIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        {error && <Alert severity="error">{error}</Alert>}

        {needsSetup ? (
          <form onSubmit={handleSetup} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <TextField
              label={t('vault.masterPassword')}
              type="password"
              value={setupPassword}
              onChange={(e) => setSetupPassword(e.target.value)}
              helperText={t('vault.masterPasswordMin')}
              fullWidth
              required
            />
            <TextField
              label={t('vault.confirmPassword')}
              type="password"
              value={setupConfirm}
              onChange={(e) => setSetupConfirm(e.target.value)}
              error={setupConfirm.length > 0 && setupConfirm !== setupPassword}
              helperText={setupConfirm.length > 0 && setupConfirm !== setupPassword ? t('vault.passwordMismatch') : ' '}
              fullWidth
              required
            />
            <Button type="submit" variant="contained" size="large" disabled={loading}>
              {loading ? <CircularProgress size={22} /> : t('vault.create')}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleUnlock} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <TextField label={t('vault.masterPassword')} type="password" value={password} onChange={(e) => setPassword(e.target.value)} fullWidth autoFocus required />
            <Button type="submit" variant="contained" size="large" disabled={loading}>
              {loading ? <CircularProgress size={22} /> : t('vault.unlock')}
            </Button>
          </form>
        )}
      </Box>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{t('vault.newDatabase')}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
          <TextField label={t('vault.databaseName')} value={newName} onChange={(e) => setNewName(e.target.value)} fullWidth required autoFocus />
          <TextField
            label={t('vault.masterPassword')}
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            helperText={t('vault.masterPasswordMin')}
            fullWidth
            required
          />
          <TextField
            label={t('vault.confirmPassword')}
            type="password"
            value={newConfirm}
            onChange={(e) => setNewConfirm(e.target.value)}
            error={newConfirm.length > 0 && newConfirm !== newPassword}
            helperText={newConfirm.length > 0 && newConfirm !== newPassword ? t('vault.passwordMismatch') : ' '}
            fullWidth
            required
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>{t('action.cancel')}</Button>
          <Button variant="contained" onClick={() => void handleCreateDatabase()} disabled={!newName.trim() || newPassword.length < MIN_MASTER_PASSWORD_LENGTH || newPassword !== newConfirm}>
            {t('vault.create')}
          </Button>
        </DialogActions>
      </Dialog>

        <UserSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </Box>
      {showSystemBar && <SystemBar />}
    </Box>
  );
}
