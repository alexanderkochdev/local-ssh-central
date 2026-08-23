import { Component, type ErrorInfo, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

const SETTINGS_KEY = 'ssh-central-settings';

/**
 * Faengt Render-Fehler ab, damit ein einzelner Crash nicht die gesamte Oberflaeche
 * blank macht und den Nutzer nicht aus der App "ausschliesst". Bietet Recovery:
 * - "Einstellungen zuruecksetzen & neu laden" entfernt korrupte/persistierte Settings
 *   (z.B. ein kaputtes Theme) und startet die App mit Defaults neu.
 * - "Neu laden" laedt nur neu.
 * Wichtig: liegt ausserhalb von ThemeProvider/Provider, damit auch ein Theme-Aufbau-
 * Fehler abgefangen und die Fallback-UI (mit MUI-Default-Theme) gerendert wird.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[renderer] Uncaught render error:', error, info.componentStack);
  }

  private resetAndReload = (): void => {
    try {
      localStorage.removeItem(SETTINGS_KEY);
    } catch {
      // localStorage nicht verfuegbar - trotzdem neu laden.
    }
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.error) {
      return this.props.children;
    }
    return (
      <Box
        sx={{
          display: 'grid',
          placeItems: 'center',
          height: '100vh',
          p: 3,
          textAlign: 'center',
        }}
      >
        <Box sx={{ maxWidth: 520 }}>
          <Typography variant="h6" gutterBottom>
            Etwas ist schiefgelaufen
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Beim Rendern der Oberflaeche ist ein Fehler aufgetreten. Deine Daten und dein
            Tresor sind sicher - du kannst die App gefahrlos neu starten.
          </Typography>
          <Box
            component="pre"
            sx={{
              textAlign: 'left',
              fontSize: 12,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              bgcolor: 'background.paper',
              border: 1,
              borderColor: 'divider',
              borderRadius: 1,
              p: 1.5,
              mb: 2,
            }}
          >
            {this.state.error.message}
          </Box>
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button variant="contained" onClick={this.resetAndReload}>
              Einstellungen zuruecksetzen &amp; neu laden
            </Button>
            <Button variant="outlined" onClick={() => window.location.reload()}>
              Neu laden
            </Button>
          </Box>
        </Box>
      </Box>
    );
  }
}
