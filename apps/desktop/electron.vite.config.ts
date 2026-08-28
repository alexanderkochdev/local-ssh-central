import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

// Unsere Workspace-Pakete sind ESM-only ("type": "module", exports.import).
// Da Electron-Main/Preload als CJS laufen, duerfen diese NIE externalisiert werden,
// sonst schlaegt require('@ssh-central/*') mit ERR_PACKAGE_PATH_NOT_EXPORTED fehl.
// Stattdessen werden sie beim Bundling eingebunden. Die nativen/Transitiv-Deps
// (ssh2, cpu-features, kdbxweb, @node-rs/argon2) muessen extern bleiben (werden zur
// Laufzeit aus node_modules geladen; nicht in der Abhaengigkeitsliste, damit
// @electron/rebuild sie nicht nativ bauen muss).
const workspacePackages = [
  '@ssh-central/ipc-contracts',
  '@ssh-central/ssh-core',
  '@ssh-central/sftp',
  '@ssh-central/vault',
];

const externalTransitives = [
  'ssh2',
  'cpu-features',
  'kdbxweb',
  '@node-rs/argon2',
  'electron-log',
  // electron-updater liest zur Laufzeit `app-update.yml` aus den Resources und muss
  // deshalb als echtes CJS-Modul aus node_modules geladen werden (nicht gebundelt).
  'electron-updater',
];

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: workspacePackages })],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: { index: 'src/main/index.ts' },
        external: externalTransitives,
      },
    },
  },
  preload: {
    // Im sandboxed Preload nur das dependency-freie ipc-contracts einbinden.
    plugins: [externalizeDepsPlugin({ exclude: ['@ssh-central/ipc-contracts'] })],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: { index: 'src/preload/index.ts' },
      },
    },
  },
});
