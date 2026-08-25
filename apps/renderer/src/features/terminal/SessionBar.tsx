import { useState, type KeyboardEvent } from 'react';
import Box from '@mui/material/Box';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import EditIcon from '@mui/icons-material/Edit';
import { useSessionMetaStore, SESSION_COLORS, DEFAULT_SESSION_COLOR } from '../../store/session-meta-store.js';
import { useTranslation } from '../../i18n/useTranslation.js';

interface SessionBarProps {
  sessionId: string;
}

/**
 * Schmale Leiste ueber dem Terminal: Farbpunkt (Farbe der Session) + frei benennbarer
 * Session-Name. Der Name wird via `window.api.windows.setTitle` auch im OS-Fenstertitel
 * angezeigt (z.B. "prod" statt "Terminal · hostname").
 */
export function SessionBar({ sessionId }: SessionBarProps) {
  const { t } = useTranslation();
  // WICHTIG: Primitive als Selektoren waehlen - `get()` wuerde pro Aufruf ein NEUES
  // Objekt liefern und damit einen unendlichen Render-Loop ausloesen (Object.is-Vergleich).
  const sessionName = useSessionMetaStore((s) => s.metas[sessionId]?.name ?? '');
  const sessionColor = useSessionMetaStore((s) => s.metas[sessionId]?.color ?? DEFAULT_SESSION_COLOR);
  const setName = useSessionMetaStore((s) => s.setName);
  const setColor = useSessionMetaStore((s) => s.setColor);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(sessionName);
  const [colorAnchor, setColorAnchor] = useState<null | HTMLElement>(null);

  function startEdit() {
    setDraft(sessionName);
    setEditing(true);
  }

  function commitEdit() {
    setEditing(false);
    const nextName = draft.trim();
    setName(sessionId, nextName);
    // Nur setzen, wenn ein sprechender Name vergeben ist - sonst Standardtitel behalten.
    if (nextName) {
      window.api.windows.setTitle(nextName);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter') {
      commitEdit();
    } else if (event.key === 'Escape') {
      setEditing(false);
    }
  }

  // SESSION_COLORS sind 6-stellige Hex-Farben -> Anhaengen einer Alpha-Komponente ergibt
  // einen dezenten Hintergrund-Tint der Leiste in der Session-Farbe (starker visueller Anker).
  const isSixHex = /^#[0-9a-fA-F]{6}$/.test(sessionColor);
  const tint = isSixHex ? `${sessionColor}22` : sessionColor;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 1,
        py: 0.25,
        bgcolor: tint,
        borderBottom: '2px solid',
        borderColor: sessionColor,
        flexShrink: 0,
        minHeight: 30,
      }}
    >
      <Tooltip title={t('session.colors')}>
        <Box
          component="button"
          onClick={(e) => setColorAnchor(e.currentTarget)}
          aria-label={t('session.colors')}
          sx={{
            width: 14,
            height: 14,
            borderRadius: '50%',
            border: 'none',
            cursor: 'pointer',
            flexShrink: 0,
            bgcolor: sessionColor || DEFAULT_SESSION_COLOR,
            ':hover': { opacity: 0.8 },
          }}
        />
      </Tooltip>

      <Menu
        anchorEl={colorAnchor}
        open={Boolean(colorAnchor)}
        onClose={() => setColorAnchor(null)}
      >
        {SESSION_COLORS.map((color) => (
          <MenuItem
            key={color}
            selected={sessionColor === color}
            onClick={() => {
              setColor(sessionId, color);
              setColorAnchor(null);
            }}
          >
            <Box
              sx={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                bgcolor: color,
                mr: 1,
              }}
            />
            <Typography variant="body2">{color}</Typography>
          </MenuItem>
        ))}
      </Menu>

      {editing ? (
        <TextField
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={onKeyDown}
          placeholder={t('session.namePlaceholder')}
          size="small"
          autoFocus
          variant="outlined"
          sx={{ '& .MuiInputBase-root': { fontSize: 13, py: 0.25 } }}
        />
      ) : (
        <Box
          component="button"
          onClick={startEdit}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            border: 'none',
            bgcolor: 'transparent',
            cursor: 'pointer',
            color: 'text.secondary',
            fontSize: 13,
            ':hover': { color: 'text.primary' },
          }}
        >
          <EditIcon sx={{ width: 13, height: 13 }} />
          <span>{sessionName || t('session.namePlaceholder')}</span>
        </Box>
      )}
    </Box>
  );
}
