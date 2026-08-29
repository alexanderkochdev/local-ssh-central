import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Tooltip from '@mui/material/Tooltip';
import CloseIcon from '@mui/icons-material/Close';
import StopIcon from '@mui/icons-material/Stop';
import { useAppDispatch, useAppSelector } from '../store/index.js';
import { cancelSftpTransfers, removeNotification } from '../store/notificationsSlice.js';

/** Stapel von Notifications unten rechts (im Haupt- bzw. SFTP-Fenster). */
export function NotificationsContainer() {
  const items = useAppSelector((s) => s.notifications.items);
  const dispatch = useAppDispatch();

  return (
    <Box
      sx={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: 2000,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        width: 360,
        maxWidth: '90vw',
      }}
    >
      {items.map((n) => (
        <Paper
          key={n.id}
          elevation={4}
          sx={{
            p: 1.5,
            color: n.type === 'error' ? 'error.contrastText' : n.type === 'success' ? 'success.contrastText' : 'inherit',
            bgcolor:
              n.type === 'error' ? 'error.main' : n.type === 'success' ? 'success.main' : 'background.paper',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" sx={{ flex: 1, fontWeight: 600 }}>
              {n.title}
            </Typography>
            {n.cancelable && (
              <Tooltip title="Abbrechen" arrow>
                <IconButton size="small" onClick={() => dispatch(cancelSftpTransfers())}>
                  <StopIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <IconButton size="small" disabled={n.cancelable} onClick={() => dispatch(removeNotification(n.id))}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
          {n.message && <Typography variant="caption">{n.message}</Typography>}
          {n.type === 'progress' && (
            <LinearProgress variant="determinate" value={n.progress ?? 0} sx={{ mt: 1 }} />
          )}
        </Paper>
      ))}
    </Box>
  );
}
