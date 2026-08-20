import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Button from '@mui/material/Button';
import Toolbar from '@mui/material/Toolbar';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Chip from '@mui/material/Chip';
import AddIcon from '@mui/icons-material/Add';
import KeyIcon from '@mui/icons-material/Key';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CircularProgress from '@mui/material/CircularProgress';
import { EmptyState } from '@ssh-central/ui';
import { Virtuoso } from 'react-virtuoso';
import type { VaultEntrySummary } from '@ssh-central/ipc-contracts';
import { useTranslation } from '../../i18n/useTranslation.js';
import { PasswordEntryDialog } from './PasswordEntryDialog.js';
import { KeyGenerateDialog } from './KeyGenerateDialog.js';
import { KeyImportDialog } from './KeyImportDialog.js';

type TresorTab = 'passwords' | 'keys';

/**
 * Tresor-Ansicht: verwaltet Username:Passwort-Eintraege UND den SSH-Keychain
 * (Keys generieren/importieren/loeschen). Alles wird verschluesselt im KDBX-Vault gespeichert.
 */
export function VaultView() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TresorTab>('passwords');
  const [entries, setEntries] = useState<VaultEntrySummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<VaultEntrySummary | null>(null);
  const [genOpen, setGenOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      setEntries(await window.api.vault.entries.list());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function removeEntry(id: string) {
    await window.api.vault.entries.remove({ id });
    await refresh();
  }

  const passwords = entries.filter((e) => !e.hasKeyData);
  const keys = entries.filter((e) => e.hasKeyData);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Toolbar variant="dense" sx={{ gap: 1 }}>
        <Box sx={{ flexGrow: 1 }} />
        {tab === 'passwords' ? (
          <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => { setEditingEntry(null); setPwOpen(true); }}>
            {t('vault.addPassword')}
          </Button>
        ) : (
          <>
            <Button startIcon={<KeyIcon />} variant="outlined" size="small" onClick={() => setGenOpen(true)}>
              {t('vault.generateKey')}
            </Button>
            <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => setImportOpen(true)}>
              {t('vault.importKey')}
            </Button>
          </>
        )}
      </Toolbar>

      <Tabs value={tab} onChange={(_, next) => setTab(next as TresorTab)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tab label={`${t('vault.passwords')} (${passwords.length})`} value="passwords" />
        <Tab label={`${t('vault.keys')} (${keys.length})`} value="keys" />
      </Tabs>

      {loading ? (
        <Box sx={{ display: 'grid', placeItems: 'center', flex: 1 }}>
          <CircularProgress />
        </Box>
      ) : tab === 'passwords' ? (
        passwords.length === 0 ? (
          <EmptyState title={t('vault.noPasswords')} description={t('vault.noPasswordsDesc')} />
        ) : (
          <Box sx={{ flex: 1, minHeight: 0 }}>
            <Virtuoso
              data={passwords}
              itemContent={(_, entry) => (
                <List dense>
                  <ListItem
                    disablePadding
                    secondaryAction={
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <IconButton size="small" title={t('action.edit')} onClick={() => { setEditingEntry(entry); setPwOpen(true); }}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" title={t('action.delete')} onClick={() => void removeEntry(entry.id)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    }
                  >
                    <ListItemButton onClick={() => { setEditingEntry(entry); setPwOpen(true); }}>
                      <ListItemText primary={entry.title || t('vault.untitled')} secondary={entry.userName || ''} />
                    </ListItemButton>
                  </ListItem>
                </List>
              )}
            />
          </Box>
        )
      ) : keys.length === 0 ? (
        <EmptyState title={t('vault.noKeys')} description={t('vault.noKeysDesc')} />
      ) : (
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <Virtuoso
            data={keys}
            itemContent={(_, entry) => (
              <List dense>
                <ListItem
                  disablePadding
                  secondaryAction={
                    <IconButton size="small" title={t('action.delete')} onClick={() => void removeEntry(entry.id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  }
                >
                  <ListItemButton>
                    <ListItemText
                      primary={entry.title || 'SSH Key'}
                      secondary={entry.fingerprint || entry.keyType || ''}
                      sx={{ '& .MuiListItemText-secondary': { fontFamily: 'monospace' } }}
                    />
                    <Chip size="small" label={entry.keyType ?? 'key'} color="secondary" />
                  </ListItemButton>
                </ListItem>
              </List>
            )}
          />
        </Box>
      )}

      <PasswordEntryDialog
        open={pwOpen}
        entry={editingEntry}
        onClose={() => setPwOpen(false)}
        onSaved={() => { setPwOpen(false); setEditingEntry(null); void refresh(); }}
      />
      <KeyGenerateDialog open={genOpen} onClose={() => setGenOpen(false)} onSaved={() => { setGenOpen(false); void refresh(); }} />
      <KeyImportDialog open={importOpen} onClose={() => setImportOpen(false)} onSaved={() => { setImportOpen(false); void refresh(); }} />
    </Box>
  );
}
