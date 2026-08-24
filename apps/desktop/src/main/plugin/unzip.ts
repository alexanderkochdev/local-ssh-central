import unzipper from 'unzipper';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

/**
 * Entpackt eine ZIP-Datei sicher in das Zielverzeichnis (Zip-Slip-Schutz):
 * Entries, die außerhalb des Zielverzeichnisses landen würden (Path Traversal),
 * werden übersprungen. Liefert die absoluten Pfade der geschriebenen Dateien.
 */
export async function extractZip(zipPath: string, targetDir: string): Promise<string[]> {
  const zip = await unzipper.Open.file(zipPath);
  const root = resolve(targetDir);
  const written: string[] = [];

  for (const entry of zip.files) {
    const dest = resolve(root, entry.path);
    if (dest !== root && !dest.startsWith(root + sep)) {
      continue; // Zip-Slip / absolute Pfade im Archiv abwehren.
    }
    if (entry.type === 'Directory') {
      continue;
    }
    await mkdir(dirname(dest), { recursive: true });
    await new Promise<void>((resolveWrite, rejectWrite) => {
      entry
        .stream()
        .pipe(createWriteStream(dest))
        .on('finish', () => {
          written.push(dest);
          resolveWrite();
        })
        .on('error', rejectWrite);
    });
  }
  return written;
}
