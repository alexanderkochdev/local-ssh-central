/** Command Runner + Palette + Session-Farben (Deutsch). */
export const commands: Record<string, string> = {
  // Multi-Host Command Runner
  'commands.runTitle': 'Befehl auf mehreren Hosts ausführen',
  'commands.openRunner': 'Befehl ausführen…',
  'commands.run': 'Ausführen',
  'commands.commandPlaceholder': 'Befehl eingeben, z. B. uptime',
  'commands.selectHosts': 'Hosts auswählen',
  'commands.selectAll': 'Alle',
  'commands.noHosts': 'Noch keine Hosts vorhanden.',
  'commands.selectAtLeastOne': 'Bitte mindestens einen Host auswählen.',
  'commands.running': 'Führe aus…',
  'commands.success': 'Erfolg',
  'commands.failed': 'Fehlgeschlagen',
  'commands.exitCode': 'Exit',
  'commands.emptyOutput': '(keine Ausgabe)',
  'commands.copyOutput': 'Ausgabe kopieren',
  'commands.copyAllOutputs': 'Alle Ausgaben kopieren',
  'commands.noResults': 'Noch keine Ergebnisse.',
  'commands.results': 'Ergebnisse',
  'commands.host': 'Host',

  // Command Palette
  'palette.placeholder': 'Hosts, Einträge, Aktionen suchen…',
  'palette.noResults': 'Keine Treffer',
  'palette.sectionHosts': 'Hosts',
  'palette.sectionVault': 'Tresor',
  'palette.sectionActions': 'Aktionen',
  'palette.connect': 'Terminal öffnen',
  'palette.openSftp': 'SFTP öffnen',
  'palette.copyPassword': 'Passwort kopieren',
  'palette.goHosts': 'Zu Hosts',
  'palette.goVault': 'Zum Tresor',
  'palette.runCommand': 'Befehl auf mehreren Hosts…',
  'palette.empty': 'Keine Hosts oder Einträge.',

  // Session-Farben / Benennung
  'session.namePlaceholder': 'Session benennen…',
  'session.colors': 'Farbe',
  'session.rename': 'Session umbenennen',

  // Clipboard-Guard
  'action.copy': 'Kopieren',
  'clipboard.copied': 'In die Zwischenablage kopiert – wird nach {seconds} s geleert.',
  'clipboard.copiedNever': 'In die Zwischenablage kopiert – wird NICHT automatisch geleert.',
  'clipboard.copyFailed': 'Kopieren fehlgeschlagen',
  'clipboard.confirmTitle': 'Passwort in die Zwischenablage kopieren?',
  'clipboard.confirmBody':
    'Das Passwort wird als Klartext in die Zwischenablage gelegt und nach {seconds} Sekunden automatisch wieder gelöscht. Das ist unsicher – kopiere es nur, wenn du es wirklich brauchst.',
  'clipboard.confirmBodyNever':
    'Das Passwort wird als Klartext in die Zwischenablage gelegt und NICHT automatisch wieder gelöscht. Das ist unsicher – kopiere es nur, wenn du es wirklich brauchst.',
  'clipboard.confirmEntry': 'Eintrag',
};
