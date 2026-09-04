import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const protocolMock = vi.hoisted(() => ({ handle: vi.fn(), registerSchemesAsPrivileged: vi.fn() }));
vi.mock('electron', () => ({ protocol: protocolMock }));
vi.mock('electron-log', () => ({ default: { warn: vi.fn() } }));

import { registerPluginProtocol, registerPluginSchemePrivileges } from '../src/main/plugin/plugin-protocol.js';

let dir: string | undefined;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ssh-plugins-'));
  await mkdir(join(dir, 'sample'), { recursive: true });
  protocolMock.handle.mockReset();
  protocolMock.registerSchemesAsPrivileged.mockReset();
});

afterEach(async () => {
  if (dir) {
    await rm(dir, { recursive: true, force: true });
    dir = undefined;
  }
});

function getHandler(): (request: { url: string }) => Promise<Response> {
  registerPluginProtocol(dir!);
  return protocolMock.handle.mock.calls[0]![1] as (request: { url: string }) => Promise<Response>;
}

describe('plugin:// protocol', () => {
  it('registriert das Schema (registerPluginSchemePrivileges)', () => {
    registerPluginSchemePrivileges();
    expect(protocolMock.registerSchemesAsPrivileged).toHaveBeenCalled();
  });

  it('serviert HTML und injiziert die sshCentral-Bridge', async () => {
    await writeFile(join(dir!, 'sample', 'index.html'), '<html><head></head><body>Hello</body></html>', 'utf8');
    const handler = getHandler();

    const res = await handler({ url: 'plugin://sample/index.html' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(res.headers.get('content-security-policy')).toContain("script-src 'self' 'unsafe-inline'");
    const body = await res.text();
    expect(body).toContain('window.sshCentral');
    expect(body).toContain('Hello');
  });

  it('serviert JS ohne Bridge-Injection', async () => {
    await writeFile(join(dir!, 'sample', 'app.js'), 'console.log(1)', 'utf8');
    const handler = getHandler();

    const res = await handler({ url: 'plugin://sample/app.js' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/javascript');
    expect(await res.text()).toBe('console.log(1)');
  });

  it('blockiert Path-Traversal (403)', async () => {
    const handler = getHandler();
    const res = await handler({ url: 'plugin://sample/..%2fsecret.txt' });
    expect(res.status).toBe(403);
  });

  it('liefert 404 bei fehlender Datei', async () => {
    const handler = getHandler();
    const res = await handler({ url: 'plugin://sample/nicht-da.js' });
    expect(res.status).toBe(404);
  });

  it('liefert fuer wiederholte Aufrufe stabiles, bridge-injiziertes HTML (Cache, Punkt 3)', async () => {
    await writeFile(join(dir!, 'sample', 'index.html'), '<html><head></head></html>', 'utf8');
    const handler = getHandler();
    const r1 = await handler({ url: 'plugin://sample/index.html' });
    const r2 = await handler({ url: 'plugin://sample/index.html' });
    const t1 = await r1.text();
    const t2 = await r2.text();
    expect(t1).toBe(t2);
    expect(t2).toContain('window.sshCentral');
  });

  it('invalidiert den Asset-Cache bei Dateiaenderung (mtime/size, Punkt 3)', async () => {
    await writeFile(join(dir!, 'sample', 'app.js'), 'x', 'utf8');
    const handler = getHandler();
    await handler({ url: 'plugin://sample/app.js' });

    // Groessere Datei -> size aendert sich -> Cache muss invalidieren.
    await writeFile(join(dir!, 'sample', 'app.js'), 'const y = 2;', 'utf8');
    const res = await handler({ url: 'plugin://sample/app.js' });
    expect(await res.text()).toBe('const y = 2;');
  });
});
