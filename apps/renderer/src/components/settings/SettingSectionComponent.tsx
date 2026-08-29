import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { SettingSection, SettingValue } from '@ssh-central/ipc-contracts';
import { SettingComponent } from './SettingComponent.js';

interface SettingSectionComponentProps {
  section: SettingSection;
  /** Aktuelle Werte (Key -> Value). Enthaelt die Werte aller Settings im Baum. */
  values: Record<string, SettingValue>;
  onChange: (key: string, value: SettingValue) => void;
  /** i18n-Uebersetzer. */
  t: (key: string) => string;
  defaultExpanded?: boolean;
}

/**
 * Rendert EINEN SettingSection-Baum (rekursiv) als einklappbare Gruppe.
 *
 * - Jede Abschnittsueberschrift (i18n) ist per Klick ein-/ausklappbar (Standard: zugeklappt,
 *   manuell aufklappen). Info-Hover zeigt die Beschreibung.
 * - Jede `SettingDefinition` in `section.settings` wird ATOMAR ueber
 *   `<SettingComponent>` gerendert - dadurch sind alle Settings immer identisch
 *   aufgebaut (Label links, Info-Hover, Input rechts).
 * - Verschachtelte `section.sections` werden rekursiv als Unterabschnitte gerendert.
 */
export function SettingSectionComponent({
  section,
  values,
  onChange,
  t,
  defaultExpanded = false,
}: SettingSectionComponentProps) {
  const [open, setOpen] = useState(defaultExpanded);

  const toggle = () => {
    setOpen((previous) => !previous);
  };

  return (
    <Box>
      {/* Abschnitts-Kopf */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          cursor: 'pointer',
          userSelect: 'none',
          mb: 1,
        }}
        onClick={toggle}
      >
        <IconButton
          size="small"
          sx={{
            transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
            transition: 'transform 0.2s',
          }}
        >
          <ExpandMoreIcon fontSize="small" />
        </IconButton>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          {t(section.title)}
        </Typography>
        {section.description && (
          <Tooltip title={t(section.description)} arrow>
            <IconButton size="small" sx={{ ml: 0.5 }}>
              <InfoOutlinedIcon fontSize="inherit" />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* Inhalt: Settings + verschachtelte Sections (aufklappbar) */}
      <Collapse in={open} timeout="auto" unmountOnExit>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1.5,
            pl: 2,
            mb: 2,
          }}
        >
          {section.settings.map((definition) => (
            <SettingComponent
              key={definition.key}
              definition={definition}
              value={values[definition.key] as SettingValue}
              onChange={(value) => onChange(definition.key, value)}
              t={t}
            />
          ))}
          {section.sections?.map((child) => (
            <SettingSectionComponent
              key={child.id}
              section={child}
              values={values}
              onChange={onChange}
              t={t}
              defaultExpanded={defaultExpanded}
            />
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}
