// Generiert App-Icons (icon.ico fuer Windows, icon.png fuer Linux) aus ssh-central-logo.png.
import pngToIco from 'png-to-ico';
import { writeFile, mkdir, copyFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const buildDir = resolve(here, '../build');
const source = resolve(here, '../../..', 'ssh-central-logo.png');

await mkdir(buildDir, { recursive: true });
await copyFile(source, resolve(buildDir, 'icon.png'));
const ico = await pngToIco(source);
await writeFile(resolve(buildDir, 'icon.ico'), ico);
console.log('[icons] generated build/icon.png + build/icon.ico');
