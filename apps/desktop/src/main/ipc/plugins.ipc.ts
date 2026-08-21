import { ipcMain, dialog } from 'electron';
import { IpcChannels } from '@ssh-central/ipc-contracts';
import type {
  PluginDialogRequest,
  PluginPermission,
  PluginPermissionRequest,
  PluginSecretKeyRequest,
  PluginSecretSetRequest,
  PluginSetEnabledRequest,
  PluginStorageKeyRequest,
  PluginStorageSetRequest,
  PluginTabRequest,
} from '@ssh-central/ipc-contracts';
import type { PluginManager } from '../plugin/plugin-manager.js';
import type { Send } from './types.js';

export type PluginDialogBroker = ReturnType<typeof createPluginDialogBroker>;

/** Router fuer Plugin-Dialoge: sendet an den Renderer und wartet auf die Antwort. */
export function createPluginDialogBroker(send: Send) {
  const pending = new Map<string, (value: string | boolean | null) => void>();
  const recent = new Map<string, number[]>();
  let seq = 0;
  const LIMIT = 8;
  const WINDOW_MS = 5000;

  function show(
    request: Omit<PluginDialogRequest, 'plugin'>,
    plugin: string,
  ): Promise<string | boolean | null> {
    const now = Date.now();
    const times = (recent.get(plugin) ?? []).filter((t) => now - t < WINDOW_MS);
    if (times.length >= LIMIT) {
      return Promise.reject(new Error('Zu viele Dialoge in kurzer Zeit.'));
    }
    recent.set(plugin, [...times, now]);
    return new Promise((resolve) => {
      const requestId = `dlg-${++seq}`;
      pending.set(requestId, resolve);
      send(IpcChannels.pluginsUiDialog, { requestId, plugin, request });
    });
  }

  function resolve(requestId: string, value: string | boolean | null): void {
    pending.get(requestId)?.(value);
    pending.delete(requestId);
  }

  return { show, resolve };
}

/** Registriert die Plugin-Ipc-Handler (Installation, Verwaltung, Bridge, Secrets, Storage, Berechtigungen). */
export function registerPluginsIpc(
  plugins: PluginManager,
  broker: ReturnType<typeof createPluginDialogBroker>,
): void {
  ipcMain.handle(IpcChannels.pluginsList, () => plugins.list());

  ipcMain.handle(IpcChannels.pluginsInstall, async () => {
    const result = await dialog.showOpenDialog({
      title: 'SSH Central Plugin installieren',
      properties: ['openFile'],
      filters: [{ name: 'SSH Central Plugin (ZIP)', extensions: ['zip'] }],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return plugins.list();
    }
    await plugins.installFromZip(result.filePaths[0]!);
    await plugins.loadAll();
    return plugins.list();
  });

  ipcMain.handle(IpcChannels.pluginsUninstall, async (_event, name: string) => {
    await plugins.uninstall(name);
    await plugins.loadAll();
    return plugins.list();
  });

  ipcMain.handle(IpcChannels.pluginsSetEnabled, async (_event, request: PluginSetEnabledRequest) => {
    await plugins.setEnabled(request.name, request.enabled);
    return plugins.list();
  });

  ipcMain.handle(IpcChannels.pluginsGetTab, async (_event, request: PluginTabRequest) =>
    plugins.getTab(request.plugin, request.tabId),
  );

  ipcMain.on(
    IpcChannels.pluginsTabFocus,
    (
      _event,
      request: { plugin: string; tabId: string; type: 'opened' | 'closed' | 'focused' | 'blurred' },
    ) => plugins.setTabFocus(request.plugin, request.tabId, request.type),
  );

  ipcMain.handle(IpcChannels.pluginsIpcInvoke, async (_event, request) =>
    plugins.invokeIpc(request),
  );

  ipcMain.on(
    IpcChannels.pluginsDialogResponse,
    (_event, response: { requestId: string; value: string | boolean | null }) => {
      broker.resolve(response.requestId, response.value);
    },
  );

  // ------------------------------------------------------------ Secrets
  ipcMain.handle(IpcChannels.pluginsSecretSet, async (_event, request: PluginSecretSetRequest) =>
    plugins.secretSet(request.plugin, request.key, request.value),
  );
  ipcMain.handle(IpcChannels.pluginsSecretGet, async (_event, request: PluginSecretKeyRequest) =>
    plugins.secretGet(request.plugin, request.key),
  );
  ipcMain.handle(IpcChannels.pluginsSecretDelete, async (_event, request: PluginSecretKeyRequest) =>
    plugins.secretDelete(request.plugin, request.key),
  );
  ipcMain.handle(IpcChannels.pluginsSecretList, async (_event, plugin: string) =>
    plugins.secretList(plugin),
  );

  // ------------------------------------------------------------ Persistenz
  ipcMain.handle(IpcChannels.pluginsStorageSet, async (_event, request: PluginStorageSetRequest) =>
    plugins.storageSet(request.plugin, request.key, request.value),
  );
  ipcMain.handle(IpcChannels.pluginsStorageGet, async (_event, request: PluginStorageKeyRequest) =>
    plugins.storageGet(request.plugin, request.key),
  );
  ipcMain.handle(IpcChannels.pluginsStorageDelete, async (_event, request: PluginStorageKeyRequest) =>
    plugins.storageDelete(request.plugin, request.key),
  );
  ipcMain.handle(IpcChannels.pluginsStorageClear, async (_event, plugin: string) => {
    await plugins.clearPluginData(plugin);
  });

  // ------------------------------------------------------------ Berechtigungen
  ipcMain.handle(IpcChannels.pluginsLogs, (_event, plugin?: string) => plugins.getLogs(plugin));

  ipcMain.handle(IpcChannels.pluginsPermissionsList, () => {
    const out: Record<string, PluginPermission[]> = {};
    for (const p of plugins.list()) {
      out[p.name] = p.permissions;
    }
    return out;
  });
  ipcMain.handle(IpcChannels.pluginsPermissionGrant, async (_event, request: PluginPermissionRequest) => {
    await plugins.grantPermission(request.plugin, request.permission);
  });
  ipcMain.handle(IpcChannels.pluginsPermissionRevoke, async (_event, request: PluginPermissionRequest) => {
    await plugins.revokePermission(request.plugin, request.permission);
  });
}
