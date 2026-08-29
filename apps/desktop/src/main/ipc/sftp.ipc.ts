import { ipcMain } from 'electron';
import { IpcChannels } from '@ssh-central/ipc-contracts';
import type {
  CancelTransferRequest,
  FsListRequest,
  SftpBatchTotalRequest,
  TransferRequest,
} from '@ssh-central/ipc-contracts';
import type { AppServices } from './types.js';

interface SftpOpenRequest {
  hostId: string;
}

interface RenameRequest {
  handle: string;
  oldPath: string;
  newPath: string;
}

interface RemoveRequest {
  handle: string;
  path: string;
  isDirectory: boolean;
}

/** Registriert die SFTP-Ipc-Handler. */
export function registerSftpIpc(services: AppServices): void {
  ipcMain.handle(IpcChannels.sftpOpen, async (_event, request: SftpOpenRequest) =>
    services.sftp.open(request.hostId),
  );

  ipcMain.handle(IpcChannels.sftpClose, (_event, request: { handle: string }) =>
    services.sftp.close(request.handle),
  );

  ipcMain.handle(
    IpcChannels.sftpOpenRemote,
    (_event, request: { handle: string; remotePath: string; openerId: string }) =>
      services.sftp.openRemoteFile(request.handle, request.remotePath, request.openerId),
  );

  ipcMain.handle(
    IpcChannels.sftpCreateFile,
    (_event, request: { handle: string; path: string }) =>
      services.sftp.createFile(request.handle, request.path),
  );

  ipcMain.handle(IpcChannels.sftpList, (_event, request: FsListRequest) =>
    services.sftp.list(request.handle, request.path),
  );

  ipcMain.handle(IpcChannels.sftpMkdir, (_event, request: FsListRequest) =>
    services.sftp.mkdir(request.handle, request.path),
  );

  ipcMain.handle(IpcChannels.sftpRename, (_event, request: RenameRequest) =>
    services.sftp.rename(request.handle, request.oldPath, request.newPath),
  );

  ipcMain.handle(IpcChannels.sftpRemove, (_event, request: RemoveRequest) =>
    services.sftp.remove(request.handle, request.path, request.isDirectory),
  );

  ipcMain.handle(IpcChannels.sftpUpload, (_event, request: TransferRequest) =>
    services.sftp.upload(request.handle, request.localPath, request.remotePath),
  );

  ipcMain.handle(IpcChannels.sftpDownload, (_event, request: TransferRequest) =>
    services.sftp.download(request.handle, request.localPath, request.remotePath),
  );

  ipcMain.handle(IpcChannels.sftpCancel, (_event, request: CancelTransferRequest) =>
    services.sftp.cancel(request.id),
  );

  ipcMain.handle(IpcChannels.sftpSetBatchTotal, (_event, request: SftpBatchTotalRequest) =>
    services.sftp.setBatchTotal(request.total, request.totalBytes ?? 0),
  );
}
