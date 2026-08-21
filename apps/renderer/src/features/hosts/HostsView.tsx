import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import Toolbar from '@mui/material/Toolbar';
import AddIcon from '@mui/icons-material/Add';
import TerminalIcon from '@mui/icons-material/Terminal';
import FolderSharedIcon from '@mui/icons-material/FolderShared';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CircularProgress from '@mui/material/CircularProgress';
import { EmptyState } from '@ssh-central/ui';
import { Virtuoso } from 'react-virtuoso';
import type { Host } from '@ssh-central/ipc-contracts';
import { useHostsStore } from '../../store/hosts-store.js';
import { useTranslation } from '../../i18n/useTranslation.js';
import { SortControl, type SortOption, type SortState } from '../../components/sorting/SortControl.js';
import { useSortedList } from '../../components/sorting/useSortedList.js';
import { FilterControl, type FilterState } from '../../components/filtering/FilterControl.js';
import { useFilteredList } from '../../components/filtering/useFilteredList.js';
import { HostFormDialog } from './HostFormDialog.js';

type HostSortKey = 'name' | 'host' | 'port' | 'username' | 'authMethod' | 'tags' | 'notes' | 'createdAt' | 'updatedAt';

const HOST_SORT_ACCESSORS: Record<HostSortKey, (host: Host) => unknown> = {
  name: (h) => h.name,
  host: (h) => h.host,
  port: (h) => h.port,
  username: (h) => h.username,
  authMethod: (h) => h.authMethod,
  tags: (h) => h.tags ?? [],
  notes: (h) => h.notes ?? '',
  createdAt: (h) => h.createdAt,
  updatedAt: (h) => h.updatedAt,
};

/** Virtuellisierte Host-Verwaltung mit vollem CRUD. Verbinden/SFTP oeffnen neue Fenster. */
export function HostsView() {
  const { t } = useTranslation();
  const { hosts, loading, load, remove } = useHostsStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Host | null>(null);
  const [sort, setSort] = useState<SortState<HostSortKey> | null>(null);
  const [filter, setFilter] = useState<FilterState<HostSortKey> | null>(null);
  const filteredHosts = useFilteredList(hosts, filter, HOST_SORT_ACCESSORS);
  const sortedHosts = useSortedList(filteredHosts, sort, HOST_SORT_ACCESSORS);

  const sortOptions: SortOption<HostSortKey>[] = [
    { key: 'name', label: t('hosts.name') },
    { key: 'host', label: t('hosts.address') },
    { key: 'port', label: t('hosts.port') },
    { key: 'username', label: t('hosts.username') },
    { key: 'authMethod', label: t('hosts.authMethod') },
    { key: 'tags', label: t('hosts.tagsShort') },
    { key: 'notes', label: t('hosts.notesShort') },
    { key: 'createdAt', label: t('hosts.createdAt') },
    { key: 'updatedAt', label: t('hosts.updatedAt') },
  ];

  useEffect(() => {
    void load();
  }, [load]);

  function connect(host: Host) {
    // Jede Session oeffnet ein eigenes, unabhaengiges Terminal-Fenster.
    window.api.windows.openTerminal(host.id);
  }

  function openSftp(host: Host) {
    window.api.windows.openSftp(host.id);
  }

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(host: Host) {
    setEditing(host);
    setDialogOpen(true);
  }

  function handleSaved() {
    setDialogOpen(false);
    setEditing(null);
  }

  function handleDelete(host: Host) {
    void remove(host.id);
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Toolbar variant="dense" sx={{ gap: 1 }}>
        <Box sx={{ flexGrow: 1 }} />
        <FilterControl options={sortOptions} filter={filter} onChange={setFilter} />
        <SortControl options={sortOptions} sort={sort} onChange={setSort} />
        <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={openCreate}>
          {t('hosts.add')}
        </Button>
      </Toolbar>

      {loading ? (
        <Box sx={{ display: 'grid', placeItems: 'center', flex: 1 }}>
          <CircularProgress />
        </Box>
      ) : hosts.length === 0 ? (
        <Box sx={{ flex: 1 }}>
          <EmptyState
            title={t('hosts.emptyTitle')}
            description={t('hosts.emptyDesc')}
            action={
              <Button startIcon={<AddIcon />} variant="contained" onClick={openCreate}>
                {t('hosts.addFirst')}
              </Button>
            }
          />
        </Box>
      ) : (
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <Virtuoso
            data={sortedHosts}
            itemContent={(_, host) => (
              <List dense>
                <ListItem
                  disablePadding
                  secondaryAction={
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <IconButton size="small" title={t('hosts.openTerminal')} onClick={() => connect(host)}>
                        <TerminalIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" title={t('hosts.openSftp')} onClick={() => openSftp(host)}>
                        <FolderSharedIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" title={t('action.edit')} onClick={() => openEdit(host)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" title={t('action.delete')} onClick={() => handleDelete(host)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  }
                >
                  <ListItemButton onClick={() => connect(host)}>
                    <ListItemText
                      primary={host.name}
                      secondary={
                        <Box component="span" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, pt: 0.5 }}>
                          <Typography component="span" variant="body2" color="text.secondary">
                            {`${host.username}@${host.host}:${host.port}`}
                          </Typography>
                          {(host.tags?.length ?? 0) > 0 && (
                            <Box component="span" sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                              {host.tags.map((tag) => (
                                <Chip key={tag} label={tag} size="small" variant="outlined" />
                              ))}
                            </Box>
                          )}
                          {host.notes && (
                            <Typography
                              component="span"
                              variant="caption"
                              color="text.secondary"
                              sx={{
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                              }}
                            >
                              {host.notes}
                            </Typography>
                          )}
                        </Box>
                      }
                    />
                  </ListItemButton>
                </ListItem>
              </List>
            )}
          />
        </Box>
      )}

      <HostFormDialog
        open={dialogOpen}
        host={editing}
        onClose={() => {
          setDialogOpen(false);
          setEditing(null);
        }}
        onSaved={handleSaved}
      />
    </Box>
  );
}

