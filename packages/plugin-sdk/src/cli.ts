import { build } from 'esbuild';
import AdmZip from 'adm-zip';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, basename } from 'node:path';

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

/** Packt den Plugin-Ordner (package.json + dist + ui + assets) in ein installierbares ZIP. */
export async function packPlugin(dir = process.cwd(), outDir = dir): Promise<string> {
  const pkg = await readPkg(dir);
  const zip = new AdmZip();
  const skip = new Set(['node_modules', '.git', '.vite', '.turbo', basename(outDir)]);
  zip.addLocalFolder(dir, '', (name: string) => {
    const parts = name.split('/');
    return !parts.some((p) => skip.has(p) || (p.startsWith('.') && p !== '.ssh-central'));
  });
  const zipName = `${pkg.name}-${pkg.version}.zip`;
  const out = join(outDir, zipName);
  await mkdir(outDir, { recursive: true });
  zip.writeZip(out);
  return out;
}
