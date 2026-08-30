// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { fileIconKind } from '../src/features/sftp/fileIconCatalog.js';
import { FileIcon } from '../src/features/sftp/fileIcons.js';
import { render } from '@testing-library/react';

describe('fileIconKind', () => {
  it('mappt Ordner immer auf folder (auch mit Endung)', () => {
    expect(fileIconKind('src', true)).toBe('folder');
    expect(fileIconKind('assets.img', true)).toBe('folder');
  });

  it('mappt gängige Bild-/Video-/Audio-Endungen', () => {
    expect(fileIconKind('photo.PNG', false)).toBe('image');
    expect(fileIconKind('clip.mp4', false)).toBe('video');
    expect(fileIconKind('song.mp3', false)).toBe('audio');
  });

  it('mappt Archive und PDFs', () => {
    expect(fileIconKind('data.zip', false)).toBe('archive');
    expect(fileIconKind('app.tar.gz', false)).toBe('archive');
    expect(fileIconKind('dokument.pdf', false)).toBe('pdf');
  });

  it('mappt Dokumente und Tabellen', () => {
    expect(fileIconKind('bericht.docx', false)).toBe('document');
    expect(fileIconKind('notes.md', false)).toBe('document');
    expect(fileIconKind('tabelle.xlsx', false)).toBe('spreadsheet');
    expect(fileIconKind('daten.csv', false)).toBe('spreadsheet');
  });

  it('mappt Code- und Konfig-Dateien', () => {
    expect(fileIconKind('main.tsx', false)).toBe('code');
    expect(fileIconKind('server.go', false)).toBe('code');
    expect(fileIconKind('config.yaml', false)).toBe('config');
    expect(fileIconKind('package.json', false)).toBe('config');
  });

  it('unterscheidet Shell-/Terminal-Skripte', () => {
    expect(fileIconKind('deploy.sh', false)).toBe('terminal');
    expect(fileIconKind('start.bat', false)).toBe('terminal');
  });

  it('mappt Datenbanken und Fonts', () => {
    expect(fileIconKind('app.db', false)).toBe('database');
    expect(fileIconKind('font.ttf', false)).toBe('font');
  });

  it('erkennt spezielle Dateinamen ohne Endung', () => {
    expect(fileIconKind('Dockerfile', false)).toBe('config');
    expect(fileIconKind('Makefile', false)).toBe('terminal');
    expect(fileIconKind('README', false)).toBe('document');
  });

  it('ist case-insensitiv', () => {
    expect(fileIconKind('TEST.PNG', false)).toBe('image');
    expect(fileIconKind('Dockerfile', false)).toBe('config');
  });

  it('faellt auf file zurueck, wenn keine (erkannte) Endung vorhanden ist', () => {
    expect(fileIconKind('Makefile.bak', false)).toBe('file');
    expect(fileIconKind('noext', false)).toBe('file');
  });

  it('behandelt leere und nur-Whitespace-Namen', () => {
    expect(fileIconKind('', false)).toBe('file');
    expect(fileIconKind('   ', false)).toBe('file');
  });

  it('erkennt Praesentationen, Binaries und Zertifikate', () => {
    expect(fileIconKind('vortrag.pptx', false)).toBe('presentation');
    expect(fileIconKind('programm.exe', false)).toBe('binary');
    expect(fileIconKind('disk.iso', false)).toBe('binary');
    expect(fileIconKind('key.pem', false)).toBe('cert');
    expect(fileIconKind('private.key', false)).toBe('cert');
  });

  it('erkennt Daten- und Notebook-Dateien', () => {
    expect(fileIconKind('daten.parquet', false)).toBe('data');
    expect(fileIconKind('notebook.ipynb', false)).toBe('data');
    expect(fileIconKind('blob.avro', false)).toBe('data');
  });

  it('erkennt weitere Sprachen, Konfig- und Build-Dateien', () => {
    expect(fileIconKind('alt.cobol', false)).toBe('code');
    expect(fileIconKind('seite.aspx', false)).toBe('code');
    expect(fileIconKind('yarn.lock', false)).toBe('config');
    expect(fileIconKind('build.gradle', false)).toBe('config');
    expect(fileIconKind('infra.tf', false)).toBe('config');
  });

  it('erkennt weniger gebraeuchliche Medien- und Doku-Endungen', () => {
    expect(fileIconKind('bild.avif', false)).toBe('image');
    expect(fileIconKind('clip.3gp', false)).toBe('video');
    expect(fileIconKind('song.aiff', false)).toBe('audio');
    expect(fileIconKind('buch.mobi', false)).toBe('document');
  });
});

describe('FileIcon', () => {
  it('rendert ein Icon ohne zu werfen', () => {
    expect(() => render(<FileIcon name="photo.png" isDirectory={false} />)).not.toThrow();
  });

  it('rendert ein Ordner-Icon fuer Verzeichnisse', () => {
    const { container } = render(<FileIcon name="src" isDirectory />);
    expect(container.querySelector('svg')).toBeTruthy();
  });
});

describe('FileIcon (typ-spezifisch, nicht nur gruppenweise)', () => {
  function svgFor(name: string, isDirectory = false): string {
    const { container } = render(<FileIcon name={name} isDirectory={isDirectory} />);
    const svg = container.querySelector('svg');
    if (!svg) {
      throw new Error('kein svg gerendert');
    }
    return svg.outerHTML;
  }

  it('unterscheidet Dokument-Typen (md vs txt vs pdf)', () => {
    expect(svgFor('notes.md')).not.toBe(svgFor('notes.txt'));
    expect(svgFor('notes.md')).not.toBe(svgFor('doc.pdf'));
    expect(svgFor('notes.txt')).not.toBe(svgFor('doc.pdf'));
  });

  it('unterscheidet Sprachen (ts vs js vs html vs css)', () => {
    const variants = ['a.ts', 'a.js', 'a.html', 'a.css'].map((f) => svgFor(f));
    expect(new Set(variants).size).toBe(variants.length);
  });

  it('unterscheidet Tabellen (csv vs xlsx) und Pakete (zip vs jar)', () => {
    expect(svgFor('d.csv')).not.toBe(svgFor('d.xlsx'));
    expect(svgFor('bundle.zip')).not.toBe(svgFor('bundle.jar'));
  });

  it('laesst gleichartige Formate bewusst gleich aus (png/jpg sind beide Bilder)', () => {
    expect(svgFor('a.png')).toBe(svgFor('b.jpg'));
  });

  it('rendert Sprachen als farbige Markenlogos (Devicon) statt generischer MUI-Glyphen', () => {
    // Sprachlogos haben eigene Brand-Farben (Hex-Fills); MUI-Icons nutzen currentColor.
    expect(svgFor('app.py')).toMatch(/#[0-9a-f]{6}/i);
    expect(svgFor('app.go')).toMatch(/#[0-9a-f]{6}/i);
    expect(svgFor('app.tsx')).toMatch(/#[0-9a-f]{6}/i);
    // Nicht-Sprache (Text) bleibt beim MUI-Icon ohne eigenes Hex-Fill.
    expect(svgFor('note.txt')).not.toMatch(/#[0-9a-f]{6}/i);
  });
});
