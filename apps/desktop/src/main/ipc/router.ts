import type { AppServices, Send } from './types.js';
import { registerVaultIpc } from './vault.ipc.js';
import { registerHostsIpc } from './hosts.ipc.js';
import { registerSshIpc } from './ssh.ipc.js';
import { registerSftpIpc } from './sftp.ipc.js';
import { registerFsIpc } from './fs.ipc.js';
import { registerPluginsIpc } from './plugins.ipc.js';
import type { PluginManager } from '../plugin/plugin-manager.js';

/**
 * Registriert alle Ipc-Handler. `onLock` wird aufgerufen, sobald der Tresor gesperrt wird
 * (damit z.B. der Renderer den Sperr-Zustand sofort widerspiegeln kann).
 */
export function registerIpc(
  services: AppServices,
  send: Send,
  onLock: () => void,
  onUnlock: () => void,
  plugins: PluginManager,
): void {
  registerVaultIpc(services, onLock, onUnlock);
  registerHostsIpc(services);
  registerSshIpc(services);
  registerSftpIpc(services);
  registerFsIpc();
  registerPluginsIpc(plugins);
}
