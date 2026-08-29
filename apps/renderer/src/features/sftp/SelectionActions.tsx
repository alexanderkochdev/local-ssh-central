import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import SaveAltIcon from '@mui/icons-material/SaveAlt';
import UploadIcon from '@mui/icons-material/Upload';
import type { Side } from './useSftpActions.js';

interface SelectionActionsProps {
  side: Side;
  t: (key: string) => string;
  /** Lokal: Upload zur Remote-Seite. Remote: Download in den aktuellen lokalen Ordner. */
  onTransfer: () => void;
  /** Nur remote: Ziel per nativem Dialog waehlen ("Herunterladen zu ..."). */
  onDownloadAs?: () => void;
  onCopy: () => void;
  onCut: () => void;
  onDelete: () => void;
}

/**
 * Aktionen fuer die aktuelle Mehrfachauswahl - bewusst nur Icons (die Panes sind schmal),
 * die Beschriftung liefert der Tooltip.
 */
export function SelectionActions({
  side,
  t,
  onTransfer,
  onDownloadAs,
  onCopy,
  onCut,
  onDelete,
}: SelectionActionsProps) {
  const transferLabel = side === 'local' ? t('sftp.upload') : t('sftp.download');
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
      <Tooltip title={transferLabel}>
        <IconButton size="small" color="primary" onClick={onTransfer} aria-label={transferLabel}>
          {side === 'local' ? <UploadIcon fontSize="small" /> : <DownloadIcon fontSize="small" />}
        </IconButton>
      </Tooltip>
      {onDownloadAs && (
        <Tooltip title={t('sftp.downloadTo')}>
          <IconButton size="small" color="primary" onClick={onDownloadAs} aria-label={t('sftp.downloadTo')}>
            <SaveAltIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
      <Tooltip title={t('sftp.copy')}>
        <IconButton size="small" onClick={onCopy} aria-label={t('sftp.copy')}>
          <ContentCopyIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title={t('sftp.cut')}>
        <IconButton size="small" onClick={onCut} aria-label={t('sftp.cut')}>
          <ContentCutIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title={t('action.delete')}>
        <IconButton size="small" color="error" onClick={onDelete} aria-label={t('action.delete')}>
          <DeleteIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
}
