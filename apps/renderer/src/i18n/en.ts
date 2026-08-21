import { common } from './en/common.js';
import { hosts } from './en/hosts.js';
import { vault } from './en/vault.js';
import { settings } from './en/settings.js';
import { sftp } from './en/sftp.js';
import { terminal } from './en/terminal.js';
import { plugins } from './en/plugins.js';

/** Zusammengefuehrtes englisches Woerterbuch. */
export const en: Record<string, string> = {
  ...common,
  ...hosts,
  ...vault,
  ...settings,
  ...sftp,
  ...terminal,
  ...plugins,
};
