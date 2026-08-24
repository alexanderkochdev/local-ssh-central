// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SystemBar } from '../src/components/SystemBar.js';

function mockApi(stats: unknown): void {
  (window as unknown as Record<string, unknown>).api = {
    system: { getStats: vi.fn().mockResolvedValue(stats) },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SystemBar', () => {
  it('rendert nur eigene CPU/RAM/Disk + Netzwerk', async () => {
    mockApi({
      cpu: { appPercent: 12 },
      memory: { appRssMb: 250 },
      gpu: { name: 'Intel UHD' },
      disk: { appDataMb: 12 },
      network: { upKbps: 10, downKbps: 30, latencyMs: 25 },
      timestamp: 0,
    });
    render(<SystemBar />);

    expect(await screen.findByText(/CPU 12%/)).toBeTruthy();
    expect(screen.getByText(/RAM 250 MB/)).toBeTruthy();
    expect(screen.getByText(/GPU Intel UHD/)).toBeTruthy();
    expect(screen.getByText(/Speicher 12 MB/)).toBeTruthy();
    expect(screen.getByText(/↓ 30 KB\/s · ↑ 10 KB\/s/)).toBeTruthy();
    expect(screen.getByText(/Latenz 25 ms/)).toBeTruthy();
  });

  it('zeigt ohne GPU-Info kein GPU-Feld', async () => {
    mockApi({
      cpu: { appPercent: 5 },
      memory: { appRssMb: 100 },
      gpu: {},
      disk: { appDataMb: 3 },
      network: { upKbps: 0, downKbps: 0 },
      timestamp: 0,
    });
    render(<SystemBar />);

    await screen.findByText(/CPU 5%/);
    expect(screen.queryByText(/GPU/)).toBeNull();
  });
});
