import { useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Alert from '@mui/material/Alert';
import type { SshKeyType } from '@ssh-central/ipc-contracts';

interface KeyGenerateDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

/** Erzeugt ein neues SSH-Schluesselpaar und speichert den Private Key verschluesselt. */
export function KeyGenerateDialog({ open, onClose, onSaved }: KeyGenerateDialogProps) {
  const [keyType, setKeyType] = useState<SshKeyType>('ed25519');
  const [comment, setComment] = useState('ssh-central');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    try {
      await window.api.vault.keys.generate({
        keyType,
        comment: comment.trim() || 'ssh-central',
        title: comment.trim() || 'SSH Key',
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>SSH-Key generieren</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField select label="Schluesseltyp" value={keyType} onChange={(e) => setKeyType(e.target.value as SshKeyType)} fullWidth>
          <MenuItem value="ed25519">Ed25519 (empfohlen)</MenuItem>
          <MenuItem value="rsa">RSA</MenuItem>
        </TextField>
        <TextField label="Kommentar (optional)" value={comment} onChange={(e) => setComment(e.target.value)} fullWidth />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Abbrechen</Button>
        <Button variant="contained" onClick={submit}>Generieren</Button>
      </DialogActions>
    </Dialog>
  );
}
