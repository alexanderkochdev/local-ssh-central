import { useState } from 'react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import SortIcon from '@mui/icons-material/Sort';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import { useTranslation } from '../../i18n/useTranslation.js';

export type SortDirection = 'asc' | 'desc';

export interface SortState<K extends string> {
  key: K;
  direction: SortDirection;
}

export interface SortOption<K extends string> {
  key: K;
  label: string;
}

interface SortControlProps<K extends string> {
  /** Sortierbare Felder in Anzeige-Reihenfolge. */
  options: SortOption<K>[];
  /** Aktueller Sortierzustand (null = unsortiert). */
  sort: SortState<K> | null;
  onChange: (sort: SortState<K> | null) => void;
}

/** Wiederverwendbares Sortier-Menue (Feld + Richtung) fuer alle Listen. */
export function SortControl<K extends string>({ options, sort, onChange }: SortControlProps<K>) {
  const { t } = useTranslation();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  function select(key: K) {
    if (sort?.key === key) {
      // Erneuter Klick auf das aktive Feld toggelt die Richtung.
      onChange({ key, direction: sort.direction === 'asc' ? 'desc' : 'asc' });
    } else {
      onChange({ key, direction: sort?.direction ?? 'asc' });
    }
  }

  return (
    <Box>
      <IconButton
        size="small"
        title={t('sort.by')}
        color={sort ? 'primary' : 'default'}
        onClick={(event) => setAnchorEl(event.currentTarget)}
      >
        <SortIcon fontSize="small" />
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem disabled>
          <Typography variant="overline">{t('sort.by')}</Typography>
        </MenuItem>
        <Divider />
        {options.map((option) => {
          const active = sort?.key === option.key;
          return (
            <MenuItem key={option.key} selected={active} onClick={() => select(option.key)}>
              <ListItemIcon sx={{ minWidth: 32 }}>
                {active ? (
                  sort!.direction === 'asc' ? (
                    <ArrowUpwardIcon fontSize="small" />
                  ) : (
                    <ArrowDownwardIcon fontSize="small" />
                  )
                ) : (
                  <SwapVertIcon fontSize="small" />
                )}
              </ListItemIcon>
              <ListItemText>{option.label}</ListItemText>
            </MenuItem>
          );
        })}
        <Divider />
        <MenuItem
          disabled={!sort}
          onClick={() => onChange({ ...sort!, direction: sort!.direction === 'asc' ? 'desc' : 'asc' })}
        >
          <ListItemIcon sx={{ minWidth: 32 }}>
            {sort?.direction === 'asc' ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />}
          </ListItemIcon>
          <ListItemText>{sort?.direction === 'asc' ? t('sort.ascending') : t('sort.descending')}</ListItemText>
        </MenuItem>
      </Menu>
    </Box>
  );
}
