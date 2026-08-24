import { app } from 'electron';
import { promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import type { SystemStats } from '@ssh-central/ipc-contracts';

/** Letzter Netzwerk-Zählerstand für die Up-/Download-Rate. */
interface NetSample {
  rx: number;
  tx: number;
  at: number;
}
let prevNet: NetSample | null = null;

/** Caches die Größe des App-Datenverzeichnisses (teure rekursive Messung). */
let lastDiskAt = 0;
let cachedDiskMb = 0;
const DISK_CACHE_MS = 10_000;

// --------------------------------------------------------------- Latenz (Ping)
const PING_INTERVAL_MS = 5000;
let pingTarget = '8.8.8.8';
let lastLatencyMs: number | undefined;
let pingTimer: NodeJS.Timeout | null = null;

/**
 * Setzt das Ziel für die regelmäßige Latenz-Messung (Ping) und startet den Loop.
 * Wird beim Start und bei jeder UserSettings-Änderung aufgerufen.
 */
export function setPingTarget(target: string): void {
  const next = target?.trim() || '8.8.8.8';
  if (next === pingTarget && pingTimer) {
    return;
  }
  pingTarget = next;
  if (pingTimer) {
    clearInterval(pingTimer);
  }
  void measureLatency(pingTarget);
  pingTimer = setInterval(() => void measureLatency(pingTarget), PING_INTERVAL_MS);
}

async function measureLatency(target: string): Promise<void> {
  try {
    const args = process.platform === 'win32' ? ['-n', '1', target] : ['-c', '1', target];
    const out = await execFileAsync('ping', args, 4000);
    // Lokalisierungsunabhaengig: "time=12ms" (Linux) / "Zeit=12ms" (DE-Windows) / "time<12ms".
    const match = out.match(/(?:time|zeit)[=<]\s*(\d+(?:\.\d+)?)\s*ms/i);
    lastLatencyMs = match ? Math.round(Number(match[1])) : undefined;
  } catch {
    // Ziel nicht erreichbar / Ping fehlgeschlagen.
    lastLatencyMs = undefined;
  }
}

function execFileAsync(file: string, args: string[], timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true, encoding: 'utf8', timeout }, (err, out) =>
      err ? reject(err) : resolve(out),
    );
  });
}

/**
 * Sammelt die System-Ressourcen-Statistiken für die Statusleiste im Main-Fenster.
 * Es werden NUR die Werte des Programms selbst gemeldet (eigener CPU-/RAM-/Disk-Verbrauch),
 * plus systemweites Netzwerk Up/Down und Latenz (per-App-Netzwerk ist ohne native Module
 * nicht messbar). Läuft ausschließlich im Main-Process.
 */
export async function collectSystemStats(): Promise<SystemStats> {
  const now = Date.now();

  // Systemweite Netzwerk-Rate über Delta der kumulierten Byte-Zähler.
  const net = await readNetworkBytes();
  let upKbps = 0;
  let downKbps = 0;
  if (prevNet) {
    const dtSec = (now - prevNet.at) / 1000;
    if (dtSec > 0) {
      upKbps = Math.max(0, Math.round(((net.tx - prevNet.tx) / dtSec) / 1024));
      downKbps = Math.max(0, Math.round(((net.rx - prevNet.rx) / dtSec) / 1024));
    }
  }
  prevNet = { rx: net.rx, tx: net.tx, at: now };

  // Eigener Disk-Verbrauch: Größe des App-Datenverzeichnisses (gecacht).
  if (now - lastDiskAt > DISK_CACHE_MS) {
    cachedDiskMb = Math.round((await dirSize(app.getPath('userData'))) / 1024 / 1024);
    lastDiskAt = now;
  }

  let gpuName: string | undefined;
  try {
    const info = (await app.getGPUInfo('basic')) as { gpuDevice?: Array<{ deviceName?: string }> };
    gpuName = info?.gpuDevice?.[0]?.deviceName;
  } catch {
    // GPU-Info nicht verfügbar.
  }

  return {
    cpu: { appPercent: Math.round(process.getCPUUsage().percentCPUUsage) },
    memory: { appRssMb: Math.round(process.memoryUsage().rss / 1024 / 1024) },
    gpu: { name: gpuName },
    disk: { appDataMb: cachedDiskMb },
    network: { upKbps, downKbps, latencyMs: lastLatencyMs },
    timestamp: now,
  };
}

/** Liest die kumulierten Netzwerk-Bytes (rx/tx) der aktiven Schnittstellen. */
async function readNetworkBytes(): Promise<{ rx: number; tx: number }> {
  try {
    if (process.platform === 'win32') {
      // `netstat -e` liefert kumulative Bytes ohne Admin-Rechte (lokalisierungsunabhaengig).
      const out = await execFileAsync('netstat', ['-e'], 5000);
      const line = out.split('\n').find((l) => /^\s*Bytes\b/i.test(l));
      if (line) {
        const parts = line.trim().split(/\s+/);
        return { rx: Number(parts[1]) || 0, tx: Number(parts[2]) || 0 };
      }
      return { rx: 0, tx: 0 };
    }
    // Linux: /proc/net/dev (Loopback ausgenommen).
    const text = await fs.readFile('/proc/net/dev', 'utf8');
    let rx = 0;
    let tx = 0;
    for (const line of text.split('\n')) {
      const idx = line.indexOf(':');
      if (idx < 0) {
        continue;
      }
      const iface = line.slice(0, idx).trim();
      if (iface === 'lo') {
        continue;
      }
      const parts = line.slice(idx + 1).trim().split(/\s+/);
      rx += Number(parts[0]) || 0;
      tx += Number(parts[8]) || 0;
    }
    return { rx, tx };
  } catch {
    return { rx: 0, tx: 0 };
  }
}

/** Berechnet rekursiv die Größe eines Verzeichnisses in Bytes. */
async function dirSize(dir: string): Promise<number> {
  let total = 0;
  try {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        total += await dirSize(full);
      } else if (entry.isFile()) {
        try {
          total += (await fs.stat(full)).size;
        } catch {
          // Einzeldatei nicht lesbar -> ignorieren.
        }
      }
    }
  } catch {
    // Verzeichnis fehlt/nicht lesbar.
  }
  return total;
}
