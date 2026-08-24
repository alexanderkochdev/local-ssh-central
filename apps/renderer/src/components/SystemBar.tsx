import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import type { SystemStats } from '@ssh-central/ipc-contracts';
import { useTranslation } from '../i18n/useTranslation.js';

const POLL_MS = 2000;

/** Kleine Statusleiste am unteren Rand des Main-Fensters: eigener CPU/RAM/Disk + Netzwerk. */
export function SystemBar() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<SystemStats | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const next = await window.api.system.getStats();
        if (alive) {
          setStats(next);
        }
      } catch {
        // Statistik nicht verfügbar -> Leiste bleibt leer.
      }
    };
    void tick();
    const id = setInterval(() => void tick(), POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (!stats) {
    return null;
  }

  return (
    <Box
      component="footer"
      sx={{
        display: 'flex',
        gap: 2,
        alignItems: 'center',
        px: 2,
        py: 0.5,
        borderTop: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        fontSize: 12,
        fontFamily: 'monospace',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <span title={t('system.cpu')}>{t('system.cpu')} {stats.cpu.appPercent}%</span>
      <span title={t('system.ram')}>{t('system.ram')} {stats.memory.appRssMb} MB</span>
      {stats.gpu.name && (
        <span title={stats.gpu.name}>
          {t('system.gpu')} {stats.gpu.name}
        </span>
      )}
      <span title={t('system.disk')}>{t('system.disk')} {stats.disk.appDataMb} MB</span>
      <span title={t('system.network')}>
        ↓ {stats.network.downKbps} KB/s · ↑ {stats.network.upKbps} KB/s
      </span>
      <span title={t('system.latency')}>
        {t('system.latency')} {stats.network.latencyMs != null ? `${stats.network.latencyMs} ms` : '—'}
      </span>
    </Box>
  );
}
