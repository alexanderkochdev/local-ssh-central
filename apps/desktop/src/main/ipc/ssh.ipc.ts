import { ipcMain } from 'electron';
import { IpcChannels } from '@ssh-central/ipc-contracts';
import type {
  ConnectRequest,
  DisconnectRequest,
  ResizeRequest,
  WriteRequest,
} from '@ssh-central/ipc-contracts';
import type { AppServices } from './types.js';

/** Registriert die SSH-Ipc-Handler. */
export function registerSshIpc(services: AppServices): void {
  ipcMain.handle(IpcChannels.sshConnect, async (_event, request: ConnectRequest) => {
    const session = await services.ssh.connect(
      request.hostId,
      request.cols ?? 80,
      request.rows ?? 24,
    );
    return { sessionId: session.id };
  });

  ipcMain.handle(IpcChannels.sshWrite, (_event, request: WriteRequest) =>
    services.ssh.write(request.sessionId, request.data),
  );

  ipcMain.handle(IpcChannels.sshDisconnect, (_event, request: DisconnectRequest) =>
    services.ssh.disconnect(request.sessionId),
  );

  ipcMain.handle(IpcChannels.sshResize, (_event, request: ResizeRequest) =>
    services.ssh.resize(request.sessionId, request.cols, request.rows),
  );

  ipcMain.handle(IpcChannels.sshListSessions, () => services.ssh.listSessions());
}
