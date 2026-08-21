import { build } from 'esbuild';
import AdmZip from 'adm-zip';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

interface PluginPkg {
  name: string;
  version: string;
  main?: string;
}

async function readPkg(dir: string): Promise<PluginPkg> {
  const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')) as PluginPkg;
  if (!pkg.name || !pkg.version) {
    throw new Error('package.json braucht "name" und "version".');
  }
  return pkg;
}

/** Buendelt das Plugin (TS/ESM) zu einer CommonJS-Datei `dist/index.cjs`. */
export async function buildPlugin(dir = process.cwd()): Promise<string> {
  const pkg = await readPkg(dir);
  const entry = join(dir, 'src', 'index.ts');
  const outfile = join(dir, 'dist', 'index.cjs');
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    sourcemap: false,
  });
  pkg.main = 'dist/index.cjs';
  await writeFile(join(dir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  return outfile;
}

/**
 * Packt den Plugin-Ordner in ein installierbares ZIP (Whitelist). Enthalten sind
 * ausschliesslich `package.json`, `dist/`, `ui/`, `assets/`, `LICENSE` und
 * `.ssh-central` - kein `node_modules`, keine Doku, keine versteckten Dateien
 * und nie das zuvor erzeugte Output-ZIP.
 */
export async function packPlugin(dir = process.cwd(), outDir = dir): Promise<string> {
  const pkg = await readPkg(dir);
  const zipName = `${pkg.name}-${pkg.version}.zip`;
  const zip = new AdmZip();
  // Whitelist der erlaubten Top-Level-Eintraege (deterministisch und plattformunabhaengig).
  const allowedTop = new Set(['package.json', 'dist', 'ui', 'assets', 'LICENSE', 'LICENSE.md', '.ssh-central']);
  zip.addLocalFolder(dir, '', (name: string) => {
    // adm-zip liefert auf Windows Pfade mit Backslash -> fuer den Filter normalisieren.
    const normalized = name.replace(/\\/g, '/');
    if (normalized === zipName) {
      return false;
    }
    return allowedTop.has(normalized.split('/')[0] ?? '');
  });
  const out = join(outDir, zipName);
  await mkdir(outDir, { recursive: true });
  zip.writeZip(out);
  return out;
}
