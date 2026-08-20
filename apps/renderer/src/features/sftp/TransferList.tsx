import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import LinearProgress from '@mui/material/LinearProgress';
import type { TransferInfo } from '@ssh-central/ipc-contracts';

interface TransferListProps {
  transfers: TransferInfo[];
  t: (key: string) => string;
}

/** Fortschrittsliste laufender SFTP-Transfers. */
export function TransferList({ transfers, t }: TransferListProps) {
  return (
    <Box sx={{ borderTop: 1, borderColor: 'divider', maxHeight: 140, overflow: 'auto' }}>
      <List dense>
        {transfers.map((transfer) => {
          const pct = transfer.totalBytes > 0 ? Math.round((transfer.transferredBytes / transfer.totalBytes) * 100) : 0;
          return (
            <ListItem key={transfer.id} dense>
              <ListItemText
                primary={`${transfer.direction === 'upload' ? t('sftp.upload') : t('sftp.download')}: ${transfer.localPath} → ${transfer.remotePath}`}
                secondary={`${transfer.status} · ${pct}%`}
              />
              <Box sx={{ width: 200 }}>
                <LinearProgress variant="determinate" value={pct} color={transfer.status === 'error' ? 'error' : 'primary'} />
              </Box>
            </ListItem>
          );
        })}
      </List>
    </Box>
  );
}
