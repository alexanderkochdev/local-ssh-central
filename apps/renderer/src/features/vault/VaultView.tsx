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
import { SortControl, type SortOption, type SortState } from '../../components/sorting/SortControl.js';
import { useSortedList } from '../../components/sorting/useSortedList.js';
import { FilterControl, type FilterState } from '../../components/filtering/FilterControl.js';
import { useFilteredList } from '../../components/filtering/useFilteredList.js';
import { PasswordEntryDialog } from './PasswordEntryDialog.js';
import { KeyGenerateDialog } from './KeyGenerateDialog.js';
import { KeyImportDialog } from './KeyImportDialog.js';

type TresorTab = 'passwords' | 'keys';

type PasswordSortKey = 'title' | 'userName';
type KeySortKey = 'title' | 'userName' | 'keyType' | 'fingerprint';

const PASSWORD_SORT_ACCESSORS: Record<PasswordSortKey, (entry: VaultEntrySummary) => unknown> = {
  title: (e) => e.title ?? '',
  userName: (e) => e.userName ?? '',
};

const KEY_SORT_ACCESSORS: Record<KeySortKey, (entry: VaultEntrySummary) => unknown> = {
  title: (e) => e.title ?? '',
  userName: (e) => e.userName ?? '',
  keyType: (e) => e.keyType ?? '',
  fingerprint: (e) => e.fingerprint ?? '',
};

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
  const [passwordSort, setPasswordSort] = useState<SortState<PasswordSortKey> | null>(null);
  const [keySort, setKeySort] = useState<SortState<KeySortKey> | null>(null);
  const [passwordFilter, setPasswordFilter] = useState<FilterState<PasswordSortKey> | null>(null);
  const [keyFilter, setKeyFilter] = useState<FilterState<KeySortKey> | null>(null);

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
  const filteredPasswords = useFilteredList(passwords, passwordFilter, PASSWORD_SORT_ACCESSORS);
  const filteredKeys = useFilteredList(keys, keyFilter, KEY_SORT_ACCESSORS);
  const sortedPasswords = useSortedList(filteredPasswords, passwordSort, PASSWORD_SORT_ACCESSORS);
  const sortedKeys = useSortedList(filteredKeys, keySort, KEY_SORT_ACCESSORS);

  const passwordSortOptions: SortOption<PasswordSortKey>[] = [
    { key: 'title', label: t('vault.entryTitle') },
    { key: 'userName', label: t('vault.username') },
  ];

  const keySortOptions: SortOption<KeySortKey>[] = [
    { key: 'title', label: t('vault.entryTitle') },
    { key: 'keyType', label: t('vault.keyType') },
    { key: 'fingerprint', label: t('vault.fingerprint') },
    { key: 'userName', label: t('vault.username') },
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Toolbar variant="dense" sx={{ gap: 1 }}>
        <Box sx={{ flexGrow: 1 }} />
        {tab === 'passwords' ? (
          <>
            <FilterControl options={passwordSortOptions} filter={passwordFilter} onChange={setPasswordFilter} />
            <SortControl options={passwordSortOptions} sort={passwordSort} onChange={setPasswordSort} />
          </>
        ) : (
          <>
            <FilterControl options={keySortOptions} filter={keyFilter} onChange={setKeyFilter} />
            <SortControl options={keySortOptions} sort={keySort} onChange={setKeySort} />
          </>
        )}
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
              data={sortedPasswords}
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
            data={sortedKeys}
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
