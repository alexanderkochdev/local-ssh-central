import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import { EmptyState } from '@ssh-central/ui';
import type { Host } from '@ssh-central/ipc-contracts';

interface ConnectViewProps {
  t: (key: string) => string;
  hosts: Host[];
  hostId: string;
  setHostId: (id: string) => void;
  openSftp: (host: string) => void;
  error: string | null;
  connecting: boolean;
  initialHostId?: string | null;
}

/** Verbindungs-UI fuer SFTP: Spinner, Retry oder Host-Auswahl. */
export function ConnectView({ t, hosts, hostId, setHostId, openSftp, error, connecting, initialHostId }: ConnectViewProps) {
  if (connecting) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    );
  }
  if (initialHostId) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center', justifyContent: 'center', height: '100%', p: 4 }}>
        {error && <Alert severity="error">{error}</Alert>}
        <Button variant="contained" onClick={() => openSftp(initialHostId)}>
          {t('sftp.retry')}
        </Button>
      </Box>
    );
  }
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center', justifyContent: 'center', height: '100%', p: 4 }}>
      <FormControl sx={{ minWidth: 320 }}>
        <InputLabel>{t('sftp.selectHost')}</InputLabel>
        <Select value={hostId} onChange={(e) => setHostId(e.target.value)} label={t('sftp.selectHost')}>
          {hosts.map((h) => (
            <MenuItem key={h.id} value={h.id}>
              {h.name} ({h.username}@{h.host})
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <Button variant="contained" onClick={() => hostId && openSftp(hostId)}>
        {t('sftp.connect')}
      </Button>
      {error && <Alert severity="error">{error}</Alert>}
      {hosts.length === 0 && (
        <EmptyState title={t('sftp.noHosts')} description={t('sftp.noHostsDesc')} />
      )}
    </Box>
  );
}
