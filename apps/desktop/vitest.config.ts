import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['src/main/**/*.ts', 'src/preload/**/*.ts'],
      exclude: ['src/main/index.ts', 'src/preload/index.ts'],
      // Nach Test-Kampagne gemessen (v8): 62/60/55/62. Services, Protokolle, Vault-IPC
      // und Fenster-Verwaltung hoch. Branch-Threshold auf das Linux-Matrix-Niveau gesenkt,
      // da openers Windows-spezifische Zweige (LOCALAPPDATA/notepad) auf Linux nicht abdeckt.
      thresholds: {
        statements: 58,
        branches: 50,
        functions: 52,
        lines: 58,
      },
    },
  },
});
