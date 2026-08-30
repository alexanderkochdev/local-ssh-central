import type { ElementType } from 'react';
import ImageIcon from '@mui/icons-material/Image';
import MovieIcon from '@mui/icons-material/Movie';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import SlideshowIcon from '@mui/icons-material/Slideshow';
import DescriptionIcon from '@mui/icons-material/Description';
import ArticleIcon from '@mui/icons-material/Article';
import TextSnippetIcon from '@mui/icons-material/TextSnippet';
import TableChartIcon from '@mui/icons-material/TableChart';
import TableRowsIcon from '@mui/icons-material/TableRows';
import TableViewIcon from '@mui/icons-material/TableView';
import GridOnIcon from '@mui/icons-material/GridOn';
import DataObjectIcon from '@mui/icons-material/DataObject';
import SchemaIcon from '@mui/icons-material/Schema';
import CodeIcon from '@mui/icons-material/Code';
import SettingsIcon from '@mui/icons-material/Settings';
import TuneIcon from '@mui/icons-material/Tune';
import ArchiveIcon from '@mui/icons-material/Archive';
import FolderZipIcon from '@mui/icons-material/FolderZip';
import TerminalIcon from '@mui/icons-material/Terminal';
import StorageIcon from '@mui/icons-material/Storage';
import MemoryIcon from '@mui/icons-material/Memory';
import KeyIcon from '@mui/icons-material/Key';
import FontDownloadIcon from '@mui/icons-material/FontDownload';
import BuildIcon from '@mui/icons-material/Build';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import HistoryIcon from '@mui/icons-material/History';
import FolderIcon from '@mui/icons-material/Folder';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import deviconData from './devicon.json';
import type { DeviconIconData, DeviconJson, FileIconKind, FileIconSelection, IconColor } from './fileIcons.types.js';

/* -------------------------------------------------------------------------- */
/*  Dateiendung -> Gruppe (kuratierte, praezise Zuordnung)                    */
/* -------------------------------------------------------------------------- */

const IMAGE = new Set(['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tiff', 'tif', 'heic', 'avif', 'psd']);
const VIDEO = new Set(['mp4', 'mkv', 'avi', 'mov', 'webm', 'm4v', 'flv', 'wmv', 'mpg', 'mpeg', '3gp', 'ogv']);
const AUDIO = new Set(['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'wma', 'opus', 'aiff', 'm3u']);
const ARCHIVE = new Set([
  'zip',
  'tar',
  'gz',
  'tgz',
  'bz2',
  'xz',
  '7z',
  'rar',
  'jar',
  'war',
  'ear',
  'apk',
  'deb',
  'rpm',
  'cab',
  'zst',
  'lz',
]);
const PDF = new Set(['pdf']);
const PRESENTATION = new Set(['ppt', 'pptx', 'odp']);
const DOCUMENT = new Set([
  'doc',
  'docx',
  'odt',
  'rtf',
  'txt',
  'md',
  'rst',
  'tex',
  'pages',
  'epub',
  'mobi',
  'djvu',
  'odg',
  'ott',
]);
const SPREADSHEET = new Set(['xls', 'xlsx', 'ods', 'csv', 'numbers', 'tsv']);
const CODE = new Set([
  'ts',
  'tsx',
  'cts',
  'mts',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'py',
  'rb',
  'go',
  'rs',
  'java',
  'c',
  'h',
  'cpp',
  'cc',
  'cxx',
  'hpp',
  'cs',
  'php',
  'swift',
  'kt',
  'kts',
  'scala',
  'lua',
  'html',
  'htm',
  'css',
  'scss',
  'sass',
  'less',
  'vue',
  'svelte',
  'dart',
  'elixir',
  'ex',
  'exs',
  'erlang',
  'hs',
  'haskell',
  'clj',
  'clojure',
  'fs',
  'fsharp',
  'groovy',
  'jl',
  'julia',
  'nim',
  'pl',
  'perl',
  'r',
  'zig',
  'graphql',
  'sql',
  'prisma',
  'cobol',
  'fortran',
  'f90',
  'asm',
  's',
  'crystal',
  'raku',
  'matlab',
  'wl',
  'cshtml',
  'razor',
  'aspx',
  'vb',
  'vbs',
  'd',
  'lisp',
  'cl',
  'scm',
  'prolog',
  'ocaml',
  'ml',
  'purescript',
  'elm',
  'haxe',
  'gd',
  'wasm',
]);
const CONFIG = new Set([
  'json',
  'yaml',
  'yml',
  'toml',
  'ini',
  'conf',
  'cfg',
  'env',
  'properties',
  'xml',
  'editorconfig',
  'lock',
  'npmrc',
  'nvmrc',
  'dockerignore',
  'gradle',
  'csproj',
  'sln',
  'tf',
  'hcl',
  'tfstate',
  'gitmodules',
  'babelrc',
  'eslintrc',
  'prettierrc',
]);
const TERMINAL = new Set(['sh', 'bash', 'zsh', 'bat', 'cmd', 'ps1', 'fish']);
const DATABASE = new Set(['db', 'sqlite', 'sqlite3', 'mdb', 'dbf', 'accdb', 'duckdb']);
const DATA = new Set(['parquet', 'avro', 'feather', 'orc', 'arrow', 'jsonl', 'ndjson', 'ipynb', 'rdata']);
const FONT = new Set(['ttf', 'otf', 'woff', 'woff2', 'eot']);
const BINARY = new Set(['exe', 'dll', 'so', 'iso', 'bin', 'msi', 'dmg', 'appimage', 'elf', 'com']);
const CERT = new Set(['pem', 'crt', 'cer', 'p12', 'pfx', 'key', 'jks', 'keystore', 'asc', 'gpg']);

/** Spezielle Dateinamen (auch ohne Endung) -> Gruppe. */
const SPECIAL_NAME: Record<string, FileIconKind> = {
  dockerfile: 'config',
  makefile: 'terminal',
  '.gitignore': 'config',
  '.gitattributes': 'config',
  '.editorconfig': 'config',
  readme: 'document',
  license: 'document',
  changelog: 'document',
};

/** Liefert die Dateiendung (klein geschrieben) ohne Punkt, sonst ''. */
function extOf(lowerName: string): string {
  const dot = lowerName.lastIndexOf('.');
  return dot >= 0 ? lowerName.slice(dot + 1) : '';
}

/**
 * Loest einen Eintrag auf eine semantische Icon-Gruppe auf. Reine Funktion, damit
 * die Zuordnung isoliert testbar ist. Praezise kuratierte Listen entscheiden
 * ueber die Gruppe; unbekannte Endungen fallen auf das generische 'file'-Icon.
 */
export function fileIconKind(name: string, isDirectory: boolean): FileIconKind {
  if (isDirectory) {
    return 'folder';
  }
  const trimmed = name.trim();
  if (!trimmed) {
    return 'file';
  }
  const lower = trimmed.toLowerCase();
  const special = SPECIAL_NAME[lower];
  if (special) {
    return special;
  }
  const ext = extOf(lower);
  if (!ext) {
    return 'file';
  }
  if (IMAGE.has(ext)) return 'image';
  if (VIDEO.has(ext)) return 'video';
  if (AUDIO.has(ext)) return 'audio';
  if (ARCHIVE.has(ext)) return 'archive';
  if (PDF.has(ext)) return 'pdf';
  if (PRESENTATION.has(ext)) return 'presentation';
  if (SPREADSHEET.has(ext)) return 'spreadsheet';
  if (DATABASE.has(ext)) return 'database';
  if (DATA.has(ext)) return 'data';
  if (FONT.has(ext)) return 'font';
  if (BINARY.has(ext)) return 'binary';
  if (CERT.has(ext)) return 'cert';
  if (CODE.has(ext)) return 'code';
  if (CONFIG.has(ext)) return 'config';
  if (TERMINAL.has(ext)) return 'terminal';
  if (DOCUMENT.has(ext)) return 'document';
  return 'file';
}

/* -------------------------------------------------------------------------- */
/*  Farbe je Gruppe (Konsistenz beim Scannen)                                 */
/* -------------------------------------------------------------------------- */

const CATEGORY_COLOR: Record<FileIconKind, IconColor> = {
  folder: 'primary',
  image: 'success',
  video: 'error',
  audio: 'secondary',
  archive: 'warning',
  pdf: 'error',
  document: 'info',
  spreadsheet: 'success',
  presentation: 'secondary',
  code: 'secondary',
  config: 'warning',
  terminal: 'info',
  database: 'error',
  data: 'success',
  font: 'primary',
  binary: 'warning',
  cert: 'error',
  file: 'action',
};

/* -------------------------------------------------------------------------- */
/*  Fallback-Icon je Gruppe                                                    */
/* -------------------------------------------------------------------------- */

const CATEGORY_FALLBACK_ICON: Record<FileIconKind, ElementType> = {
  folder: FolderIcon,
  image: ImageIcon,
  video: MovieIcon,
  audio: MusicNoteIcon,
  archive: ArchiveIcon,
  pdf: PictureAsPdfIcon,
  document: DescriptionIcon,
  spreadsheet: TableChartIcon,
  presentation: SlideshowIcon,
  code: CodeIcon,
  config: SettingsIcon,
  terminal: TerminalIcon,
  database: StorageIcon,
  data: TableViewIcon,
  font: FontDownloadIcon,
  binary: MemoryIcon,
  cert: KeyIcon,
  file: InsertDriveFileIcon,
};

/* -------------------------------------------------------------------------- */
/*  Devicon-Sprachlogos (offline gebundelt, nur die benoetigten)              */
/* -------------------------------------------------------------------------- */

const devicon = deviconData as unknown as DeviconJson;

/** Dateiendung -> Devicon-Name. Nur Sprachen/Formate mit eigenem Logo. */
const LANG_DEVICON: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  cts: 'typescript',
  mts: 'typescript',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  c: 'c',
  h: 'c',
  cpp: 'cplusplus',
  cc: 'cplusplus',
  cxx: 'cplusplus',
  hpp: 'cplusplus',
  cs: 'csharp',
  php: 'php',
  swift: 'swift',
  kt: 'kotlin',
  kts: 'kotlin',
  scala: 'scala',
  lua: 'lua',
  html: 'html5',
  htm: 'html5',
  css: 'css',
  scss: 'css',
  sass: 'css',
  less: 'css',
  vue: 'vuejs',
  svelte: 'svelte',
  dart: 'dart',
  elixir: 'elixir',
  erlang: 'erlang',
  hs: 'haskell',
  haskell: 'haskell',
  clj: 'clojure',
  clojure: 'clojure',
  fs: 'fsharp',
  fsharp: 'fsharp',
  groovy: 'groovy',
  jl: 'julia',
  julia: 'julia',
  nim: 'nim',
  pl: 'perl',
  perl: 'perl',
  r: 'r',
  zig: 'zig',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  ps1: 'powershell',
  md: 'markdown',
};

/** Spezielle Dateinamen -> Devicon-Name. */
const SPECIAL_DEVICON: Record<string, string> = {
  dockerfile: 'docker',
  '.gitignore': 'git',
  '.gitattributes': 'git',
};

function deviconIcon(name: string): DeviconIconData | undefined {
  const entry = devicon.icons[name];
  if (!entry) {
    return undefined;
  }
  return { body: entry.body, width: devicon.width, height: devicon.height };
}

/* -------------------------------------------------------------------------- */
/*  Typ-spezifische Material-Icons (Fallback fuer alles nicht im Devicon)     */
/* -------------------------------------------------------------------------- */

const TYPE_ICON: Record<string, ElementType> = {
  // Dokumente
  doc: DescriptionIcon,
  docx: DescriptionIcon,
  odt: DescriptionIcon,
  rtf: TextSnippetIcon,
  txt: TextSnippetIcon,
  rst: ArticleIcon,
  tex: ArticleIcon,
  pages: DescriptionIcon,
  // Tabellen
  xls: TableChartIcon,
  xlsx: TableChartIcon,
  ods: GridOnIcon,
  numbers: TableChartIcon,
  csv: TableRowsIcon,
  // User-Definitionen (kein Sprachlogo im Devicon)
  graphql: SchemaIcon,
  prisma: SchemaIcon,
  // Konfiguration
  json: DataObjectIcon,
  yaml: TuneIcon,
  yml: TuneIcon,
  toml: TuneIcon,
  ini: SettingsIcon,
  conf: SettingsIcon,
  cfg: SettingsIcon,
  env: SettingsIcon,
  properties: SettingsIcon,
  xml: CodeIcon,
  editorconfig: SettingsIcon,
  // Archive / Pakete
  zip: FolderZipIcon,
  jar: ArchiveIcon,
  war: ArchiveIcon,
  ear: ArchiveIcon,
  apk: ArchiveIcon,
  deb: ArchiveIcon,
  rpm: ArchiveIcon,
  // Terminal / Skripte (sh/bash/zsh/ps1 sind Devicon, bat/cmd bleiben MUI)
  bat: TerminalIcon,
  cmd: TerminalIcon,
  // Datenbanken
  db: StorageIcon,
  sqlite: StorageIcon,
  sqlite3: StorageIcon,
  mdb: StorageIcon,
  dbf: StorageIcon,
  // Fonts
  ttf: FontDownloadIcon,
  otf: FontDownloadIcon,
  woff: FontDownloadIcon,
  woff2: FontDownloadIcon,
  eot: FontDownloadIcon,
};

/** Spezielle Dateinamen -> typ-spezifisches Material-Icon (ueberschreibt die Kategorie). */
const SPECIAL_TYPE_ICON: Record<string, ElementType> = {
  makefile: BuildIcon,
  '.editorconfig': SettingsIcon,
  readme: MenuBookIcon,
  license: HistoryIcon,
  changelog: HistoryIcon,
};

/**
 * Waehlt das passende Icon fuer einen Eintrag: ein buntes Devicon-Logo, falls
 * vorhanden, sonst ein Material-Icon mit Typfarbe. Reine Funktion, damit die
 * Zuordnung isoliert testbar bleibt.
 */
export function selectFileIcon(name: string, isDirectory: boolean): FileIconSelection {
  if (isDirectory) {
    return { muiIcon: FolderIcon, color: 'primary' };
  }

  const lower = name.trim().toLowerCase();
  const kind = fileIconKind(name, isDirectory);
  const color = CATEGORY_COLOR[kind];
  const ext = extOf(lower);

  const deviconName = SPECIAL_DEVICON[lower] ?? LANG_DEVICON[ext];
  const devicon = deviconName ? deviconIcon(deviconName) : undefined;

  const muiIcon = SPECIAL_TYPE_ICON[lower] ?? TYPE_ICON[ext] ?? CATEGORY_FALLBACK_ICON[kind] ?? InsertDriveFileIcon;

  return devicon ? { devicon, muiIcon, color } : { muiIcon, color };
}
