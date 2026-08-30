import { useEffect, useState, type FormEvent } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Autocomplete from '@mui/material/Autocomplete';
import Chip from '@mui/material/Chip';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import { useHostsStore } from '../../store/hosts-store.js';
import { useTranslation } from '../../i18n/useTranslation.js';
import { SftpBookmarksEditor } from './SftpBookmarksEditor.js';
import type {
  AuthMethod,
  Host,
  HostSecretInput,
  HostUpsertRequest,
  SftpBookmark,
  SftpStartMode,
  SshKeyResult,
  SshKeyType,
  VaultEntrySummary,
} from '@ssh-central/ipc-contracts';

interface HostFormDialogProps {
  open: boolean;
  host: Host | null;
  onClose: () => void;
  /** Wird nach erfolgreichem Speichern mit der gespeicherten Host-ID aufgerufen. */
  onSaved: (id: string) => void;
}

const NEW_PASSWORD = '__new__';

/** Anlegen/Bearbeiten eines Hosts; Secrets werden als Vault-Referenz ausgewaehlt oder neu gespeichert. */
export function HostFormDialog({ open, host, onClose, onSaved }: HostFormDialogProps) {
  const { t } = useTranslation();
  const save = useHostsStore((s) => s.save);

  const [name, setName] = useState('');
  const [hostAddress, setHostAddress] = useState('');
  const [port, setPort] = useState('22');
  const [username, setUsername] = useState('');
  const [authMethod, setAuthMethod] = useState<AuthMethod>('password');
  const [tags, setTags] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [sftpStartMode, setSftpStartMode] = useState<SftpStartMode>('ask');
  const [sftpBookmarks, setSftpBookmarks] = useState<SftpBookmark[]>([]);
  const [entries, setEntries] = useState<VaultEntrySummary[]>([]);
  const [passwordChoice, setPasswordChoice] = useState<string>('');
  const [password, setPassword] = useState('');
  const [keyChoice, setKeyChoice] = useState<string>('');
  const [keyFingerprint, setKeyFingerprint] = useState<string | null>(null);
  const [keyType, setKeyType] = useState<SshKeyType>('ed25519');
  const [keyComment, setKeyComment] = useState('ssh-central');
  const [importKey, setImportKey] = useState('');
  const [importPassphrase, setImportPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordEntries = entries.filter((e) => !e.hasKeyData);
  const keyEntries = entries.filter((e) => e.hasKeyData);

  useEffect(() => {
    if (!open) {
      return;
    }
    setError(null);
    setEntries([]);
    setPassword('');
    setImportKey('');
    setImportPassphrase('');
    setKeyFingerprint(null);
    setKeyType('ed25519');
    setKeyComment('ssh-central');
    setName(host?.name ?? '');
    setHostAddress(host?.host ?? '');
    setPort(String(host?.port ?? 22));
    setUsername(host?.username ?? '');
    setAuthMethod(host?.authMethod ?? 'password');
    setTags(host?.tags ?? []);
    setNotes(host?.notes ?? '');
    setSftpStartMode(host?.sftpStartMode ?? 'ask');
    setSftpBookmarks(host?.sftpBookmarks ?? []);
    // Referenzen aus dem Vault vorbelegen.
    setPasswordChoice(host?.secrets?.passwordRef ?? NEW_PASSWORD);
    setKeyChoice(host?.secrets?.keyRef ?? '');
    void window.api.vault.entries.list().then(setEntries);
  }, [open, host]);

  async function generateKey() {
    setBusy(true);
    setError(null);
    try {
      const result: SshKeyResult = await window.api.vault.keys.generate({
        keyType,
        comment: keyComment,
        title: keyComment,
      });
      setKeyChoice(result.id);
      setKeyFingerprint(result.fingerprint);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function importExistingKey() {
    if (!importKey.trim()) {
      setError(t('hosts.importPrivateKey'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result: SshKeyResult = await window.api.vault.keys.import({
        privateKey: importKey,
        passphrase: importPassphrase || undefined,
        title: username || 'SSH Key',
      });
      setKeyChoice(result.id);
      setKeyFingerprint(result.fingerprint);
      setImportKey('');
      setImportPassphrase('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !hostAddress.trim() || !username.trim()) {
      setError(t('hosts.missingFields'));
      return;
    }
    const secrets: HostSecretInput = {};
    if (authMethod === 'password') {
      if (passwordChoice === NEW_PASSWORD) {
        if (!host && !password) {
          setError(t('hosts.requirePassword'));
          return;
        }
        if (password) {
          secrets.userName = username;
          secrets.password = password;
        }
      } else if (passwordChoice) {
        secrets.passwordRef = passwordChoice;
      }
    } else if (keyChoice) {
      secrets.keyRef = keyChoice;
    } else {
      setError(t('hosts.keyRequired'));
      return;
    }

    const request: HostUpsertRequest = {
      host: {
        id: host?.id,
        name: name.trim(),
        host: hostAddress.trim(),
        port: Number(port) || 22,
        username: username.trim(),
        authMethod,
        tags,
        notes: notes.trim() || undefined,
        sftpStartMode,
        sftpBookmarks,
      },
      secrets,
    };

    setBusy(true);
    setError(null);
    try {
      const saved = await save(request);
      onSaved(saved.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const isEditing = Boolean(host);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{isEditing ? t('hosts.editTitle') : t('hosts.addTitle')}</DialogTitle>
      <form onSubmit={submit}>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
          {error && <Alert severity="error">{error}</Alert>}

          <TextField label={t('hosts.name')} value={name} onChange={(e) => setName(e.target.value)} fullWidth required />
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField label={t('hosts.address')} value={hostAddress} onChange={(e) => setHostAddress(e.target.value)} fullWidth required />
            <TextField label={t('hosts.port')} value={port} onChange={(e) => setPort(e.target.value)} type="number" sx={{ width: 100 }} />
          </Box>
          <TextField label={t('hosts.username')} value={username} onChange={(e) => setUsername(e.target.value)} fullWidth required />
          <TextField
            label={t('hosts.authMethod')}
            select
            value={authMethod}
            onChange={(e) => setAuthMethod(e.target.value as AuthMethod)}
            fullWidth
          >
            <MenuItem value="password">{t('hosts.authPassword')}</MenuItem>
            <MenuItem value="key">{t('hosts.authKey')}</MenuItem>
          </TextField>

          {authMethod === 'password' ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <TextField
                label={t('hosts.selectVaultPassword')}
                select
                value={passwordChoice}
                onChange={(e) => {
                  setPasswordChoice(e.target.value);
                  // Beim Wechsel der Referenz den Username aus dem gewählten Vault-Eintrag
                  // übernehmen, sonst bleibt der alte Login-User aktiv.
                  const entry = passwordEntries.find((p) => p.id === e.target.value);
                  if (entry?.userName) {
                    setUsername(entry.userName);
                  }
                }}
                fullWidth
              >
                <MenuItem value={NEW_PASSWORD}>{isEditing ? t('hosts.newPassword') : t('hosts.password')}</MenuItem>
                {passwordEntries.map((entry) => (
                  <MenuItem key={entry.id} value={entry.id}>
                    {entry.title || t('vault.untitled')}
                    {entry.userName ? ` (${entry.userName})` : ''}
                  </MenuItem>
                ))}
              </TextField>
              {passwordChoice === NEW_PASSWORD && (
                <TextField
                  label={isEditing ? t('hosts.newPassword') : t('hosts.password')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  fullWidth
                />
              )}
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <TextField
                select
                label={t('hosts.selectVaultKey')}
                value={keyChoice}
                onChange={(e) => {
                  setKeyChoice(e.target.value);
                  const entry = keyEntries.find((k) => k.id === e.target.value);
                  setKeyFingerprint(entry?.fingerprint ?? null);
                }}
                fullWidth
              >
                <MenuItem value="">
                  <em>-- {t('hosts.selectKey')} --</em>
                </MenuItem>
                {keyEntries.map((entry) => (
                  <MenuItem key={entry.id} value={entry.id}>
                    {entry.title || 'SSH Key'} {entry.fingerprint ? ` · ${entry.fingerprint.slice(0, 24)}…` : ''}
                  </MenuItem>
                ))}
              </TextField>
              {keyFingerprint && (
                <Typography variant="body2" color="success.main">
                  Key ausgewählt: <code>{keyFingerprint}</code>
                </Typography>
              )}

              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <TextField select label={t('hosts.keyType')} value={keyType} onChange={(e) => setKeyType(e.target.value as SshKeyType)} sx={{ width: 160 }}>
                  <MenuItem value="ed25519">Ed25519</MenuItem>
                  <MenuItem value="rsa">RSA</MenuItem>
                </TextField>
                <TextField label={t('hosts.comment')} value={keyComment} onChange={(e) => setKeyComment(e.target.value)} fullWidth />
                <Button variant="outlined" onClick={generateKey} disabled={busy}>
                  {busy ? <CircularProgress size={18} /> : t('hosts.generateKey')}
                </Button>
              </Box>

              <TextField label={t('hosts.importPrivateKey')} value={importKey} onChange={(e) => setImportKey(e.target.value)} multiline minRows={2} fullWidth />
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField label={t('hosts.keyPassphrase')} value={importPassphrase} onChange={(e) => setImportPassphrase(e.target.value)} type="password" fullWidth />
                <Button variant="outlined" onClick={importExistingKey} disabled={busy}>
                  {t('hosts.importKey')}
                </Button>
              </Box>
            </Box>
          )}

          <Autocomplete<string, true, false, true>
            multiple
            freeSolo
            options={[]}
            value={tags}
            onChange={(_, newValue) => setTags(newValue)}
            renderValue={(value, getItemProps) =>
              value.map((option, index) => {
                const itemProps = getItemProps({ index });
                return (
                  <Chip
                    key={option}
                    label={option}
                    size="small"
                    variant="outlined"
                    className={itemProps.className}
                    disabled={itemProps.disabled}
                    tabIndex={itemProps.tabIndex}
                    onDelete={itemProps.onDelete}
                  />
                );
              })
            }
            renderInput={(params) => (
              <TextField {...params} label={t('hosts.tags')} placeholder={t('hosts.tagsPlaceholder')} />
            )}
          />

          <Divider />
          <TextField
            label={t('hosts.sftpStartMode')}
            select
            value={sftpStartMode}
            onChange={(e) => setSftpStartMode(e.target.value as SftpStartMode)}
            fullWidth
            helperText={t('hosts.sftpStartModeHint')}
          >
            <MenuItem value="ask">{t('hosts.sftpStartAsk')}</MenuItem>
            <MenuItem value="home">{t('hosts.sftpStartHome')}</MenuItem>
            <MenuItem value="last">{t('hosts.sftpStartLast')}</MenuItem>
          </TextField>
          <SftpBookmarksEditor value={sftpBookmarks} onChange={setSftpBookmarks} t={t} />

          <TextField label={t('hosts.notes')} value={notes} onChange={(e) => setNotes(e.target.value)} multiline minRows={2} fullWidth />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t('action.cancel')}</Button>
          <Button type="submit" variant="contained" disabled={busy}>
            {busy ? <CircularProgress size={18} /> : t('action.save')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
