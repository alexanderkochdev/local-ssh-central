import { useEffect, useState } from 'react';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Typography from '@mui/material/Typography';
import { IpcChannels } from '@ssh-central/ipc-contracts';
import type { PluginDialogRequest } from '@ssh-central/ipc-contracts';
import { useTranslation } from '../../i18n/useTranslation.js';

interface PendingDialog {
  requestId: string;
  plugin: string;
  request: PluginDialogRequest;
}

/** Zeigt Plugin-Dialoge (prompt/multiline/secret/confirm/select) als native MUI-Dialoge an. */
export function PluginDialogHost() {
  const { t } = useTranslation();
  const [pending, setPending] = useState<PendingDialog | null>(null);
  const [value, setValue] = useState('');

  useEffect(() => {
    const unsub = window.api.onEvent(IpcChannels.pluginsUiDialog, (payload) => {
      const p = payload as PendingDialog;
      setValue(p.request.defaultValue ?? '');
      setPending(p);
    });
    return unsub;
  }, []);

  function respond(v: string | boolean | null) {
    if (pending) {
      window.api.plugins.dialogResponse(pending.requestId, v);
    }
    setPending(null);
  }

  if (!pending) {
    return null;
  }
  const { request } = pending;
  const isConfirm = request.kind === 'confirm';
  const isSecret = request.kind === 'secret';
  const isMultiline = request.kind === 'multiline';
  const isSelect = request.kind === 'select';

  return (
    <Dialog open onClose={() => respond(null)} fullWidth maxWidth="xs">
      <DialogTitle>{request.title}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
        {request.message && <Typography variant="body2">{request.message}</Typography>}
        {isSelect ? (
          (request.options ?? []).map((opt) => (
            <Button key={opt.value} variant="outlined" onClick={() => respond(opt.value)}>
              {opt.label}
            </Button>
          ))
        ) : isConfirm ? null : (
          <TextField
            label={request.label ?? request.title}
            type={isSecret ? 'password' : 'text'}
            multiline={isMultiline}
            minRows={isMultiline ? 4 : 1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
          />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => respond(null)}>{request.cancelLabel ?? t('action.cancel')}</Button>
        {!isSelect && (
          <Button variant="contained" onClick={() => respond(isConfirm ? true : value)}>
            {request.okLabel ?? (isConfirm ? t('action.ok') : t('action.ok'))}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
