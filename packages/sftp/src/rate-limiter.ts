/**
 * Token-Bucket-Rate-Limiter fuer eine Gesamt-Richtung (Upload bzw. Download).
 * `wait(bytes)` wartet, bis `bytes` bei der konfigurierten Rate "freigegeben" sind.
 * Mehrere Transfers teilen sich einen Limiter -> die Obergrenze gilt gesamt.
 * Eine Rate <= 0 bedeutet "unbegrenzt" (wait() kehrt sofort zurueck).
 */
export class RateLimiter {
  private bytesPerSecond: number;
  private maxBurst: number;
  private tokens: number;
  private lastRefill: number;

  constructor(bytesPerSecond: number) {
    this.bytesPerSecond = Math.max(0, bytesPerSecond);
    this.maxBurst = Math.max(bytesPerSecond, 1);
    this.tokens = this.maxBurst;
    this.lastRefill = Date.now();
  }

  /** Setzt die Rate (Bytes/Sekunde) neu; 0 = unbegrenzt. */
  setBytesPerSecond(bps: number): void {
    this.bytesPerSecond = Math.max(0, bps);
    this.maxBurst = Math.max(this.bytesPerSecond, 1);
  }

  /** Bricht abwaerts ab (unbegrenzt), wenn die Rate 0 ist. */
  async wait(bytes: number): Promise<void> {
    if (this.bytesPerSecond <= 0) {
      return;
    }
    for (;;) {
      const now = Date.now();
      this.tokens = Math.min(this.maxBurst, this.tokens + ((now - this.lastRefill) * this.bytesPerSecond) / 1000);
      this.lastRefill = now;
      if (this.tokens >= bytes) {
        this.tokens -= bytes;
        return;
      }
      const deficit = bytes - this.tokens;
      const ms = (deficit / this.bytesPerSecond) * 1000;
      await sleep(Math.min(Math.max(ms, 1), 250));
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
