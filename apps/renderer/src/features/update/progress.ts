import type { AutoUpdateState } from '@ssh-central/ipc-contracts';

/** Formatiert eine Byte-Groesse kompakt (B/KB/MB/GB, eine Dezimalstelle ab KB). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

/**
 * Beschreibt den Download-Fortschritt fuer die Update-Zeile:
 * "12.4 MB / 68.0 MB (18%) - 2.1 MB/s". Fehlende Werte werden ausgelassen, damit die
 * Anzeige auch bei unbekannter Gesamtgroesse sinnvoll bleibt.
 */
export function formatUpdateProgress(state: AutoUpdateState | null): string {
  if (!state) {
    return '';
  }
  const parts: string[] = [];
  if (state.total > 0) {
    parts.push(`${formatBytes(state.transferred)} / ${formatBytes(state.total)} (${state.percent}%)`);
  } else if (state.transferred > 0) {
    parts.push(formatBytes(state.transferred));
  } else {
    parts.push(`${state.percent}%`);
  }
  if (state.bytesPerSecond > 0) {
    parts.push(`${formatBytes(state.bytesPerSecond)}/s`);
  }
  return parts.join(' - ');
}
