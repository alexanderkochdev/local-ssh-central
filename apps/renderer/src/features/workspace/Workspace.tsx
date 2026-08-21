import { useState } from 'react';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Box from '@mui/material/Box';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import LockIcon from '@mui/icons-material/Lock';
import { HostsView } from '../hosts/HostsView.js';
import { VaultView } from '../vault/VaultView.js';
import { ChangePasswordDialog } from '../vault/ChangePasswordDialog.js';
import { SettingsDialog } from '../settings/SettingsDialog.js';
import { useVaultStore } from '../../store/vault-store.js';
import { useTranslation } from '../../i18n/useTranslation.js';

type ViewId = 'hosts' | 'vault';

/**
 * Hauptfenster: Host-Verwaltung und Tresor (Passwort-Eintraege + SSH-Keychain).
 * Terminal- und SFTP-Sessions laufen in eigenen, unabhaengigen Fenstern.
 */
export function Workspace() {
  const { t } = useTranslation();
  const [view, setView] = useState<ViewId>('hosts');
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const lock = useVaultStore((state) => state.lock);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <AppBar position="static" color="transparent" elevation={0}>
        <Toolbar variant="dense">
          <Box
            component="img"
            src="/ssh-central-logo.png"
            alt={t('app.title')}
            sx={{ height: 32, width: 'auto', objectFit: 'contain', mr: 2 }}
          />
          <Tabs value={view} onChange={(_, next) => setView(next as ViewId)}>
            <Tab label={t('tabs.hosts')} value="hosts" />
            <Tab label={t('tabs.vault')} value="vault" />
          </Tabs>
          <Box sx={{ flexGrow: 1 }} />
          <IconButton title={t('menu.options')} onClick={(e) => setMenuAnchor(e.currentTarget)}>
            <MoreVertIcon />
          </IconButton>
          <IconButton title={t('action.lock')} onClick={() => void lock()}>
            <LockIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        <MenuItem
          onClick={() => {
            setMenuAnchor(null);
            setSettingsOpen(true);
          }}
        >
          {t('settings.title')}
        </MenuItem>
        <MenuItem
          onClick={() => {
            setMenuAnchor(null);
            setPasswordOpen(true);
          }}
        >
          {t('menu.changeMasterPassword')}
        </MenuItem>
      </Menu>

      <Box sx={{ flex: 1, minHeight: 0 }}>
        {view === 'hosts' && <HostsView />}
        {view === 'vault' && <VaultView />}
      </Box>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ChangePasswordDialog open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </Box>
  );
}
