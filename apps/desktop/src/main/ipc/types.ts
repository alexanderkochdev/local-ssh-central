import type { VaultService } from '../services/vault-service.js';
import type { HostStore } from '../services/host-store.js';
import type { SshService } from '../services/ssh-service.js';
import type { SftpService } from '../services/sftp-service.js';

/** Alle Main-Process-Dienste, die die IPC-Handler benutzen. */
export interface AppServices {
  vault: VaultService;
  hosts: HostStore;
  ssh: SshService;
  sftp: SftpService;
}

/** Sendet ein Ereignis an den Renderer (webContents.send). */
export type Send = (channel: string, payload: unknown) => void;
