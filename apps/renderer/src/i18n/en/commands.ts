/** Command runner + palette + session colors (English). */
export const commands: Record<string, string> = {
  // Multi-Host Command Runner
  'commands.runTitle': 'Run command on multiple hosts',
  'commands.openRunner': 'Run command…',
  'commands.run': 'Run',
  'commands.commandPlaceholder': 'Enter a command, e.g. uptime',
  'commands.selectHosts': 'Select hosts',
  'commands.selectAll': 'Select all',
  'commands.noHosts': 'No hosts yet.',
  'commands.selectAtLeastOne': 'Please select at least one host.',
  'commands.running': 'Running…',
  'commands.success': 'Success',
  'commands.failed': 'Failed',
  'commands.exitCode': 'Exit',
  'commands.emptyOutput': '(no output)',
  'commands.copyOutput': 'Copy output',
  'commands.copyAllOutputs': 'Copy all outputs',
  'commands.noResults': 'No results yet.',
  'commands.results': 'Results',
  'commands.host': 'Host',

  // Command Palette
  'palette.placeholder': 'Search hosts, entries, actions…',
  'palette.noResults': 'No results',
  'palette.sectionHosts': 'Hosts',
  'palette.sectionVault': 'Vault',
  'palette.sectionActions': 'Actions',
  'palette.connect': 'Open terminal',
  'palette.openSftp': 'Open SFTP',
  'palette.copyPassword': 'Copy password',
  'palette.goHosts': 'Go to Hosts',
  'palette.goVault': 'Go to Vault',
  'palette.runCommand': 'Run command on hosts…',
  'palette.empty': 'No hosts or entries.',

  // Session colors / naming
  'session.namePlaceholder': 'Name session…',
  'session.colors': 'Color',
  'session.rename': 'Rename session',

  // Clipboard guard
  'action.copy': 'Copy',
  'clipboard.copied': 'Copied to clipboard - cleared after {seconds} s.',
  'clipboard.copiedNever': 'Copied to clipboard - will NOT be cleared automatically.',
  'clipboard.copyFailed': 'Copy failed',
  'clipboard.confirmTitle': 'Copy password to clipboard?',
  'clipboard.confirmBody':
    'The password will be placed in the clipboard as plain text and automatically cleared after {seconds} seconds. This is unsafe - only copy it if you really need it.',
  'clipboard.confirmBodyNever':
    'The password will be placed in the clipboard as plain text and will NOT be cleared automatically. This is unsafe - only copy it if you really need it.',
  'clipboard.confirmEntry': 'Entry',
};
