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
}

interface NotificationsState {
  items: AppNotification[];
}

const initialState: NotificationsState = { items: [] };

const slice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    addNotification(state, action: PayloadAction<AppNotification>) {
      // Gleiche ID ersetzen (Fortschritt/Update).
      state.items = [...state.items.filter((n) => n.id !== action.payload.id), action.payload];
      if (state.items.length > 10) {
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
    },
  },
});

export const { addNotification, updateNotification, removeNotification, clearNotifications } =
  slice.actions;

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

/** SFTP-Transfer-Event -> Fortschritts-Notification (id = transfer.id). */
export const handleSftpTransfer = createAsyncThunk<void, TransferInfo, { state: RootState }>(
  'notifications/sftpTransfer',
  async (transfer, { dispatch, getState }) => {
    const exists = getState().notifications.items.some((n) => n.id === transfer.id);
    const label = transfer.direction === 'upload' ? 'Upload' : 'Download';
    const name = transfer.remotePath.split('/').pop() || transfer.remotePath;
    const pct =
      transfer.totalBytes > 0
        ? Math.round((transfer.transferredBytes / transfer.totalBytes) * 100)
        : 0;

    if (transfer.status === 'running' || transfer.status === 'queued') {
      dispatch(
        addNotification({
          id: transfer.id,
          type: 'progress',
          title: `${label}: ${name}`,
          message: `${formatBytes(transfer.transferredBytes)} / ${formatBytes(transfer.totalBytes)}`,
          progress: pct,
        }),
      );
    } else if (transfer.status === 'done' || transfer.status === 'error') {
      dispatch(
        updateNotification({
          id: transfer.id,
          patch: {
            type: transfer.status === 'done' ? 'success' : 'error',
            progress: 100,
            message: transfer.status === 'done' ? 'Abgeschlossen' : transfer.error,
          },
        }),
      );
      await sleep(4000);
      dispatch(removeNotification(transfer.id));
    }
    void exists;
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
