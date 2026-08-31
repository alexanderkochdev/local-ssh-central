import { describe, it, expect } from 'vitest';
import type { SftpBookmark } from '@ssh-central/ipc-contracts';
import {
  buildStartOptions,
  decideInitialDir,
  slugifyBookmark,
  uniqueSlug,
} from '../src/features/sftp/sftpStartOptions.js';

const t = (key: string) => key;

const bookmarks: SftpBookmark[] = [
  { slug: 'logs', label: 'Logs', description: 'App-Logs', path: '/var/log' },
  { slug: 'www', label: '', description: '', path: '/var/www' },
];

describe('buildStartOptions', () => {
  it('listet immer zuerst Home auf', () => {
    const options = buildStartOptions('/home/user', undefined, [], t);
    expect(options[0]).toEqual({ key: 'home', label: 'sftp.startHome', path: '/home/user' });
  });

  it('fuegt den letzten Standort nach Home ein', () => {
    const options = buildStartOptions('/home/user', '/var/www', [], t);
    expect(options.map((o) => o.key)).toEqual(['home', 'last']);
    expect(options[1]).toEqual({ key: 'last', label: 'sftp.startLast', path: '/var/www' });
  });

  it('fuegt Lesezeichen mit Label, Beschreibung und Pfad-Fallback hinzu', () => {
    const options = buildStartOptions('/home/user', undefined, bookmarks, t);
    expect(options).toHaveLength(3);
    expect(options[1]).toMatchObject({ key: 'bookmark:logs', label: 'Logs', description: 'App-Logs', path: '/var/log' });
    // Leeres Label -> Pfad als Anzeige.
    expect(options[2]).toMatchObject({ label: '/var/www', description: undefined });
  });

  it('laesst Lesezeichen ohne Beschreibung als unt definiert', () => {
    const options = buildStartOptions('/home/user', undefined, bookmarks, t);
    expect(options[2]!.description).toBeUndefined();
  });
});

describe('decideInitialDir', () => {
  it('home-Modus startet immer im Home', () => {
    const d = decideInitialDir({ home: '/h', startMode: 'home', lastSftpDir: '/var', bookmarks: [], t });
    expect(d).toEqual({ ask: false, path: '/h' });
  });

  it('last-Modus nutzt den letzten Standort, wenn vorhanden', () => {
    const d = decideInitialDir({ home: '/h', startMode: 'last', lastSftpDir: '/var/www', bookmarks: [], t });
    expect(d).toEqual({ ask: false, path: '/var/www' });
  });

  it('last-Modus faellt auf Home zurueck, wenn kein letzter Standort existiert', () => {
    const d = decideInitialDir({ home: '/h', startMode: 'last', lastSftpDir: undefined, bookmarks: [], t });
    expect(d).toEqual({ ask: false, path: '/h' });
  });

  it('ask-Modus fragt nach, wenn mehr als eine Option existiert (letzter Standort)', () => {
    const d = decideInitialDir({ home: '/h', startMode: 'ask', lastSftpDir: '/var/www', bookmarks: [], t });
    expect(d.ask).toBe(true);
  });

  it('ask-Modus fragt nach, wenn Lesezeichen existieren', () => {
    const d = decideInitialDir({ home: '/h', startMode: 'ask', lastSftpDir: undefined, bookmarks, t });
    expect(d.ask).toBe(true);
  });

  it('ask-Modus startet direkt im Home, wenn nur Home zur Auswahl steht', () => {
    const d = decideInitialDir({ home: '/h', startMode: 'ask', lastSftpDir: undefined, bookmarks: [], t });
    expect(d).toEqual({ ask: false, path: '/h' });
  });
});

describe('slugifyBookmark', () => {
  it('erzeugt Kebab-Case aus einem Label', () => {
    expect(slugifyBookmark('App Logs')).toBe('app-logs');
    expect(slugifyBookmark('  Deploy / Releases  ')).toBe('deploy-releases');
  });

  it('entfernt Sonderzeichen und trimmt Randtrennzeichen', () => {
    expect(slugifyBookmark('---!! Web Server !!---')).toBe('web-server');
  });

  it('liefert einen leeren String fuer ungueltige Labels', () => {
    expect(slugifyBookmark('!!!')).toBe('');
    expect(slugifyBookmark('   ')).toBe('');
  });
});

describe('uniqueSlug', () => {
  it('gibt den Slug zurueck, wenn er frei ist', () => {
    expect(uniqueSlug('logs', ['app'])).toBe('logs');
  });

  it('ergaenzt einen Zaehler bei Konflikt', () => {
    expect(uniqueSlug('app', ['app'])).toBe('app-2');
    expect(uniqueSlug('app', ['app', 'app-2'])).toBe('app-3');
  });

  it('nimmt einen Ersatz-Slug, wenn die Ableitung leer bleibt', () => {
    expect(uniqueSlug('!!!', ['bookmark'])).toBe('bookmark-2');
  });
});
