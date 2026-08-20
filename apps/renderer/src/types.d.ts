import type { SshCentralApi } from '@ssh-central/ipc-contracts';

declare global {
  interface Window {
    /** Von Electron Preload via contextBridge exponiert. */
    api: SshCentralApi;
  }
}

export {};
