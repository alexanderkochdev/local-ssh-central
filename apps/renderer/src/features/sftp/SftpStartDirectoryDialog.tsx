import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Divider from '@mui/material/Divider';
import FolderIcon from '@mui/icons-material/Folder';
import HistoryIcon from '@mui/icons-material/History';
import BookmarkIcon from '@mui/icons-material/Bookmarks';
import type { StartOption } from './sftpStartOptions.js';

interface SftpStartDirectoryDialogProps {
  open: boolean;
  options: StartOption[];
  t: (key: string) => string;
  onSelect: (path: string) => void;
  onCancel: () => void;
}

function optionIcon(option: StartOption): React.ReactNode {
  if (option.key === 'home') {
    return <FolderIcon fontSize="small" sx={{ mr: 1.5, color: 'text.secondary' }} />;
  }
  if (option.key === 'last') {
    return <HistoryIcon fontSize="small" sx={{ mr: 1.5, color: 'text.secondary' }} />;
  }
  return <BookmarkIcon fontSize="small" sx={{ mr: 1.5, color: 'primary.main' }} />;
}

/** Dialog zur Wahl des SFTP-Startverzeichnisses (Home vs. letzter Standort vs. Lesezeichen). */
export function SftpStartDirectoryDialog({
  open,
  options,
  t,
  onSelect,
  onCancel,
}: SftpStartDirectoryDialogProps) {
  return (
    <Dialog open={open} onClose={onCancel} fullWidth maxWidth="xs">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <BookmarkIcon fontSize="small" />
        {t('sftp.startTitle')}
      </DialogTitle>
      <DialogContent sx={{ pt: '8px !important' }}>
        <List dense disablePadding>
          {options.map((option, index) => (
            <span key={option.key}>
              {index > 0 && <Divider />}
              <ListItemButton onClick={() => onSelect(option.path)}>
                {optionIcon(option)}
                <ListItemText
                  primary={option.label}
                  slotProps={{ secondary: { component: 'div' } }}
                  secondary={
                    <span>
                      <span>{option.path}</span>
                      {option.description && <span> · {option.description}</span>}
                    </span>
                  }
                />
              </ListItemButton>
            </span>
          ))}
        </List>
      </DialogContent>
    </Dialog>
  );
}
