import Box from '@mui/material/Box';
import { SftpView } from './SftpView.js';

interface SftpWindowProps {
  hostId: string;
}

/** Unabhaengiges SFTP-Fenster (Side-by-Side) fuer eine Host-Session. */
export function SftpWindow({ hostId }: SftpWindowProps) {
  return (
    <Box sx={{ height: '100%', width: '100%' }}>
      <SftpView initialHostId={hostId} />
    </Box>
  );
}
