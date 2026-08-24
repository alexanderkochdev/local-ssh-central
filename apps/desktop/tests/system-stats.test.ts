import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => 'C:/data'), getGPUInfo: vi.fn() },
}));
vi.mock('node:fs', () => ({ promises: { readdir: vi.fn(), stat: vi.fn(), readFile: vi.fn() } }));
vi.mock('node:child_process', () => ({
  // Netzwerk nicht verfügbar -> execFile meldet einen Fehler, Zähler bleiben 0.
  execFile: vi.fn((_f: string, _a: string[], _o: unknown, cb: (err: Error | null, out?: string) => void) =>
    cb(new Error('no network')),
  ),
}));

import { app } from 'electron';
import { promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import { collectSystemStats } from '../src/main/services/system-stats.js';

beforeEach(() => {
  // process.getCPUUsage ist Electron-spezifisch und fehlt im Node-Testumfeld.
  (process as unknown as { getCPUUsage: () => { percentCPUUsage: number } }).getCPUUsage = () => ({
    percentCPUUsage: 7,
  });
  vi.mocked(app.getPath).mockReturnValue('C:/data');
  vi.mocked(app.getGPUInfo).mockResolvedValue({ gpuDevice: [{ deviceName: 'Intel UHD' }] });
  // Leeres App-Datenverzeichnis -> eigener Disk-Verbrauch 0 MB.
  vi.mocked(fs.readdir).mockResolvedValue([]);
});

describe('collectSystemStats', () => {
  it('liefert nur den eigenen Verbrauch + Netzwerk-Rate', async () => {
    const stats = await collectSystemStats();

    expect(stats.cpu.appPercent).toBe(7);
    expect(stats.memory.appRssMb).toBeGreaterThan(0);

    expect(stats.gpu.name).toBe('Intel UHD');

    expect(stats.disk.appDataMb).toBe(0);

    // Erster Aufruf: noch kein vorheriges Sample -> Rate 0.
    expect(stats.network.upKbps).toBe(0);
    expect(stats.network.downKbps).toBe(0);
    // Ohne gestarteten Ping-Loop gibt es noch keine Latenz.
    expect(stats.network.latencyMs).toBeUndefined();
    expect(stats.timestamp).toBeGreaterThan(0);
  });

  it('faengt fehlende GPU-Info ab', async () => {
    vi.mocked(app.getGPUInfo).mockRejectedValue(new Error('no gpu'));
    const stats = await collectSystemStats();
    expect(stats.gpu.name).toBeUndefined();
  });

  it('berechnet die Netzwerk-Rate über zwei Messungen', async () => {
    let rx = 1_000_000;
    // Plattformabhaengig: Windows liest `netstat -e`, Linux `/proc/net/dev`.
    if (process.platform === 'win32') {
      (execFile as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (_f: string, _a: string[], _o: unknown, cb: (err: Error | null, out?: string) => void) => {
          rx += 102_400; // +100 KB pro Messung
          cb(null, `Bytes                ${rx}            ${rx}`);
        },
      );
    } else {
      vi.mocked(fs.readFile).mockImplementation(async () => {
        rx += 102_400; // +100 KB pro Messung
        return `  eth0: ${rx} 0 0 0 0 0 0 0 ${rx} 0 0 0 0 0 0 0\n`;
      });
    }

    // Erstes Sample setzt prevNet; die zweite Messung (nach Pause, damit dtSec > 0)
    // liefert eine positive Up-/Download-Rate.
    await collectSystemStats();
    await new Promise((resolve) => setTimeout(resolve, 30));

    const second = await collectSystemStats();
    expect(second.network.upKbps).toBeGreaterThan(0);
    expect(second.network.downKbps).toBeGreaterThan(0);
  });
});
