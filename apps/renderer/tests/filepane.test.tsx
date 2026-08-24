// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilePane, type PaneEntry } from '../src/features/sftp/FilePane.js';

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
    render(
      <FilePane
        {...makeProps({ selected })}
      />,
    );
    expect(screen.getByText(/1/)).toBeTruthy(); // Anzahl der Auswahl
  });
});
