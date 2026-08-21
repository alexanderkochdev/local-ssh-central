import { protocol } from 'electron';
import log from 'electron-log/main';
import { promises as fs } from 'node:fs';
import { normalize, join, isAbsolute, sep, extname } from 'node:path';

const SCHEME = 'app';
const HOST = 'bundle';

// Strenge CSP fuer die gebaute App. Wird NUR in Produktion gesetzt (hier im
// Protocol-Handler); im Dev-Modus serviert Vite ueber http ohne CSP, damit
// Hot Reload / Fast Refresh (unsafe-eval) funktioniert.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self' plugin://*",
].join('; ');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/**
 * Registriert die Privilegien fuer das custom `app://`-Schema.
 * MUSS vor `app.whenReady()` aufgerufen werden.
 *
 * In manchen electron-vite-/Electron-Kontexten ist `electron.protocol` beim fruehen
 * Modul-Load noch nicht verfuegbar. Im Dev-Modus brauchen wir es nicht (Renderer laeuft
 * ueber http:// und HMR) - deshalb wird hier defensiv abgebrochen statt zu crashen.
 */
export function registerAppSchemePrivileges(): void {
  if (!protocol || typeof protocol.registerSchemesAsPrivileged !== 'function') {
    log.warn('[main] protocol not available yet - scheme registration skipped (dev-mode ok)');
    return;
  }
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
      },
    },
  ]);
}

/**
 * Serviert die gebauten Renderer-Dateien ueber `app://bundle/...`.
 *
 * Grund: Vite baut ES-Module (`<script type="module">`), die ueber `file://`
 * wegen CORS/opaque-origin NICHT geladen werden koennen. Ein custom-Schema
 * loest das. Die Dateien werden per `fs.readFile` gelesen (asar-bewusst),
 * statt via `net.fetch` auf eine file://-URL (die asar nicht aufloest).
 */
export function registerAppProtocol(rendererDir: string): void {
  if (!protocol || typeof protocol.handle !== 'function') {
    log.warn('[main] protocol not available yet - app:// handler skipped (dev-mode ok)');
    return;
  }
  protocol.handle(SCHEME, async (request) => {
    try {
      const url = new URL(request.url);
      if (url.host !== HOST) {
        return new Response('Not found', { status: 404 });
      }
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === '/' || pathname === '') {
        pathname = '/index.html';
      }

      const root = normalize(rendererDir);
      const file = normalize(join(root, pathname));
      if (!isAbsolute(file) || !file.startsWith(root + sep)) {
        return new Response('Forbidden', { status: 403 });
      }

      const data = await fs.readFile(file);
      const type = MIME_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
      const headers: Record<string, string> = { 'content-type': type };
      if (type.includes('text/html')) {
        headers['content-security-policy'] = CSP;
      }
      return new Response(data, { headers });
    } catch {
      return new Response('Bad request', { status: 400 });
    }
  });
}

/** Liefert die Produktions-URL des Renderers. */
export function rendererUrl(): string {
  return `${SCHEME}://${HOST}/index.html`;
}
