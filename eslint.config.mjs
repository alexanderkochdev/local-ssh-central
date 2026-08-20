import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/out/**',
      '**/release/**',
      '**/build/**',
      '**/.turbo/**',
      '**/coverage/**',
    ],
  },
  {
    languageOptions: {
      // Main/Preload/Scripts (Node) + Renderer (Browser) - Node- und Browser-Globals
      // global bereitstellen, damit `no-undef` keine Fehlmeldungen erzeugt.
      globals: { ...globals.node, ...globals.browser },
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // tsc (noUnusedLocals/noUnusedParameters) faengt diese bereits ab - hier deaktivieren,
      // um Doppel-Warnungen zu vermeiden.
      '@typescript-eslint/no-unused-vars': 'off',
      // Dialoge setzen beim Oeffnen absichtlich ihren State zurueck (z.B. Bearbeiten-Dialoge).
      // Die neue sehr strenge Regel wuerde diesen legitimen Fall als Fehler markieren.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  prettier,
);
