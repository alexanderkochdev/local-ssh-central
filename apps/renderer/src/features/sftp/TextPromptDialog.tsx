import { useEffect, useState, type FormEvent } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import { useTranslation } from '../../i18n/useTranslation.js';

interface TextPromptDialogProps {
  open: boolean;
  title: string;
  label: string;
  initialValue?: string;
  onCancel: () => void;
  onSubmit: (value: string) => void;
}

/** Einfacher Texteingabe-Dialog (fuer Umbenennen / Neuer Ordner). */
export function TextPromptDialog({ open, title, label, initialValue = '', onCancel, onSubmit }: TextPromptDialogProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (open) {
      setValue(initialValue);
    }
  }, [open, initialValue]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (value.trim()) {
      onSubmit(value.trim());
    }
  }

  return (
    <Dialog open={open} onClose={onCancel} fullWidth maxWidth="xs">
      <DialogTitle>{title}</DialogTitle>
      <form onSubmit={submit}>
        <DialogContent>
          <TextField label={label} value={value} onChange={(e) => setValue(e.target.value)} autoFocus fullWidth />
        </DialogContent>
        <DialogActions>
          <Button onClick={onCancel}>{t('action.cancel')}</Button>
          <Button type="submit" variant="contained">OK</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
