import { ipcMain, dialog } from 'electron';
import { IpcChannels } from '@ssh-central/ipc-contracts';
import type { PluginTabRequest } from '@ssh-central/ipc-contracts';
import type { PluginManager } from '../plugin/plugin-manager.js';

/** Registriert die Plugin-Ipc-Handler (Installation aus ZIP, Verwaltung, Tab-Daten). */
export function registerPluginsIpc(plugins: PluginManager): void {
  ipcMain.handle(IpcChannels.pluginsList, () => plugins.list());

  // Oeffnet einen nativen Datei-Dialog und installiert die gewaehlte ZIP.
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

  ipcMain.handle(IpcChannels.pluginsGetTab, async (_event, request: PluginTabRequest) =>
    plugins.getTab(request.plugin, request.tabId),
  );
}
