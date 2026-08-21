import path from 'node:path';

/** Schutz vor offensichtlich unsicheren Pfaden (Traversal nach oben, relative Pfade). */
export function assertSafePath(p: string): void {
  if (!path.isAbsolute(p)) {
    throw new Error('Nur absolute Pfade sind erlaubt.');
  }
  if (p.includes('\0')) {
    throw new Error('Ungueltiger Pfad.');
  }
}

// Kritische Systempfade, die von destruktiven Ops (Loeschen/Umbenennen/Anlegen) ausgenommen sind.
const PROTECTED_PATHS: string[] =
  process.platform === 'win32'
    ? ['C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)', 'C:\\ProgramData']
    : ['/etc', '/usr', '/bin', '/sbin', '/boot', '/dev', '/proc', '/sys', '/lib', '/lib64', '/root'];

/**
 * Verhindert destruktive Operationen (Loeschen/Umbenennen/Anlegen) auf dem Dateisystem-Root
 * und in kritischen Systemverzeichnissen (Defense-in-Depth gegen Renderer-Kompromittierung).
 */
export function assertNotProtected(p: string): void {
  const trimmed = p.replace(/[\\/]+$/, '');
  // Root erkennen: "/", "//", "C:\", "C:/" (trailing Slashes werden vorher entfernt).
  if (trimmed === '' || trimmed === '/' || /^[a-zA-Z]:$/.test(trimmed)) {
    throw new Error('Dieser Systempfad ist geschuetzt.');
  }
  const lower = trimmed.toLowerCase();
  for (const sys of PROTECTED_PATHS) {
    const sysLower = sys.toLowerCase();
    if (lower === sysLower || lower.startsWith(sysLower + path.sep)) {
      throw new Error('Dieser Systempfad ist geschuetzt.');
    }
  }
}
