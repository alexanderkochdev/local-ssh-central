import { protocol } from 'electron';
import { promises as fs } from 'node:fs';
import { normalize, join, isAbsolute, sep, extname } from 'node:path';
import log from 'electron-log';

const SCHEME = 'plugin';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/** Bridge-Script, das in jede Plugin-HTML-Seite injiziert wird -> `window.sshCentral`. */
const BRIDGE_SCRIPT = `<script>
(function(){
  var pending = {}, seq = 0;
  function post(m){ window.parent.postMessage(Object.assign({__ssh:true}, m), '*'); }
  window.sshCentral = {
    invoke: function(c, p){ return new Promise(function(res, rej){ var id = ++seq; pending[id] = { res: res, rej: rej }; post({type:'invoke', id:id, channel:c, payload:p}); }); },
    send: function(c, p){ post({type:'send', channel:c, payload:p}); },
    onMessage: function(f){ window.__sshOnMessage = f; },
    on: function(c, f){ window.__sshOn = window.__sshOn || {}; window.__sshOn[c] = f; },
    onStream: function(c, f){ window.__sshStream = window.__sshStream || {}; window.__sshStream[c] = f; }
  };
  window.addEventListener('message', function(e){
    var d = e.data; if (!d || !d.__ssh) return;
    if (d.type === 'response') {
      var p = pending[d.id];
      if (p) { if (d.ok) { p.res(d.value); } else { p.rej(new Error(d.error || 'error')); } delete pending[d.id]; }
    } else if (d.type === 'push') {
      var f = window.__sshOn && window.__sshOn[d.channel];
      var s = window.__sshStream && window.__sshStream[d.channel];
      var m = window.__sshOnMessage;
      if (f) f(d.payload); if (s) s(d.payload); if (m) m(d);
    }
  });
})();
</script>`;

export function registerPluginSchemePrivileges(): void {
  if (!protocol || typeof protocol.registerSchemesAsPrivileged !== 'function') {
    log.warn('[plugin] scheme registration skipped (dev-mode ok)');
    return;
  }
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: false },
    },
  ]);
}

/** Gecachtes plugin://-Asset (entweder HTML mit CSP/Bridge oder Rohbytes). */
interface CachedAsset {
  type: string;
  csp?: string;
  html?: string;
  bytes?: Uint8Array;
  mtimeMs: number;
  size: number;
}

function buildResponse(entry: CachedAsset): Response {
  const headers: Record<string, string> = { 'content-type': entry.type };
  if (entry.csp) headers['content-security-policy'] = entry.csp;
  if (entry.html !== undefined) return new Response(entry.html, { headers });
  return new Response(entry.bytes as Uint8Array, { headers });
}

/** Registriert das plugin://-Protocol: serviert Dateien aus userData/plugins/<name>/. */
export function registerPluginProtocol(pluginsDir: string): void {
  if (!protocol || typeof protocol.handle !== 'function') {
    log.warn('[plugin] protocol handler skipped');
    return;
  }

  // Static-Asset-Cache (Punkt 3): vermeidet wiederholtes Disk-Read + Bridge-Injection
  // bei jedem erneuten Laden einer Plugin-UI (Tab-Wechsel, Refresh). Wird bei
  // Aenderung (mtime/size) invalidiert und ist groessen-begrenzt (LRU).
  const assetCache = new Map<string, CachedAsset>();
  const MAX_CACHED = 128;

  protocol.handle(SCHEME, async (request) => {
    try {
      const url = new URL(request.url);
      const pluginName = url.host;
      const pathname = decodeURIComponent(url.pathname);
      const root = normalize(join(pluginsDir, pluginName));
      const file = normalize(join(root, pathname));
      if (!isAbsolute(file) || !file.startsWith(root + sep)) {
        return new Response('Forbidden', { status: 403 });
      }

      const stat = await fs.stat(file);
      const cached = assetCache.get(file);
      if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
        return buildResponse(cached);
      }

      const data = await fs.readFile(file);
      const type = MIME_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
      let entry: CachedAsset;
      if (type.includes('text/html')) {
        const csp =
          "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:";
        // Bridge in die Plugin-Seite injizieren (nur einmal cachen, nicht je Request).
        const html = data.toString('utf8').replace('</head>', BRIDGE_SCRIPT + '</head>');
        entry = { type, csp, html, mtimeMs: stat.mtimeMs, size: stat.size };
      } else {
        entry = { type, bytes: new Uint8Array(data), mtimeMs: stat.mtimeMs, size: stat.size };
      }
      assetCache.set(file, entry);
      if (assetCache.size > MAX_CACHED) {
        const first = assetCache.keys().next().value;
        if (first !== undefined) assetCache.delete(first);
      }
      return buildResponse(entry);
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}
