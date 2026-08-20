import { Fragment, type ReactNode } from 'react';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Divider from '@mui/material/Divider';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  dividerBefore?: boolean;
}

interface ContextMenuProps {
  open: boolean;
  x?: number;
  y?: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

/** Generisches Rechtsklick-Kontextmenue an einer Mausposition. */
export function ContextMenu({ open, x, y, items, onClose }: ContextMenuProps) {
  return (
    <Menu
      open={open}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={x !== undefined && y !== undefined ? { top: y, left: x } : undefined}
      slotProps={{ paper: { sx: { minWidth: 200 } } }}
    >
      {items.map((item, i) => (
        <Fragment key={i}>
          {item.dividerBefore && <Divider />}
          <MenuItem
            dense
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.onClick();
            }}
          >
            {item.icon && (
              <Box component="span" sx={{ mr: 1, display: 'inline-flex', alignItems: 'center' }}>
                {item.icon}
              </Box>
            )}
            <Typography variant="body2" color={item.danger ? 'error.main' : 'inherit'}>
              {item.label}
            </Typography>
          </MenuItem>
        </Fragment>
      ))}
    </Menu>
  );
}
