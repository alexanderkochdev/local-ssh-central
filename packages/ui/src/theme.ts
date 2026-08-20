import { createTheme, type Theme } from '@mui/material/styles';

export type ColorMode = 'light' | 'dark';

/** Einheitliches SSH-Central-Theme (Material UI v9). */
export function createAppTheme(mode: ColorMode): Theme {
  return createTheme({
    palette: {
      mode,
      primary: { main: '#1e88e5' },
      secondary: { main: '#00b0ff' },
      background: mode === 'dark' ? { default: '#0f1720', paper: '#17222e' } : undefined,
    },
    shape: { borderRadius: 8 },
    typography: {
      fontFamily: [
        '-apple-system',
        'BlinkMacSystemFont',
        '"Segoe UI"',
        'Roboto',
        'Ubuntu',
        '"Helvetica Neue"',
        'sans-serif',
      ].join(','),
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { height: '100vh', overflow: 'hidden' },
          '#root': { height: '100vh' },
        },
      },
    },
  });
}
