// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilePane, type PaneEntry } from '../src/features/sftp/FilePane.js';
import { dragSelection } from '../src/features/sftp/drag-payload.js';
import { SelectionActions } from '../src/features/sftp/SelectionActions.js';

function makeProps(overrides: Partial<Parameters<typeof FilePane>[0]> = {}) {
  return {
    title: 'Remote',
    path: '/home',
    entries: [] as PaneEntry[],
    loading: false,
    selected: new Set<string>(),
    onToggleSelect: vi.fn(),
    onSelectAll: vi.fn(),
    onClearSelection: vi.fn(),
    onUp: vi.fn(),
    onNavigatePath: vi.fn(),
    onNavigate: vi.fn(),
    ...overrides,
  };
}

describe('FilePane', () => {
  it('rendert Titel, Pfad-Input und Sortier-Select', () => {
    render(<FilePane {...makeProps()} />);
    expect(screen.getByText('Remote')).toBeTruthy();
    expect(screen.getByDisplayValue('/home')).toBeTruthy();
    expect(screen.getByRole('combobox')).toBeTruthy(); // Sortier-Select
  });

  it('zeigt einen Lade-Spinner waehrend des Ladens', () => {
    render(<FilePane {...makeProps({ loading: true })} />);
    expect(screen.getByRole('progressbar')).toBeTruthy();
  });

  it('ruft onNavigatePath beim Pfad-Enter auf', () => {
    const onNavigatePath = vi.fn();
    render(<FilePane {...makeProps({ onNavigatePath })} />);

    const input = screen.getByDisplayValue('/home');
    fireEvent.change(input, { target: { value: '/var/www' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onNavigatePath).toHaveBeenCalledWith('/var/www');
  });

  it('zeigt die Auswahl-Aktionen bei markierten Eintraegen', () => {
    const selected = new Set(['/home/a.txt']);
    render(<FilePane {...makeProps({ selected })} />);
    expect(screen.getByText(/1/)).toBeTruthy(); // Anzahl der Auswahl
  });

  it('Auswahl-Buttons sind reine Icon-Buttons mit Tooltip-Text als Label', () => {
    const selected = new Set(['/home/a.txt']);
    render(<FilePane {...makeProps({ selected })} />);
    // Kein sichtbarer Button-Text mehr - die Beschriftung kommt als aria-label/Tooltip.
    expect(screen.queryByText('Alle auswählen')).toBeNull();
    expect(screen.getByRole('button', { name: 'Alle auswählen' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Auswahl aufheben' })).toBeTruthy();
  });

  it('leitet einen Drop auf das Pane an onPaneDrop weiter', () => {
    const onPaneDrop = vi.fn();
    const { container } = render(<FilePane {...makeProps({ onPaneDrop })} />);
    const pane = container.firstElementChild as HTMLElement;

    fireEvent.dragEnter(pane, { dataTransfer: { types: [] } });
    fireEvent.dragOver(pane, { dataTransfer: { types: [], dropEffect: '' } });
    fireEvent.drop(pane, { dataTransfer: { types: [], getData: () => '' } });

    expect(onPaneDrop).toHaveBeenCalledTimes(1);
  });
});

describe('dragSelection', () => {
  const a: PaneEntry = { name: 'a', path: '/a', isDirectory: false };
  const b: PaneEntry = { name: 'b', path: '/b', isDirectory: false };
  const c: PaneEntry = { name: 'c', path: '/c', isDirectory: false };

  it('zieht nur den angefassten Eintrag, wenn er nicht ausgewaehlt ist', () => {
    expect(dragSelection(a, new Set(['/b']), [a, b, c])).toEqual([a]);
  });

  it('zieht die komplette Auswahl, wenn der angefasste Eintrag Teil davon ist', () => {
    expect(dragSelection(a, new Set(['/a', '/c']), [a, b, c])).toEqual([a, c]);
  });

  it('faellt auf den angefassten Eintrag zurueck, wenn die Auswahl nicht mehr sichtbar ist', () => {
    expect(dragSelection(a, new Set(['/a']), [])).toEqual([a]);
  });
});

describe('SelectionActions', () => {
  const t = (key: string) => key;

  it('rendert nur Icon-Buttons; die Labels kommen aus den Tooltips', () => {
    render(
      <SelectionActions
        side="remote"
        t={t}
        onTransfer={vi.fn()}
        onDownloadAs={vi.fn()}
        onCopy={vi.fn()}
        onCut={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    for (const label of ['sftp.download', 'sftp.downloadTo', 'sftp.copy', 'sftp.cut', 'action.delete']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
      expect(screen.queryByText(label)).toBeNull(); // kein sichtbarer Text im Button
    }
  });

  it('zeigt "Herunterladen zu ..." nur auf der Remote-Seite', () => {
    render(
      <SelectionActions side="local" t={t} onTransfer={vi.fn()} onCopy={vi.fn()} onCut={vi.fn()} onDelete={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'sftp.upload' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'sftp.downloadTo' })).toBeNull();
  });

  it('loest die Aktionen aus', () => {
    const onTransfer = vi.fn();
    const onDownloadAs = vi.fn();
    const onDelete = vi.fn();
    render(
      <SelectionActions
        side="remote"
        t={t}
        onTransfer={onTransfer}
        onDownloadAs={onDownloadAs}
        onCopy={vi.fn()}
        onCut={vi.fn()}
        onDelete={onDelete}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'sftp.download' }));
    fireEvent.click(screen.getByRole('button', { name: 'sftp.downloadTo' }));
    fireEvent.click(screen.getByRole('button', { name: 'action.delete' }));
    expect(onTransfer).toHaveBeenCalledTimes(1);
    expect(onDownloadAs).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
