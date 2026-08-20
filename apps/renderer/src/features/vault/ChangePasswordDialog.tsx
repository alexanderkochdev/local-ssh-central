import { useState, type FormEvent } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import { useVaultStore } from '../../store/vault-store.js';

interface ChangePasswordDialogProps {
  open: boolean;
  onClose: () => void;
}

/** Aendert das Master-Passwort des Tresors (verifiziert das aktuelle im Main-Process). */
export function ChangePasswordDialog({ open, onClose }: ChangePasswordDialogProps) {
  const changeMasterPassword = useVaultStore((s) => s.changeMasterPassword);
  const error = useVaultStore((s) => s.error);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (next !== confirm) {
      return;
    }
    const ok = await changeMasterPassword(current, next);
    if (ok) {
      setCurrent('');
      setNext('');
      setConfirm('');
      onClose();
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Master-Passwort aendern</DialogTitle>
      <form onSubmit={submit}>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="Aktuelles Passwort" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} fullWidth required autoFocus />
          <TextField label="Neues Passwort" type="password" value={next} onChange={(e) => setNext(e.target.value)} fullWidth required />
          <TextField
            label="Neues Passwort bestaetigen"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={confirm.length > 0 && confirm !== next}
            helperText={confirm.length > 0 && confirm !== next ? 'Passwoerter stimmen nicht ueberein' : ' '}
            fullWidth
            required
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button type="submit" variant="contained">
            Aendern
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
