import type { PluginModule } from './types.js';

/**
 * Typsicherer Wrapper fuer die Plugin-Definition. Liefert das Modul unveraendert zurueck,
 * gibt dem Autor aber volle IntelliSense auf `api` in `register(api)`.
 *
 * ```ts
 * export default definePlugin({
 *   register(api) {
 *     api.log.info('Hallo');
 *   },
 *   dispose(api) { /* aufraeumen *\/ },
 * });
 * ```
 */
export function definePlugin(plugin: PluginModule): PluginModule {
  return plugin;
}
