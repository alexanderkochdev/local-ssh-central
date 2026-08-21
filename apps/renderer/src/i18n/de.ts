import { common } from './de/common.js';
import { hosts } from './de/hosts.js';
import { vault } from './de/vault.js';
import { settings } from './de/settings.js';
import { sftp } from './de/sftp.js';
import { terminal } from './de/terminal.js';
import { plugins } from './de/plugins.js';

/** Zusammengefuehrtes deutsches Woerterbuch. */
export const de: Record<string, string> = {
  ...common,
  ...hosts,
  ...vault,
  ...settings,
  ...sftp,
  ...terminal,
  ...plugins,
};
