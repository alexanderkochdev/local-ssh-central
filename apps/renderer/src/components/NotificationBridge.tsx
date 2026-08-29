import { useEffect } from 'react';
import { IpcChannels } from '@ssh-central/ipc-contracts';
import type { SftpEvent, SshEvent } from '@ssh-central/ipc-contracts';
import { useAppDispatch } from '../store/index.js';
import { handleSftpTransfer, handleSshEvent, setSftpBatchTotal } from '../store/notificationsSlice.js';

interface NotificationBridgeProps {
  /** Main verdrahtet nur SSH-Status; das SFTP-Fenster verdrahtet zusaetzlich die Transfers. */
  sftp?: boolean;
}

/**
 * Verdrahtet Main-Events (SSH/SFTP) mit dem Redux-Notifications-System.
 * Hauptfenster: nur SSH-Sessions. SFTP-Fenster: zusaetzlich die SFTP-Transfer-Aggregation.
 */
export function NotificationBridge({ sftp = false }: NotificationBridgeProps) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    const offSsh = window.api.onEvent(IpcChannels.sshEvent, (payload) => {
      void dispatch(handleSshEvent(payload as SshEvent));
    });
    const offSftp = sftp
      ? window.api.onEvent(IpcChannels.sftpEvent, (payload) => {
          const event = payload as SftpEvent;
          if (event.type === 'transferProgress') {
            void dispatch(handleSftpTransfer(event.transfer));
          } else if (event.type === 'transferBatchTotal') {
            dispatch(setSftpBatchTotal({ total: event.total, totalBytes: event.totalBytes }));
          }
        })
      : null;
    return () => {
      offSsh();
      offSftp?.();
    };
  }, [dispatch, sftp]);

  return null;
}
