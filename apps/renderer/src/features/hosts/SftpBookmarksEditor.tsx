import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import BookmarksIcon from '@mui/icons-material/Bookmarks';
import type { SftpBookmark } from '@ssh-central/ipc-contracts';
import { uniqueSlug } from '../sftp/sftpStartOptions.js';

interface SftpBookmarksEditorProps {
  value: SftpBookmark[];
  onChange: (next: SftpBookmark[]) => void;
  t: (key: string) => string;
}

interface BookmarkDialogState {
  index: number;
  bookmark: SftpBookmark;
}

/** Verwaltet die SFTP-Lesezeichen eines Hosts (Liste + Anlegen/Bearbeiten/Loeschen). */
export function SftpBookmarksEditor({ value, onChange, t }: SftpBookmarksEditorProps) {
  const [editing, setEditing] = useState<BookmarkDialogState | null>(null);

  function addNew() {
    setEditing({ index: -1, bookmark: { slug: '', label: '', description: '', path: '' } });
  }

  function editAt(index: number) {
    setEditing({ index, bookmark: { ...value[index]! } });
  }

  function removeAt(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function handleSave(bookmark: SftpBookmark) {
    if (editing!.index < 0) {
      onChange([...value, bookmark]);
    } else {
      onChange(value.map((b, i) => (i === editing!.index ? bookmark : b)));
    }
    setEditing(null);
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <BookmarksIcon fontSize="small" />
        {t('hosts.sftpBookmarks')}
      </Typography>
      {value.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          {t('hosts.sftpBookmarksEmpty')}
        </Typography>
      )}
      {value.map((bookmark, index) => (
        <ListItem
          key={bookmark.slug || index}
          disablePadding
          secondaryAction={
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <IconButton size="small" title={t('action.edit')} onClick={() => editAt(index)}>
                <EditIcon fontSize="small" />
              </IconButton>
              <IconButton size="small" title={t('action.delete')} onClick={() => removeAt(index)}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Box>
          }
        >
          <ListItemText
            primary={bookmark.label || bookmark.path}
            slotProps={{ secondary: { component: 'div' } }}
            secondary={
              <span>
                <span>{bookmark.path}</span>
                {bookmark.description && <span> · {bookmark.description}</span>}
              </span>
            }
          />
        </ListItem>
      ))}
      <Box>
        <Button size="small" startIcon={<AddIcon />} onClick={addNew}>
          {t('hosts.sftpBookmarkAdd')}
        </Button>
      </Box>

      <SftpBookmarkDialog
        state={editing}
        existingSlugs={value.map((b) => b.slug).filter(Boolean)}
        t={t}
        onSave={handleSave}
        onClose={() => setEditing(null)}
      />
    </Box>
  );
}

interface SftpBookmarkDialogProps {
  state: BookmarkDialogState | null;
  existingSlugs: string[];
  t: (key: string) => string;
  onSave: (bookmark: SftpBookmark) => void;
  onClose: () => void;
}

/** Dialog zum Anlegen/Bearbeiten eines einzelnen SFTP-Lesezeichens. */
function SftpBookmarkDialog({ state, existingSlugs, t, onSave, onClose }: SftpBookmarkDialogProps) {
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [path, setPath] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!state) {
      return;
    }
    setLabel(state.bookmark.label);
    setDescription(state.bookmark.description);
    setPath(state.bookmark.path);
    setSlug(state.bookmark.slug);
    setSlugTouched(Boolean(state.bookmark.slug));
    setError(null);
  }, [state]);

  // Slug automatisch aus dem Label ableiten, solange der User ihn nicht selbst gesetzt hat.
  useEffect(() => {
    if (!state || slugTouched) {
      return;
    }
    // Beim Edit das eigene Slug aus der "Verbotsliste" ausnehmen, damit die Ableitung
    // es wiederverwenden kann (sonst wuerde es zu "label-2" werden).
    const others = existingSlugs.filter((s) => s !== state.bookmark.slug);
    setSlug(uniqueSlug(label, others));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label, slugTouched, state]);

  if (!state) {
    return <Dialog open={false} />;
  }

  const current = state;
  const isEdit = current.index >= 0;

  function handleSubmit() {
    if (!label.trim() || !path.trim()) {
      setError(t('hosts.sftpBookmarkMissing'));
      return;
    }
    const finalSlug = uniqueSlug(
      slug || label,
      existingSlugs.filter((s) => s !== current.bookmark.slug),
    );
    onSave({
      slug: finalSlug,
      label: label.trim(),
      description: description.trim(),
      path: path.trim(),
    });
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{isEdit ? t('hosts.sftpBookmarkEdit') : t('hosts.sftpBookmarkNew')}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
        <TextField
          label={t('hosts.sftpBookmarkLabel')}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          fullWidth
          required
          autoFocus
        />
        <TextField
          label={t('hosts.sftpBookmarkDescription')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          fullWidth
          multiline
          minRows={2}
        />
        <TextField
          label={t('hosts.sftpBookmarkSlug')}
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value);
            setSlugTouched(true);
          }}
          fullWidth
          helperText={t('hosts.sftpBookmarkSlugHint')}
        />
        <TextField
          label={t('hosts.sftpBookmarkPath')}
          value={path}
          onChange={(e) => setPath(e.target.value)}
          fullWidth
          required
          placeholder="/var/www"
        />
        {error && (
          <Typography variant="body2" color="error">
            {error}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('action.cancel')}</Button>
        <Button variant="contained" onClick={handleSubmit}>
          {t('action.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
