/** Ergebnis des GitHub-Release-Checks (Update-Erinnerung beim App-Start). */
export interface UpdateCheckResult {
  /** Aktuell installierte App-Version (aus package.json / app.getVersion). */
  current: string;
  /** Neueste veroeffentlichte Version (ohne 'v'-Praefix), oder null bei Fehler/keinem Release. */
  latest: string | null;
  /** true, wenn eine neuere stabile Version vorliegt. */
  available: boolean;
  /** URL zur Release-Seite (nur wenn ein Release existiert). */
  url?: string;
  /**
   * true, wenn dieser Build das Update selbst herunterladen und installieren kann
   * (electron-updater). false z.B. im Dev-Modus, bei der .deb-Installation oder auf
   * nicht unterstuetzten Zielen - dann bleibt nur der Weg ueber die Release-Seite.
   */
  canAutoUpdate: boolean;
}

/**
 * Phase des In-App-Updates (electron-updater). Der Main-Process pusht jeden Wechsel
 * ueber `update:state` an alle Fenster, damit die UI ohne Polling folgen kann.
 */
export type AutoUpdateStage =
  /** Nichts angefordert. */
  | 'idle'
  /** Download laeuft (percent/transferred/total gefuellt). */
  | 'downloading'
  /** Fertig heruntergeladen - Installation nach Neustart moeglich. */
  | 'downloaded'
  /** Download/Installation fehlgeschlagen (message gefuellt). */
  | 'error'
  /** Dieser Build kann sich nicht selbst aktualisieren (Dev, .deb, unbekanntes Ziel). */
  | 'unsupported';

/** Fortschritt/Zustand des In-App-Updates. */
export interface AutoUpdateState {
  stage: AutoUpdateStage;
  /** Version, die heruntergeladen wird/wurde (falls bekannt). */
  version: string | null;
  /** Download-Fortschritt in Prozent (0-100). */
  percent: number;
  /** Bereits uebertragene Bytes. */
  transferred: number;
  /** Gesamtgroesse in Bytes (0 wenn unbekannt). */
  total: number;
  /** Aktuelle Geschwindigkeit in Bytes/Sekunde. */
  bytesPerSecond: number;
  /** Fehler-/Hinweistext (nur bei 'error' bzw. 'unsupported'). */
  message: string | null;
}
