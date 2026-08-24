import { defineConfig } from 'vitest/config';

/** Tests liegen separat in tests/ - dist-Artefakte (Build-Output) werden ignoriert. */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/types.ts'],
      // Baseline gemessen (v8): 91/70/97/91. Puffer als No-Regression-Ratchet.
      thresholds: {
        statements: 85,
        branches: 60,
        functions: 90,
        lines: 85,
      },
    },
  },
});
