import { useState } from 'react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Popover from '@mui/material/Popover';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Typography from '@mui/material/Typography';
import FilterListIcon from '@mui/icons-material/FilterList';
import { useTranslation } from '../../i18n/useTranslation.js';
import type { SortOption } from '../sorting/SortControl.js';

export interface FilterState<K extends string> {
  key: K;
  value: string;
}

interface FilterControlProps<K extends string> {
  /** Filterbare Felder in Anzeige-Reihenfolge. */
  options: SortOption<K>[];
  /** Aktueller Filterzustand (null = kein Filter). */
  filter: FilterState<K> | null;
  onChange: (filter: FilterState<K> | null) => void;
}

/** Wiederverwendbarer Filter (Feld + Wert, case-insensitive startsWith) fuer alle Listen. */
export function FilterControl<K extends string>({ options, filter, onChange }: FilterControlProps<K>) {
  const { t } = useTranslation();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  function selectKey(key: K) {
    onChange({ key, value: filter?.value ?? '' });
  }

  function updateValue(value: string) {
    onChange({ key: filter?.key ?? options[0].key, value });
  }

  function clear() {
    onChange(null);
  }

  return (
    <Box>
      <IconButton
        size="small"
        title={t('filter.by')}
        color={filter?.value ? 'primary' : 'default'}
        onClick={(event) => setAnchorEl(event.currentTarget)}
      >
        <FilterListIcon fontSize="small" />
      </IconButton>
      <Popover
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, p: 2, width: 260 }}>
          <Typography variant="overline" sx={{ lineHeight: 1 }}>
            {t('filter.by')}
          </Typography>
          <FormControl size="small" fullWidth>
            <InputLabel>{t('filter.field')}</InputLabel>
            <Select label={t('filter.field')} value={filter?.key ?? ''} onChange={(e) => selectKey(e.target.value as K)}>
              {options.map((option) => (
                <MenuItem key={option.key} value={option.key}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label={t('filter.value')}
            size="small"
            fullWidth
            value={filter?.value ?? ''}
            onChange={(e) => updateValue(e.target.value)}
          />
          {filter?.value ? (
            <Button size="small" onClick={clear}>
              {t('filter.clear')}
            </Button>
          ) : null}
        </Box>
      </Popover>
    </Box>
  );
}
