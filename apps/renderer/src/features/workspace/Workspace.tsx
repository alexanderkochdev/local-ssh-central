import { useEffect, useMemo, useState } from 'react';
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
import { PluginsDialog } from '../plugins/PluginsDialog.js';
import { PluginPanel } from '../plugins/PluginPanel.js';
import { useVaultStore } from '../../store/vault-store.js';
import { usePluginsStore } from '../../store/plugins-store.js';
import { useTranslation } from '../../i18n/useTranslation.js';

/**
 * Hauptfenster: Host-Verwaltung und Tresor (Passwort-Eintraege + SSH-Keychain).
 * Plugins koennen zusaetzliche Tabs neben Hosts/Tresor registrieren.
 * Terminal- und SFTP-Sessions laufen in eigenen, unabhaengigen Fenstern.
 */
export function Workspace() {
  const { t } = useTranslation();
  const [view, setView] = useState<string>('hosts');
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pluginsOpen, setPluginsOpen] = useState(false);
  const lock = useVaultStore((state) => state.lock);
  // WICHTIG: stabile Referenz selektieren und Tabs per useMemo ableiten - ein Selektor,
  // der ein neues Array erzeugt, wuerde eine Endlos-Render-Schleife ausloesen.
  const plugins = usePluginsStore((s) => s.plugins);
  const loadPlugins = usePluginsStore((s) => s.load);
  const pluginTabs = useMemo(
    () =>
      plugins.flatMap((p) =>
        p.tabs.map((tab) => ({ key: `plugin:${p.name}:${tab.id}`, label: tab.label })),
      ),
    [plugins],
  );

  useEffect(() => {
    void loadPlugins();
  }, [loadPlugins]);

  function renderView() {
    if (view.startsWith('plugin:')) {
      const [, plugin, tabId] = view.split(':');
      return <PluginPanel plugin={plugin!} tabId={tabId!} />;
    }
    if (view === 'vault') {
      return <VaultView />;
    }
    return <HostsView />;
  }

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
          <Tabs value={view} onChange={(_, next) => setView(next as string)}>
            <Tab label={t('tabs.hosts')} value="hosts" />
            <Tab label={t('tabs.vault')} value="vault" />
            {pluginTabs.map((tab) => (
              <Tab key={tab.key} label={tab.label} value={tab.key} />
            ))}
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
        <MenuItem
          onClick={() => {
            setMenuAnchor(null);
            setPluginsOpen(true);
          }}
        >
          {t('plugins.title')}
        </MenuItem>
      </Menu>

      <Box sx={{ flex: 1, minHeight: 0 }}>{renderView()}</Box>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ChangePasswordDialog open={passwordOpen} onClose={() => setPasswordOpen(false)} />
      <PluginsDialog open={pluginsOpen} onClose={() => setPluginsOpen(false)} />
    </Box>
  );
}
