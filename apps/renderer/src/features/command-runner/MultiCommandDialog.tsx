import { useEffect, useMemo, useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import type { CommandRunResult } from '@ssh-central/ipc-contracts';
import { useHostsStore } from '../../store/hosts-store.js';
import { useCommandRunnerStore } from '../../store/command-runner-store.js';
import { useTranslation } from '../../i18n/useTranslation.js';
import { useAppDispatch } from '../../store/index.js';
import { pushNotification } from '../../store/notificationsSlice.js';
import { formatAllOutputs } from './format.js';

/**
 * Multi-Host Command Runner: fuehrt ein Kommando parallel auf mehreren ausgewaehlten
 * Hosts aus und zeigt die Ergebnisse nebeneinander (Exit-Code + Output).
 */
export function MultiCommandDialog() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const open = useCommandRunnerStore((s) => s.open);
  const closeRunner = useCommandRunnerStore((s) => s.closeRunner);
  const { hosts, loading, loaded, load } = useHostsStore();

  const [command, setCommand] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<CommandRunResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Hosts nur einmalig nachladen (loaded-Flag verhindert Load-Schleifen bei leerer Liste).
  useEffect(() => {
    if (open && !loaded) {
      void load();
    }
  }, [open, loaded, load]);

  // Beim Oeffnen alte Ergebnisse/Selektion zuruecksetzen.
  useEffect(() => {
    if (open) {
      setCommand('');
      setSelected(new Set());
      setResults([]);
      setError(null);
    }
  }, [open]);

  const selectedHosts = useMemo(
    () => hosts.filter((host) => selected.has(host.id)),
    [hosts, selected],
  );

  function toggleHost(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleAll() {
    setSelected(selected.size === hosts.length ? new Set() : new Set(hosts.map((h) => h.id)));
  }

  async function run() {
    if (!command.trim()) {
      setError(t('commands.commandPlaceholder'));
      return;
    }
    if (selectedHosts.length === 0) {
      setError(t('commands.selectAtLeastOne'));
      return;
    }
    setError(null);
    setRunning(true);
    setResults([]);
    try {
      const tasks = selectedHosts.map((host) =>
        window.api.ssh
          .exec({ hostId: host.id, command: command.trim() })
          .then((result) => ({ result, host }))
          .catch((err: Error) => ({
            result: { hostId: host.id, success: false, output: '', error: err.message },
            host,
          })),
      );
      const finished = await Promise.all(tasks);
      setResults(
        finished.map(({ result }) => ({
          ...result,
          // Host-Name fuer die Anzeige ergaenzen (nicht-sensitiv, aus HostStore).
          hostId: result.hostId,
        })),
      );
      setSelected(new Set());
    } finally {
      setRunning(false);
    }
  }

  function copyAllOutputs() {
    const body = formatAllOutputs(
      results,
      (hostId) => hosts.find((h) => h.id === hostId)?.name,
    );
    void navigator.clipboard.writeText(body).then(() =>
      dispatch(pushNotification({ type: 'success', title: t('commands.copyAllOutputs') })),
    );
  }

  return (
    <Dialog open={open} onClose={closeRunner} fullWidth maxWidth="md">
      <DialogTitle>{t('commands.runTitle')}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <TextField
          label={t('commands.commandPlaceholder')}
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              void run();
            }
          }}
          fullWidth
          autoFocus
        />

        {error && <Alert severity="warning">{error}</Alert>}

        {loading ? (
          <Box sx={{ display: 'grid', placeItems: 'center', py: 3 }}>
            <CircularProgress />
          </Box>
        ) : hosts.length === 0 ? (
          <Typography color="text.secondary">{t('commands.noHosts')}</Typography>
        ) : (
          <>
            <FormControlLabel
              control={
                <Checkbox
                  checked={selected.size > 0 && selected.size === hosts.length}
                  indeterminate={selected.size > 0 && selected.size < hosts.length}
                  onChange={toggleAll}
                />
              }
              label={t('commands.selectAll')}
            />
            <List dense sx={{ maxHeight: 200, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
              {hosts.map((host) => (
                <ListItem key={host.id} disablePadding>
                  <FormControlLabel
                    sx={{ width: '100%', px: 1 }}
                    control={
                      <Checkbox checked={selected.has(host.id)} onChange={() => toggleHost(host.id)} />
                    }
                    label={
                      <Box>
                        <Typography variant="body2">{host.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {`${host.username}@${host.host}:${host.port}`}
                        </Typography>
                      </Box>
                    }
                  />
                </ListItem>
              ))}
            </List>
          </>
        )}

        {results.length > 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="subtitle2">{t('commands.results')}</Typography>
              <Button size="small" startIcon={<ContentCopyIcon />} onClick={copyAllOutputs}>
                {t('commands.copyAllOutputs')}
              </Button>
            </Box>
            {results.map((result) => {
              const label = hosts.find((h) => h.id === result.hostId)?.name ?? result.hostId;
              return (
                <Box
                  key={result.hostId}
                  sx={{
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                    overflow: 'hidden',
                  }}
                >
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      px: 1.5,
                      py: 0.5,
                      bgcolor: 'action.hover',
                    }}
                  >
                    {result.success ? (
                      <CheckCircleIcon sx={{ color: 'success.main' }} fontSize="small" />
                    ) : (
                      <ErrorIcon sx={{ color: 'error.main' }} fontSize="small" />
                    )}
                    <Typography variant="body2" sx={{ flexGrow: 1 }}>
                      {label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t('commands.exitCode')}: {result.exitCode ?? '?'}
                    </Typography>
                    <IconButton
                      size="small"
                      title={t('commands.copyOutput')}
                      onClick={() => void navigator.clipboard.writeText(result.output)}
                    >
                      <ContentCopyIcon fontSize="small" />
                    </IconButton>
                  </Box>
                  <Box
                    component="pre"
                    sx={{
                      m: 0,
                      p: 1.5,
                      maxHeight: 180,
                      overflow: 'auto',
                      fontSize: 12,
                      fontFamily: 'monospace',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      bgcolor: '#0d1117',
                      color: '#c9d1d9',
                    }}
                  >
                    {result.output || result.error || t('commands.emptyOutput')}
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={closeRunner}>{t('action.close')}</Button>
        <Button
          variant="contained"
          startIcon={running ? <CircularProgress size={16} /> : <PlayArrowIcon />}
          onClick={() => void run()}
          disabled={running || hosts.length === 0}
        >
          {running ? t('commands.running') : t('commands.run')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
