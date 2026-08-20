import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { createAppTheme } from '@ssh-central/ui';
import App from './App.js';
import { store } from './store/index.js';
import { useSettingsStore } from './store/settings-store.js';

function Root() {
  const themeMode = useSettingsStore((s) => s.settings.theme);
  return (
    <Provider store={store}>
      <ThemeProvider theme={createAppTheme(themeMode)}>
        <CssBaseline />
        <App />
      </ThemeProvider>
    </Provider>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
