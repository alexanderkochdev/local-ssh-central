import { useEffect, useState, type FormEvent } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import type { VaultEntrySummary } from '@ssh-central/ipc-contracts';

interface PasswordEntryDialogProps {
  open: boolean;
  entry: VaultEntrySummary | null;
  onClose: () => void;
  onSaved: () => void;
}

/** Username:Passwort-Eintrag anlegen/bearbeiten (verschluesselt im KeePass-Vault). */
export function PasswordEntryDialog({ open, entry, onClose, onSaved }: PasswordEntryDialogProps) {
  const [title, setTitle] = useState('');
  const [userName, setUserName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTitle(entry?.title ?? '');
      setUserName(entry?.userName ?? '');
      setPassword('');
      setError(null);
    }
  }, [open, entry]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!password && !entry) {
      setError('Das Passwort ist Pflicht.');
      return;
    }
    setError(null);
    try {
      const fields = { title, userName, ...(password ? { password } : {}) };
      if (entry) {
        await window.api.vault.entries.update({ id: entry.id, fields });
      } else {
        await window.api.vault.entries.create({ fields });
      }
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{entry ? 'Eintrag bearbeiten' : 'Passwort-Eintrag anlegen'}</DialogTitle>
      <form onSubmit={submit}>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="Titel" value={title} onChange={(e) => setTitle(e.target.value)} fullWidth required autoFocus />
          <TextField label="Benutzername" value={userName} onChange={(e) => setUserName(e.target.value)} fullWidth />
          <TextField
            label={entry ? 'Neues Passwort (leer = beibehalten)' : 'Passwort'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            fullWidth
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button type="submit" variant="contained">Speichern</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
