import Box from '@mui/material/Box';
import { SftpView } from './SftpView.js';
import { NotificationBridge } from '../../components/NotificationBridge.js';
import { NotificationsContainer } from '../../components/NotificationsContainer.js';

interface SftpWindowProps {
  hostId: string;
}

/** Unabhaengiges SFTP-Fenster (Side-by-Side) fuer eine Host-Session. */
export function SftpWindow({ hostId }: SftpWindowProps) {
  return (
    <Box sx={{ height: '100%', width: '100%' }}>
      {/* Transfer-Aggregation + Toasts nur hier (nicht im Hauptfenster). */}
      <NotificationBridge sftp />
      <NotificationsContainer />
      <SftpView initialHostId={hostId} />
    </Box>
  );
}
