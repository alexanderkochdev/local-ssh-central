import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Root explizit setzen, damit `vite` unabhaengig vom Working-Directory (z.B. aus
// apps/desktop via `--config ../renderer/vite.config.ts`) die richtige index.html findet.
const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
});
