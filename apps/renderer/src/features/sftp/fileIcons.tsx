import type { ReactElement } from 'react';
import { Icon } from '@iconify/react/offline';
import { selectFileIcon } from './fileIconCatalog.js';
import type { FileIconProps } from './fileIcons.types.js';

/** Rendert je Dateityp das passende Icon: ein Sprachlogo (Devicon) oder ein Material-Icon mit Typfarbe. */
export function FileIcon({ name, isDirectory }: FileIconProps): ReactElement {
  const selection = selectFileIcon(name, isDirectory);

  if (selection.devicon) {
    return <Icon icon={selection.devicon} width={16} height={16} />;
  }

  const MuiIcon = selection.muiIcon;
  return <MuiIcon color={selection.color} fontSize="small" />;
}
