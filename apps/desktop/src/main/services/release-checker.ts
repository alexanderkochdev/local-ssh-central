import type { UpdateCheckResult } from '@ssh-central/ipc-contracts';

/**
 * GitHub-Release-Check fuer die Update-Erinnerung beim App-Start.
 *
 * - Fragt den neuesten Release via GitHub-Releases-API ab (Repo ist Open Source).
 * - Vergleich per reinem Semver (`isNewerVersion`), behandelt auch Test-Builds `1.2.0-N`.
 * - Fehler (kein Netz, API/403, Rate-Limit) werden STILL ignoriert - ein fehlgeschlagener
 *   Check darf den App-Start nie stoeren oder den User nerven.
 *
 * Der Fetch ist injiziert (Standard: Electron `net.fetch` in index.ts), damit der Service
 * ohne Electron-Harness in Tests laeuft.
 */

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  /** Pre-Release (z.B. "3" aus `1.2.0-3`) oder null. */
  prerelease: string | null;
}

export function parseVersion(version: string): ParsedVersion | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(version.trim());
  if (!match) {
    return null;
  }
  return {
    major: Number.parseInt(match[1]!, 10),
    minor: Number.parseInt(match[2]!, 10),
    patch: Number.parseInt(match[3]!, 10),
    prerelease: match[4] ?? null,
  };
}

/** Vergleicht zwei Versionen: negativ wenn a < b, 0 wenn gleich, positiv wenn a > b. */
export function compareVersions(a: ParsedVersion, b: ParsedVersion): number {
  if (a.major !== b.major) {
    return a.major - b.major;
  }
  if (a.minor !== b.minor) {
    return a.minor - b.minor;
  }
  if (a.patch !== b.patch) {
    return a.patch - b.patch;
  }
  // Release (ohne prerelease) ist NEUER als ein Pre-Release derselben Version.
  if (a.prerelease === b.prerelease) {
    return 0;
  }
  if (a.prerelease === null) {
    return 1;
  }
  if (b.prerelease === null) {
    return -1;
  }
  return a.prerelease.localeCompare(b.prerelease, undefined, { numeric: true });
}

/** true, wenn `latest` eine neuere Version als `current` ist (bei Fehler false). */
export function isNewerVersion(current: string, latest: string): boolean {
  const currentParsed = parseVersion(current);
  const latestParsed = parseVersion(latest);
  if (!currentParsed || !latestParsed) {
    return false;
  }
  return compareVersions(latestParsed, currentParsed) > 0;
}

export type FetchLike = (url: string) => Promise<{ status: number; json(): Promise<unknown> }>;

interface GitHubReleaseResponse {
  tag_name?: string;
  html_url?: string;
}

export class ReleaseChecker {
  constructor(
    private readonly fetchImpl: FetchLike,
    private readonly repo = 'alexanderkochdev/ssh-central',
  ) {}

  /**
   * Fragt den neuesten Release ab.
   *
   * @param currentVersion Installierte Version (app.getVersion()).
   * @param canAutoUpdate  Kann sich dieser Build selbst aktualisieren (electron-updater)?
   *                       Wird nur durchgereicht, damit die UI zwischen In-App-Update und
   *                       manuellem Download unterscheiden kann.
   */
  async check(currentVersion: string, canAutoUpdate = false): Promise<UpdateCheckResult> {
    try {
      const url = `https://api.github.com/repos/${this.repo}/releases/latest`;
      const response = await this.fetchImpl(url);
      if (response.status !== 200) {
        return { current: currentVersion, latest: null, available: false, canAutoUpdate };
      }
      const body = (await response.json()) as GitHubReleaseResponse;
      const latest = body.tag_name?.replace(/^v/, '') ?? null;
      const available = latest ? isNewerVersion(currentVersion, latest) : false;
      return { current: currentVersion, latest, available, url: body.html_url, canAutoUpdate };
    } catch {
      // Netz-/API-Fehler: still ueberspringen.
      return { current: currentVersion, latest: null, available: false, canAutoUpdate };
    }
  }
}
