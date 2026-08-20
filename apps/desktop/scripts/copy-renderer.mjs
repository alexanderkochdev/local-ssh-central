// Kopiert den gebauten Renderer in den Desktop-Output, damit electron-builder alles
// in einem Artefakt buendeln kann (out/renderer/*).
import { cpSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const rendererDist = resolve(here, '../../renderer/dist');
const target = resolve(here, '../out/renderer');

mkdirSync(target, { recursive: true });
cpSync(rendererDist, target, { recursive: true });
console.log('[copy-renderer] copied', rendererDist, '->', target);
