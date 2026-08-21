import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import RefreshIcon from '@mui/icons-material/Refresh';
import type { PluginTabData } from '@ssh-central/ipc-contracts';
import { useTranslation } from '../../i18n/useTranslation.js';

interface PluginPanelProps {
  plugin: string;
  tabId: string;
}

/** Generisches Panel fuer einen von einem Plugin registrierten Tab (textbasierter Vertrag). */
export function PluginPanel({ plugin, tabId }: PluginPanelProps) {
  const { t } = useTranslation();
  const [data, setData] = useState<PluginTabData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      setData(await window.api.plugins.getTab({ plugin, tabId }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plugin, tabId]);

  return (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5, height: '100%', overflow: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="h6">{data?.title ?? plugin}</Typography>
        <Box sx={{ flexGrow: 1 }} />
        <IconButton size="small" title={t('action.refresh')} onClick={() => void refresh()}>
          <RefreshIcon fontSize="small" />
        </IconButton>
      </Box>
      {loading ? (
        <CircularProgress size={24} />
      ) : error ? (
        <Typography variant="body2" color="error">
          {error}
        </Typography>
      ) : (
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
          {data?.body ?? ''}
        </Typography>
      )}
    </Box>
  );
}
