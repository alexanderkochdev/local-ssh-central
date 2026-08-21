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
window.sshCentral=(function(){function post(m){window.parent.postMessage(Object.assign({__ssh:true},m),'*')}var pending={},seq=0;return{invoke:function(c,p){return new Promise(function(res,rej){var id=++seq;pending[id]={res:res,rej:rej};post({type:'invoke',id:id,channel:c,payload:p})})},send:function(c,p){post({type:'send',channel:c,payload:p})},onMessage:function(f){window.__sshOnMessage=f},on:function(c,f){window.__sshOn=window.__sshOn||{};window.__sshOn[c]=f},onStream:function(c,f){window.__sshStream=window.__sshStream||{};window.__sshStream[c]=f}}})();
window.addEventListener('message',function(e){var d=e.data;if(!d||!d.__ssh)return;if(d.type==='response'){var p=pending[d.id];if(p){if(d.ok){p.res(d.value)}else{p.rej(new Error(d.error||'error'))}delete pending[d.id]}}else if(d.type==='push'){var f=window.__sshOn&&window.__sshOn[d.channel],s=window.__sshStream&&window.__sshStream[d.channel],m=window.__sshOnMessage;if(f)f(d.payload);if(s)s(d.payload);if(m)m(d)}});
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

/** Registriert das plugin://-Protocol: serviert Dateien aus userData/plugins/<name>/. */
export function registerPluginProtocol(pluginsDir: string): void {
  if (!protocol || typeof protocol.handle !== 'function') {
    log.warn('[plugin] protocol handler skipped');
    return;
  }
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
      const data = await fs.readFile(file);
      const type = MIME_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
      const headers: Record<string, string> = { 'content-type': type };
      if (type.includes('text/html')) {
        headers['content-security-policy'] =
          "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:";
        // Bridge in die Plugin-Seite injizieren.
        const html = data.toString('utf8').replace('</head>', BRIDGE_SCRIPT + '</head>');
        return new Response(html, { headers });
      }
      return new Response(data, { headers });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}
