import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/types.ts'],
      // Nach Test-Kampagne gemessen (v8): 89/65/96/88 (sftp-engine 100%).
      thresholds: {
        statements: 80,
        branches: 55,
        functions: 90,
        lines: 80,
      },
    },
  },
});
