import type { TransferInfo } from '@ssh-central/ipc-contracts';
import type { PaneEntry } from './FilePane.js';
import type { Side } from './useSftpActions.js';

export interface PaneState {
  path: string;
  entries: PaneEntry[];
  loading: boolean;
  selected: Set<string>;
}

export interface MenuState {
  side: Side;
  entry: PaneEntry | null;
  x: number;
  y: number;
}

export function emptyPane(path: string): PaneState {
  return { path, entries: [], loading: false, selected: new Set<string>() };
}

export function upsertTransfer(current: TransferInfo[], transfer: TransferInfo): TransferInfo[] {
  // Abgeschlossene/abgebrochene Transfers aus der Fortschrittsliste entfernen,
  // damit die Liste nur noch laufende (bzw. fehlgeschlagene) Transfers zeigt.
  if (transfer.status === 'done' || transfer.status === 'canceled') {
    return current.filter((tr) => tr.id !== transfer.id);
  }
  const index = current.findIndex((tr) => tr.id === transfer.id);
  if (index < 0) {
    return [...current, transfer];
  }
  const next = [...current];
  next[index] = transfer;
  return next;
}
