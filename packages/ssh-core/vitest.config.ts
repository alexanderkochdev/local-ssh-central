import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/types.ts'],
      // Nach Test-Kampagne gemessen (v8): 96/80/92/97 (ssh2-Client-Mock).
      thresholds: {
        statements: 90,
        branches: 70,
        functions: 85,
        lines: 90,
      },
    },
  },
});
