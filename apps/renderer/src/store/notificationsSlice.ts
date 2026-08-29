import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { SshEvent, TransferInfo } from '@ssh-central/ipc-contracts';
import type { RootState } from './index.js';

export type NotificationType = 'info' | 'success' | 'error' | 'progress';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  /** 0-100 (bei type = 'progress'). */
  progress?: number;
  /** Zeigt einen "Abbrechen"-Button (z.B. fuer laufende SFTP-Transfers). */
  cancelable?: boolean;
}

interface NotificationsState {
  items: AppNotification[];
  /** Bekannte SFTP-Transfers des aktuellen Batches (id -> info), fuer die aggregierte Anzeige. */
  transfers: Record<string, TransferInfo>;
  /** Vorab gescannte Gesamtzahl der Dateien des Batches (0 = unbekannt). */
  sftpBatchTotal: number;
  /** Vorab gescannte Gesamtgroesse (Bytes) des Batches (0 = unbekannt). */
  sftpBatchTotalBytes: number;
}

const sftpAggregateId = 'sftp-aggregate';

/** Wartezeit, bevor ein (kurz) leeres Batch als beendet gilt und entfernt wird. */
const SFTP_BATCH_IDLE_MS = 800;
let sfpBatchIdleTimer: ReturnType<typeof setTimeout> | null = null;
/** Zeitpunkt des ersten aktiven Transfers des aktuellen Batches (fuer Durchschnittsgeschwindigkeit). */
let sfpBatchStartedAt: number | null = null;

const initialState: NotificationsState = { items: [], transfers: {}, sftpBatchTotal: 0, sftpBatchTotalBytes: 0 };

const slice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    addNotification(state, action: PayloadAction<AppNotification>) {
      // Gleiche ID ersetzen (Fortschritt/Update).
      state.items = [...state.items.filter((n) => n.id !== action.payload.id), action.payload];
      // Maximal 5 gleichzeitig: aelteste Notification verwerfen.
      if (state.items.length > 5) {
        state.items.shift();
      }
    },
    updateNotification(state, action: PayloadAction<{ id: string; patch: Partial<Omit<AppNotification, 'id'>> }>) {
      state.items = state.items.map((n) =>
        n.id === action.payload.id ? { ...n, ...action.payload.patch } : n,
      );
    },
    removeNotification(state, action: PayloadAction<string>) {
      state.items = state.items.filter((n) => n.id !== action.payload);
    },
    clearNotifications(state) {
      state.items = [];
      state.transfers = {};
      state.sftpBatchTotal = 0;
      state.sftpBatchTotalBytes = 0;
    },
    /** Der SFTP-Fenster meldet vorab Gesamtzahl + Gesamtgroesse des kommenden Batches. */
    setSftpBatchTotal(state, action: PayloadAction<{ total: number; totalBytes: number }>) {
      state.sftpBatchTotal = Math.max(0, action.payload.total);
      state.sftpBatchTotalBytes = Math.max(0, action.payload.totalBytes);
    },
    /** Aktualisiert die aggregierte SFTP-Fortschritts-Anzeige (ein Toast fuer das ganze Batch). */
    syncSftpProgress(
      state,
      action: PayloadAction<{
        transfers: Record<string, TransferInfo>;
        aggregate: AppNotification | null;
      }>,
    ) {
      state.transfers = action.payload.transfers;
      // Aggregat entfernen, dann ggf. neu (ersetzt in-place -> nie Duplikate; Maximal 5).
      state.items = state.items.filter((n) => n.id !== sftpAggregateId);
      if (action.payload.aggregate) {
        state.items = [...state.items, action.payload.aggregate];
        if (state.items.length > 5) {
          state.items.shift();
        }
      } else {
        // Batch beendet -> vorab gescannte Werte zuruecksetzen.
        state.sftpBatchTotal = 0;
        state.sftpBatchTotalBytes = 0;
      }
    },
  },
});

export const {
  addNotification,
  updateNotification,
  removeNotification,
  clearNotifications,
  syncSftpProgress,
  setSftpBatchTotal,
} = slice.actions;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ------------------------------------------------------------------ Thunks

/** Temporaere Notification (Info/Success/Error), verschwindet nach autoDismissMs. */
export const pushNotification = createAsyncThunk<
  void,
  {
    type: NotificationType;
    title: string;
    message?: string;
    progress?: number;
    autoDismissMs?: number;
  },
  { state: RootState }
>('notifications/push', async ({ type, title, message, progress, autoDismissMs = 4000 }, { dispatch }) => {
  const id = crypto.randomUUID();
  dispatch(addNotification({ id, type, title, message, progress }));
  if (type !== 'progress' && autoDismissMs > 0) {
    await sleep(autoDismissMs);
    dispatch(removeNotification(id));
  }
});

/**
 * SFTP-Transfer-Event -> aggregierter Fortschritts-Toast.
 * Statt eines Toasts pro Datei wird EIN Toast angezeigt, der die Anzahl der Dateien
 * (fertig / gesamt) und den Gesamtfortschritt (Bytes bzw. Dateien) mit Ladebalken zeigt.
 * Ein Idle-Debounce haelt den Batch kurz am Leben, damit aufeinanderfolgende Dateien eines
 * Ordner-Uploads (zwischen ihnen ist kurz keine Datei aktiv) zu EINEM Toast zusammengefasst
 * werden statt unter "1 Datei" zu flackern.
 */
export const handleSftpTransfer = createAsyncThunk<void, TransferInfo, { state: RootState }>(
  'notifications/sftpTransfer',
  async (transfer, { dispatch, getState }) => {
    if (sfpBatchIdleTimer) {
      clearTimeout(sfpBatchIdleTimer);
      sfpBatchIdleTimer = null;
    }

    // Alle bekannten Transfers des Batches halten (inkl. abgeschlossener), damit die
    // Bytes-Summe ueber den Batch hinweg monoton steigt und fertig/gesamt zaehlbar ist.
    const transfers = { ...getState().notifications.transfers, [transfer.id]: transfer };
    const all = Object.values(transfers);
    const active = all.filter((t) => t.status === 'queued' || t.status === 'running');
    // Vorab gescannte Gesamtzahl/-groesse (falls) nutzen, sonst Anzahl der bereits bekannten Transfers.
    const knownTotal = getState().notifications.sftpBatchTotal;
    const knownTotalBytes = getState().notifications.sftpBatchTotalBytes;
    // Startzeit fuer die Durchschnittsgeschwindigkeit beim ersten aktiven Transfer setzen.
    if (active.length > 0 && sfpBatchStartedAt === null) {
      sfpBatchStartedAt = Date.now();
    }

    const aggregate = buildSftpAggregate(all, active, knownTotal, knownTotalBytes, sfpBatchStartedAt);

    // Aktive Transfers laufen -> Aggregate anzeigen. Sind gerade keine aktiv (Luecke
    // zwischen zwei Dateien oder Batch-Ende), wird das Aggregate noch eine kurze Weile
    // gehalten und erst nach Idle entfernt - so bleiben Dateien derselben Uebertragung
    // in EINEM Toast vereint.
    dispatch(syncSftpProgress({ transfers, aggregate }));

    if (active.length === 0) {
      sfpBatchIdleTimer = setTimeout(() => {
        dispatch(syncSftpProgress({ transfers: {}, aggregate: null }));
        sfpBatchIdleTimer = null;
        sfpBatchStartedAt = null;
      }, SFTP_BATCH_IDLE_MS);
    }
  },
);

/** Baut den aggregierten Fortschritts-Toast aus allen (aktiven + fertigen) Transfers des Batches. */
function buildSftpAggregate(
  all: TransferInfo[],
  active: TransferInfo[],
  knownTotal = 0,
  knownTotalBytes = 0,
  startedAt: number | null = null,
): AppNotification | null {
  const seenBytes = all.reduce((sum, t) => sum + (t.totalBytes || 0), 0);
  const transferredBytes = all.reduce((sum, t) => sum + (t.transferredBytes || 0), 0);
  const totalFiles = knownTotal > 0 ? knownTotal : all.length;
  // Gesamtgroesse: vorab gescannt (fest), sonst Summe der bereits bekannten Dateien.
  const totalB = knownTotalBytes > 0 ? knownTotalBytes : seenBytes;
  // "fertig" = Transfers, die bereits abgeschlossen/abgebrochen/fehlgeschlagen sind.
  const doneFiles = all.length - active.length;
  const bytePct = totalB > 0 ? Math.round((transferredBytes / totalB) * 100) : 0;
  const filePct = totalFiles > 0 ? Math.round((doneFiles / totalFiles) * 100) : 0;
  const pct = Math.min(100, totalB > 0 ? Math.max(bytePct, 0) : filePct);
  const source = active.length > 0 ? active : all;
  const directions = new Set(source.map((t) => t.direction));
  const dirLabel =
    directions.size > 1 ? 'Übertragung' : source[0]?.direction === 'upload' ? 'Upload' : 'Download';
  // Durchschnittsgeschwindigkeit: uebertragene Bytes seit Batch-Start / verstrichene Zeit.
  const elapsedSec = startedAt ? Math.max((Date.now() - startedAt) / 1000, 0.001) : 0;
  const speedBps = elapsedSec > 0 ? transferredBytes / elapsedSec : 0;

  return {
    id: sftpAggregateId,
    type: 'progress',
    title: `${dirLabel} · ${totalFiles} Dateien · ${pct}%`,
    message: `${doneFiles}/${totalFiles} fertig · ${formatBytes(transferredBytes)} / ${formatBytes(totalB)} · ${formatSpeed(speedBps)}`,
    progress: pct,
    cancelable: true,
  };
}

/** Formatiert eine Byte-Rate als "x B/s", "x KB/s", ... */
export function formatSpeed(bytesPerSecond: number): string {
  if (!bytesPerSecond || bytesPerSecond <= 0) {
    return '0 B/s';
  }
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s'];
  let value = bytesPerSecond;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  const whole = value === Math.floor(value);
  const digits = whole && i > 0 ? 0 : i === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[i]}`;
}

/** Bricht alle aktiven SFTP-Transfers des aktuellen Batches ab. */
export const cancelSftpTransfers = createAsyncThunk<void, void, { state: RootState }>(
  'notifications/cancelSftp',
  async (_arg, { getState }) => {
    const active = Object.values(getState().notifications.transfers).filter(
      (t) => t.status === 'queued' || t.status === 'running',
    );
    await Promise.all(
      active.map((t) => window.api.sftp.cancel({ id: t.id }).catch(() => undefined)),
    );
  },
);

/** SSH-Session-Event -> Verbindungs-/Status-Notification. */
export const handleSshEvent = createAsyncThunk<void, SshEvent, { state: RootState }>(
  'notifications/sshEvent',
  async (event, { dispatch }) => {
    switch (event.type) {
      case 'sessionCreated':
        dispatch(pushNotification({ type: 'info', title: `Verbinde mit ${event.session.title}…`, autoDismissMs: 2500 }));
        break;
      case 'sessionStatus':
        if (event.status === 'connected') {
          dispatch(pushNotification({ type: 'success', title: 'Verbindung hergestellt', autoDismissMs: 3000 }));
        } else if (event.status === 'error') {
          dispatch(pushNotification({ type: 'error', title: 'Verbindung fehlgeschlagen', message: event.error, autoDismissMs: 6000 }));
        }
        break;
      case 'sessionClosed':
        dispatch(pushNotification({ type: 'info', title: 'Session geschlossen', autoDismissMs: 2500 }));
        break;
      default:
        break;
    }
  },
);

function formatBytes(bytes?: number): string {
  if (!bytes) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default slice.reducer;
