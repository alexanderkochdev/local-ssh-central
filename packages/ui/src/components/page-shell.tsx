import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import AppBar from '@mui/material/AppBar';
import Typography from '@mui/material/Typography';

interface PageShellProps {
  title: string;
  children: ReactNode;
}

/** Einfaches App-Frame mit Top-Bar und Inhalt. Wird im MVP zu einem echten App-Shell-Component erweitert. */
export function PageShell({ title, children }: PageShellProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <AppBar position="static" color="transparent" elevation={0}>
        <Toolbar variant="dense">
          <Typography variant="h6">{title}</Typography>
        </Toolbar>
      </AppBar>
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>{children}</Box>
    </Box>
  );
}
