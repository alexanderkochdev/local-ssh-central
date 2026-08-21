import { defineConfig } from 'vitest/config';

/** Nur die Quell-Tests ausfuehren - veraltete dist-Artefakte (Build-Output) ignorieren. */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
