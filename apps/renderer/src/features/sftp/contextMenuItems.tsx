import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import SaveAltIcon from '@mui/icons-material/SaveAlt';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import DeleteIcon from '@mui/icons-material/Delete';
import InfoIcon from '@mui/icons-material/Info';
import CreateNewFolderIcon from '@mui/icons-material/CreateNewFolder';
import NoteAddIcon from '@mui/icons-material/NoteAdd';
import CodeIcon from '@mui/icons-material/Code';
import RefreshIcon from '@mui/icons-material/Refresh';
import type { ContextMenuItem } from './ContextMenu.js';
import type { PaneEntry } from './FilePane.js';
import type { Side, SftpActions } from './useSftpActions.js';

interface BuildOptions {
  t: (key: string) => string;
  side: Side;
  entry: PaneEntry | null;
  hasClipboard: boolean;
  actions: SftpActions;
  refresh: () => void;
  onProperties: (entry: PaneEntry) => void;
}

/** Baut die Kontextmenue-Eintraege fuer ein Item oder die leere Flaeche. */
export function buildContextMenuItems({
  t,
  side,
  entry,
  hasClipboard,
  actions,
  refresh,
  onProperties,
}: BuildOptions): ContextMenuItem[] {
  const items: ContextMenuItem[] = [];
  if (entry) {
    items.push({
      label: t('sftp.open'),
      icon: <OpenInNewIcon fontSize="small" />,
      onClick: () => actions.openEntry(side, entry),
    });
    items.push({
      label: side === 'local' ? t('sftp.upload') : t('sftp.download'),
      icon: side === 'local' ? <UploadFileIcon fontSize="small" /> : <DownloadIcon fontSize="small" />,
      onClick: () => (side === 'local' ? actions.uploadEntry(entry) : actions.downloadEntry(entry)),
      dividerBefore: true,
    });
    if (side === 'remote') {
      items.push({
        label: t('sftp.downloadTo'),
        icon: <SaveAltIcon fontSize="small" />,
        onClick: () => void actions.downloadAs([entry]),
      });
    }
    items.push({
      label: t('sftp.copyPath'),
      icon: <ContentCopyIcon fontSize="small" />,
      onClick: () => void actions.copyPath(entry.path),
      dividerBefore: true,
    });
    items.push({
      label: t('sftp.copy'),
      icon: <ContentCopyIcon fontSize="small" />,
      onClick: () => actions.setClipboard({ side, entries: [entry], mode: 'copy' }),
    });
    items.push({
      label: t('sftp.cut'),
      icon: <ContentCutIcon fontSize="small" />,
      onClick: () => actions.setClipboard({ side, entries: [entry], mode: 'cut' }),
    });
    items.push({
      label: t('sftp.paste'),
      icon: <ContentPasteIcon fontSize="small" />,
      disabled: !hasClipboard,
      onClick: () => void actions.pasteInto(side),
      dividerBefore: true,
    });
    items.push({
      label: t('sftp.rename'),
      icon: <DriveFileRenameOutlineIcon fontSize="small" />,
      onClick: () => actions.setRenameTarget({ side, entry }),
      dividerBefore: true,
    });
    items.push({
      label: t('action.delete'),
      icon: <DeleteIcon fontSize="small" />,
      danger: true,
      onClick: () => actions.confirmDelete(side, entry),
    });
    if (entry.isDirectory) {
      items.push({
        label: t('sftp.openFolderVscode'),
        icon: <CodeIcon fontSize="small" />,
        onClick: () => actions.openInVscode(side, entry.path),
      });
    }
    items.push({
      label: t('sftp.properties'),
      icon: <InfoIcon fontSize="small" />,
      onClick: () => onProperties(entry),
      dividerBefore: true,
    });
  } else {
    items.push({
      label: t('sftp.newFolder'),
      icon: <CreateNewFolderIcon fontSize="small" />,
      onClick: () => actions.setCreateTarget({ side, type: 'folder' }),
    });
    items.push({
      label: t('sftp.newFile'),
      icon: <NoteAddIcon fontSize="small" />,
      onClick: () => actions.setCreateTarget({ side, type: 'file' }),
    });
    items.push({
      label: t('sftp.openInVscode'),
      icon: <CodeIcon fontSize="small" />,
      onClick: () => actions.openInVscode(side),
      dividerBefore: true,
    });
    items.push({
      label: t('sftp.refresh'),
      icon: <RefreshIcon fontSize="small" />,
      onClick: refresh,
    });
    items.push({
      label: t('sftp.paste'),
      icon: <ContentPasteIcon fontSize="small" />,
      disabled: !hasClipboard,
      onClick: () => void actions.pasteInto(side),
      dividerBefore: true,
    });
  }
  return items;
}
