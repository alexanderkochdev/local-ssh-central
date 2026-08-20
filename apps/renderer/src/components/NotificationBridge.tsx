import { useEffect } from 'react';
import { IpcChannels } from '@ssh-central/ipc-contracts';
import type { SftpEvent, SshEvent } from '@ssh-central/ipc-contracts';
import { useAppDispatch } from '../store/index.js';
import { handleSftpTransfer, handleSshEvent } from '../store/notificationsSlice.js';

/**
 * Verdrahtet Main-Events (SSH/SFTP) mit dem Redux-Notifications-System.
 * Wird nur im Hauptfenster gerendert.
 */
export function NotificationBridge() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    const offSsh = window.api.onEvent(IpcChannels.sshEvent, (payload) => {
      void dispatch(handleSshEvent(payload as SshEvent));
    });
    const offSftp = window.api.onEvent(IpcChannels.sftpEvent, (payload) => {
      const event = payload as SftpEvent;
      if (event.type === 'transferProgress') {
        void dispatch(handleSftpTransfer(event.transfer));
      }
    });
    return () => {
      offSsh();
      offSftp();
    };
  }, [dispatch]);

  return null;
}
