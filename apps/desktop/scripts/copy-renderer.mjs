// Kopiert den gebauten Renderer in den Desktop-Output, damit electron-builder alles
// in einem Artefakt buendeln kann (out/renderer/*).
//
// Der Renderer wird NICHT hier gebaut: `@ssh-central/renderer` ist devDependency von
// `@ssh-central/desktop`, dadurch baut Turbo ihn garantiert VORHER. Frueher rief dieses
// Paket zusaetzlich `pnpm --dir ../renderer build` auf - da Turbo ohne die Abhaengigkeit
// keine Reihenfolge kannte, liefen zwei Vite-Builds gleichzeitig in dasselbe `dist/` und
// zerstoerten sich gegenseitig (sporadisches ENOENT auf die Sourcemap).
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const rendererDist = resolve(here, '../../renderer/dist');
const target = resolve(here, '../out/renderer');

if (!existsSync(rendererDist)) {
  console.error(
    `[copy-renderer] Renderer-Build fehlt: ${rendererDist}\n` +
      'Bitte den Build ueber Turbo starten (baut die Pakete in der richtigen Reihenfolge):\n' +
      '  pnpm build                 # gesamtes Monorepo\n' +
      '  pnpm build:desktop         # Desktop inkl. Abhaengigkeiten\n' +
      'Ein direktes "pnpm --filter @ssh-central/desktop build" ueberspringt den Renderer.',
  );
  process.exit(1);
}

mkdirSync(target, { recursive: true });
cpSync(rendererDist, target, { recursive: true });
console.log('[copy-renderer] copied', rendererDist, '->', target);
