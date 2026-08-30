import type { SftpBookmark, SftpStartMode } from '@ssh-central/ipc-contracts';

/** Eine Option im SFTP-Startverzeichnis-Dialog. */
export interface StartOption {
  /** Stabiler Schluessel (fuer React-Key + Unterscheidung). */
  key: string;
  label: string;
  description?: string;
  path: string;
}

export interface InitialDirDecision {
  /** true = Dialog anzeigen (mehrere Optionen). */
  ask: boolean;
  /** Pfad, wenn nicht gefragt wird. */
  path?: string;
}

export interface InitialDirInput {
  home: string;
  startMode: SftpStartMode;
  lastSftpDir?: string;
  bookmarks: SftpBookmark[];
  t: (key: string) => string;
}

/**
 * Baut die Auswahl-Liste fuer den SFTP-Initial-Dialog.
 * Immer zuerst "Home", dann (falls vorhanden) "letzter Standort", dann die Lesezeichen.
 */
export function buildStartOptions(
  home: string,
  lastSftpDir: string | undefined,
  bookmarks: SftpBookmark[],
  t: (key: string) => string,
): StartOption[] {
  const options: StartOption[] = [{ key: 'home', label: t('sftp.startHome'), path: home }];
  if (lastSftpDir) {
    options.push({ key: 'last', label: t('sftp.startLast'), path: lastSftpDir });
  }
  for (const bookmark of bookmarks) {
    options.push({
      key: `bookmark:${bookmark.slug}`,
      label: bookmark.label || bookmark.path,
      description: bookmark.description || undefined,
      path: bookmark.path,
    });
  }
  return options;
}

/**
 * Entscheidet, mit welchem Verzeichnis eine SFTP-Session startet.
 * - 'home'          -> immer Home
 * - 'last' (+ Pfad) -> letzter Standort
 * - 'ask' (mehr als eine Option) -> Dialog anzeigen (ask = true)
 * - sonst            -> Home bzw. einzige Option
 */
export function decideInitialDir(input: InitialDirInput): InitialDirDecision {
  const { home, startMode, lastSftpDir, bookmarks, t } = input;
  if (startMode === 'home') {
    return { ask: false, path: home };
  }
  if (startMode === 'last') {
    return { ask: false, path: lastSftpDir || home };
  }
  // startMode === 'ask'
  const options = buildStartOptions(home, lastSftpDir, bookmarks, t);
  if (options.length <= 1) {
    return { ask: false, path: options[0]?.path ?? home };
  }
  return { ask: true };
}

/**
 * Erzeugt aus einem Label einen URL-/Dateisystem-freundlichen Slug (Kebab-Case).
 * Nicht-alphanumerische Zeichen werden zu '-'; Mehrfach-/Randleerzeichen entfernt.
 */
export function slugifyBookmark(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Macht einen Slug eindeutig gegenueber bereits vorhandenen Slugs. */
export function uniqueSlug(base: string, existing: string[]): string {
  const slug = slugifyBookmark(base) || 'bookmark';
  const taken = new Set(existing);
  if (!taken.has(slug)) {
    return slug;
  }
  let i = 2;
  while (taken.has(`${slug}-${i}`)) {
    i += 1;
  }
  return `${slug}-${i}`;
}
