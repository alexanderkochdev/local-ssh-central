import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const protocolMock = vi.hoisted(() => ({ handle: vi.fn(), registerSchemesAsPrivileged: vi.fn() }));
vi.mock('electron', () => ({ protocol: protocolMock }));
vi.mock('electron-log/main', () => ({ default: { warn: vi.fn() } }));

import { registerAppProtocol, registerAppSchemePrivileges, rendererUrl } from '../src/main/protocol.js';

let dir: string | undefined;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ssh-renderer-'));
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
  registerAppProtocol(dir!);
  return protocolMock.handle.mock.calls[0]![1] as (request: { url: string }) => Promise<Response>;
}

describe('app:// protocol', () => {
  it('rendererUrl liefert die Produktions-URL', () => {
    expect(rendererUrl()).toBe('app://bundle/index.html');
  });

  it('registerAppSchemePrivileges registriert das Schema', () => {
    registerAppSchemePrivileges();
    expect(protocolMock.registerSchemesAsPrivileged).toHaveBeenCalled();
  });

  it('serviert index.html mit CSP und html-Mime', async () => {
    await writeFile(join(dir!, 'index.html'), '<html><body>App</body></html>', 'utf8');
    const handler = getHandler();

    const res = await handler({ url: 'app://bundle/index.html' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
    await expect(res.text()).resolves.toContain('<html>');
  });

  it('liefert index.html fuer die Wurzel', async () => {
    await writeFile(join(dir!, 'index.html'), 'root', 'utf8');
    const handler = getHandler();
    const res = await handler({ url: 'app://bundle/' });
    expect(res.status).toBe(200);
  });

  it('setzt js-Mime fuer .js', async () => {
    await writeFile(join(dir!, 'main.js'), 'export {}', 'utf8');
    const handler = getHandler();
    const res = await handler({ url: 'app://bundle/main.js' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/javascript');
  });

  it('lehnt einen fremden Host ab (404)', async () => {
    const handler = getHandler();
    const res = await handler({ url: 'app://other/index.html' });
    expect(res.status).toBe(404);
  });

  it('blockiert Path-Traversal (403)', async () => {
    const handler = getHandler();
    // Encodierter Slash ("..%2f"): der URL-Parser normalisiert reine ".." Segmente weg,
    // aber dieser Pfad ueberlebt und wird erst im Handler zu "../" dekodiert -> muss
    // strikt ausserhalb des Roots landen.
    const res = await handler({ url: 'app://bundle/..%2fsecret.txt' });
    expect(res.status).toBe(403);
  });

  it('liefert 400 bei fehlender Datei', async () => {
    const handler = getHandler();
    const res = await handler({ url: 'app://bundle/nicht-vorhanden.js' });
    expect(res.status).toBe(400);
  });
});
