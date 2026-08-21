import { useCallback, useEffect, useRef, useState } from 'react';
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

interface BridgeMessage {
  __ssh?: boolean;
  type?: 'invoke' | 'send' | 'response' | 'push';
  id?: number;
  channel?: string;
  payload?: unknown;
  ok?: boolean;
  value?: unknown;
  error?: string;
}

/** Plugin-Tab: rendert eine UI-Seite (iframe + postMessage-Bridge) ODER Klartext. */
export function PluginPanel({ plugin, tabId }: PluginPanelProps) {
  const { t } = useTranslation();
  const [data, setData] = useState<PluginTabData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

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
    window.api.plugins.setTabFocus({ plugin, tabId, type: 'focused' });
    return () => window.api.plugins.setTabFocus({ plugin, tabId, type: 'closed' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plugin, tabId]);

  // Bridge: iframe <-> Plugin-Modul (via Main).
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      const msg = (event.data ?? {}) as BridgeMessage;
      if (!msg.__ssh || event.source !== iframeRef.current?.contentWindow) {
        return;
      }
      if (msg.type === 'invoke' || msg.type === 'send') {
        void window.api.plugins
          .invoke({ plugin, channel: msg.channel ?? '', payload: msg.payload })
          .then((res) => {
            iframeRef.current?.contentWindow?.postMessage(
              {
                __ssh: true,
                type: 'response',
                id: msg.id,
                ok: res.ok,
                value: res.value,
                error: res.error,
              },
              '*',
            );
          });
      }
    },
    [plugin],
  );

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    const unsub = window.api.plugins.onIpc((push) => {
      if (push.plugin === plugin) {
        iframeRef.current?.contentWindow?.postMessage(
          { __ssh: true, type: 'push', channel: push.channel, payload: push.payload },
          '*',
        );
      }
    });
    return () => {
      window.removeEventListener('message', handleMessage);
      unsub();
    };
  }, [handleMessage, plugin]);

  if (loading && !data) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (data?.url) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Box sx={{ p: 0.5, pl: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="caption">{data.title}</Typography>
          <Box sx={{ flexGrow: 1 }} />
          <IconButton size="small" title={t('action.refresh')} onClick={() => void refresh()}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Box>
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <iframe
            ref={iframeRef}
            src={data.url}
            title={data.title}
            sandbox="allow-scripts allow-same-origin"
            style={{ width: '100%', height: '100%', border: 'none', background: 'transparent' }}
          />
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5, height: '100%', overflow: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="h6">{data?.title ?? plugin}</Typography>
        <Box sx={{ flexGrow: 1 }} />
        <IconButton size="small" title={t('action.refresh')} onClick={() => void refresh()}>
          <RefreshIcon fontSize="small" />
        </IconButton>
      </Box>
      {error ? (
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
