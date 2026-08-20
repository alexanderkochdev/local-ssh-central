import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

/** Zentrierter Leer-/Hinweis-Zustand fuer Listen und Bereiche. */
export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        height: '100%',
        p: 4,
        textAlign: 'center',
      }}
    >
      <Typography variant="h6" color="text.secondary">
        {title}
      </Typography>
      {description && (
        <Typography variant="body2" color="text.secondary">
          {description}
        </Typography>
      )}
      {action}
    </Box>
  );
}
