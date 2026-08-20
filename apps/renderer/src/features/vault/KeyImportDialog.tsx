import { useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';

interface KeyImportDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

/** Importiert einen vorhandenen Private Key (OpenSSH/PEM) und speichert ihn verschluesselt. */
export function KeyImportDialog({ open, onClose, onSaved }: KeyImportDialogProps) {
  const [privateKey, setPrivateKey] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!privateKey.trim()) {
      setError('Bitte Private Key einfuegen.');
      return;
    }
    try {
      await window.api.vault.keys.import({
        privateKey,
        passphrase: passphrase || undefined,
        title: 'Importierter Key',
      });
      setPrivateKey('');
      setPassphrase('');
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>SSH-Key importieren</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField
          label="Private Key (OpenSSH/PEM)"
          value={privateKey}
          onChange={(e) => setPrivateKey(e.target.value)}
          multiline
          minRows={4}
          fullWidth
        />
        <TextField
          label="Key-Passphrase (falls verschluesselt)"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          type="password"
          fullWidth
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Abbrechen</Button>
        <Button variant="contained" onClick={submit}>Importieren</Button>
      </DialogActions>
    </Dialog>
  );
}
