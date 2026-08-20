import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
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
import { HostFormDialog } from './HostFormDialog.js';

/** Virtuellisierte Host-Verwaltung mit vollem CRUD. Verbinden/SFTP oeffnen neue Fenster. */
export function HostsView() {
  const { t } = useTranslation();
  const { hosts, loading, load, remove } = useHostsStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Host | null>(null);

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
            data={hosts}
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
                      secondary={`${host.username}@${host.host}:${host.port}`}
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

