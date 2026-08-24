import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true, // aktiviert @testing-library/react Auto-Cleanup
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx'],
      // Nach Test-Kampagne gemessen (v8): 21/17/17/22. Stores/i18n 100%, useSftpActions,
      // FilePane, VaultGate-Login, Settings-Komponenten getestet. Verbleibend: reine
      // MUI-Präsentations-Views (SftpView/HostsView/Terminal/Dialoge).
      thresholds: {
        statements: 18,
        branches: 14,
        functions: 15,
        lines: 18,
      },
    },
  },
});
