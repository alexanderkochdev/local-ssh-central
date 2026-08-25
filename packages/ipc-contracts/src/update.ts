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
}
