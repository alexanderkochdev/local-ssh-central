import { describe, it, expect } from 'vitest';
import { RateLimiter } from '../src/rate-limiter.js';

describe('RateLimiter', () => {
  it('Rate 0 = unbegrenzt (wait kehrt sofort zurueck)', async () => {
    const rl = new RateLimiter(0);
    const t = Date.now();
    await rl.wait(10 * 1024 * 1024);
    expect(Date.now() - t).toBeLessThan(50);
  });

  it('drosselt auf die konfigurierte Rate (wartet proportional)', async () => {
    const rate = 4 * 1024 * 1024; // 4 MB/s
    const rl = new RateLimiter(rate);
    // Ersten Burst aufbrauchen (maxBurst = rate).
    await rl.wait(rate);
    // 1 MB bei 4 MB/s braucht ~250 ms.
    const t = Date.now();
    await rl.wait(1024 * 1024);
    const elapsed = Date.now() - t;
    expect(elapsed).toBeGreaterThanOrEqual(180);
  });

  it('setBytesPerSecond(0) hebt die Begrenzung wieder auf', async () => {
    const rl = new RateLimiter(4 * 1024 * 1024);
    rl.setBytesPerSecond(0);
    const t = Date.now();
    await rl.wait(50 * 1024 * 1024);
    expect(Date.now() - t).toBeLessThan(50);
  });
});
