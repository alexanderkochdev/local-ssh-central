import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Switch from '@mui/material/Switch';
import Button from '@mui/material/Button';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import type { SettingDefinition, SettingValue } from '@ssh-central/ipc-contracts';

interface SettingComponentProps {
  definition: SettingDefinition;
  value: SettingValue;
  onChange: (value: SettingValue) => void;
  /** i18n-Uebersetzer (t = uebersetze i18n-Key). */
  t: (key: string) => string;
}

/**
 * Zahlen-Input mit lokalem String-State: Der User kann frei tippen (auch Zwischenwerte wie
 * leeres Feld), der Wert wird erst bei Blur/Enter committed. Das verhindert das bekannte
 * "feste 0 / nicht editierbar"-Problem controlled Number-Inputs, bei dem jeder Tastendruck
 * sofort auf `Number(value) || 0` zurueckgesetzt wurde.
 */
function NumberSettingInput({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  const [text, setText] = useState(String(value));

  // Externer Wert (z.B. nach Commit oder Clamp im Main) -> lokales Feld synchron halten.
  useEffect(() => {
    setText(String(value));
  }, [value]);

  function commit() {
    const n = Number(text);
    if (!Number.isFinite(n)) {
      setText(String(value));
      return;
    }
    onChange(n);
  }

  return (
    <TextField
      type="number"
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          commit();
        }
      }}
      size="small"
      fullWidth
      slotProps={{ htmlInput: { min, max, step } }}
    />
  );
}

/**
 * Atomare Komponente fuer EINE SettingDefinition.
 *
 * Layout (von links nach rechts):
 * 1. Label als Text
 * 2. Info-Button neben dem Label -> Hover zeigt die description (i18n)
 * 3. Rechts: das passende Input-Control je nach `definition.type`
 *    (Textfeld, Select, Switch, Button mit native IPC fuer Ordner/Datei, ...)
 *
 * Diese Komponente wird von `SettingSectionComponent` fuer JEDE Setting verwendet,
 * damit alle Settings immer exakt gleich gerendert werden (Einheits-Layout).
 */
export function SettingComponent({ definition, value, onChange, t }: SettingComponentProps) {
  const renderControl = () => {
    switch (definition.type) {
      case 'boolean':
        return <Switch checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />;

      case 'select':
        return (
          <TextField select value={String(value)} onChange={(event) => onChange(event.target.value)} size="small" fullWidth>
            {definition.options?.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {t(option.label)}
              </MenuItem>
            ))}
          </TextField>
        );

      case 'number':
        return (
          <NumberSettingInput
            value={Number(value) || 0}
            min={definition.min}
            max={definition.max}
            step={definition.step}
            onChange={onChange}
          />
        );

      case 'string':
        return (
          <TextField
            value={String(value)}
            onChange={(event) => onChange(event.target.value)}
            size="small"
            fullWidth
          />
        );

      case 'folder':
        return (
          <Button
            variant="outlined"
            size="small"
            startIcon={<FolderOpenIcon />}
            onClick={async () => {
              const picked = await window.api.dialog.pickFolder();
              if (picked) {
                onChange(picked);
              }
            }}
            sx={{ textTransform: 'none', maxWidth: '100%' }}
          >
            <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {value ? String(value) : t('settings.pickFolder')}
            </Box>
          </Button>
        );

      case 'file':
        return (
          <Button
            variant="outlined"
            size="small"
            startIcon={<InsertDriveFileOutlinedIcon />}
            onClick={async () => {
              const picked = await window.api.dialog.pickFile();
              if (picked) {
                onChange(picked);
              }
            }}
            sx={{ textTransform: 'none', maxWidth: '100%' }}
          >
            <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {value ? String(value) : t('settings.pickFile')}
            </Box>
          </Button>
        );

      case 'multiSelect':
      case 'credential':
      case 'secret':
      default:
        // Phase 2: MultiSelect / Credential / Secret - noch nicht im UI.
        return (
          <Typography variant="body2" color="text.secondary">
            {t('settings.notSupported')}
          </Typography>
        );
    }
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minHeight: 40 }}>
      {/* Label links + Info-Button (Hover -> description) */}
      <Box sx={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
        <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>
          {t(definition.label)}
        </Typography>
        {definition.description && (
          <Tooltip title={t(definition.description)} arrow>
            <IconButton size="small" sx={{ ml: 0.5 }} aria-label={t(definition.label)}>
              <InfoOutlinedIcon fontSize="inherit" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
      {/* Input rechts */}
      <Box sx={{ flex: 1, display: 'flex', justifyContent: 'flex-end', minWidth: 0 }}>{renderControl()}</Box>
    </Box>
  );
}
