// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import type { SettingDefinition, SettingSection, SettingValue } from '@ssh-central/ipc-contracts';
import { SettingComponent } from '../src/components/settings/SettingComponent.js';
import { SettingSectionComponent } from '../src/components/settings/SettingSectionComponent.js';
import { SettingsRenderer } from '../src/components/settings/SettingsRenderer.js';

const t = (key: string) => key;

function definition(overrides: Partial<SettingDefinition> = {}): SettingDefinition {
  return {
    key: 'demo',
    type: 'string',
    label: 'settings.demo',
    default: '',
    ...overrides,
  };
}

beforeEach(() => {
  // window.api nur fuer Ordner-/Datei-Picker benoetigt.
  (window as unknown as Record<string, unknown>).api = {
    dialog: { pickFolder: vi.fn(), pickFile: vi.fn() },
  };
});

describe('SettingComponent', () => {
  it('rendert einen boolean-Schalter und meldet Aenderungen', () => {
    const onChange = vi.fn();
    const { container } = render(
      <SettingComponent definition={definition({ type: 'boolean', default: false })} value={false} onChange={onChange} t={t} />,
    );

    const input = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.checked).toBe(false);
    fireEvent.click(input);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('rendert ein Select mit den Options', () => {
    const onChange = vi.fn();
    const def = definition({
      type: 'select',
      default: 'de',
      options: [
        { value: 'de', label: 'settings.language.de' },
        { value: 'en', label: 'settings.language.en' },
      ],
    });
    render(<SettingComponent definition={def} value="de" onChange={onChange} t={t} />);

    const combobox = screen.getByRole('combobox');
    expect(combobox).toBeTruthy();
    // Oeffnen zeigt beide Optionen.
    fireEvent.mouseDown(combobox);
    const listbox = screen.getByRole('listbox');
    expect(within(listbox).getAllByRole('option')).toHaveLength(2);
  });

  it('rendert ein Number-Input', () => {
    render(<SettingComponent definition={definition({ type: 'number', default: 13, min: 8, max: 24 })} value={13} onChange={() => {}} t={t} />);
    expect(screen.getByRole('spinbutton')).toBeTruthy();
  });

  it('Number-Input: Wert 0 -> "5" tippen + Blur meldet 5 (kein Ruecksetzen auf 0)', () => {
    const onChange = vi.fn();
    const def = definition({ type: 'number', default: 0, min: 0, max: 300, step: 5 });
    render(<SettingComponent definition={def} value={0} onChange={onChange} t={t} />);

    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.blur(input);

    expect(onChange).toHaveBeenCalledWith(5);
  });

  it('Number-Input: kontrollierter Ablauf behaelt nach Blur den geaenderten Wert', () => {
    // Bildet den echten Dialog-Fluss nach: onChange aktualisiert den Store-Wert,
    // der als value-Prop zurueckkommt. Nach Blur muss "5" stehen bleiben.
    function Harness({ def, initial }: { def: SettingDefinition; initial: SettingValue }) {
      const [value, setValue] = useState<SettingValue>(initial);
      return <SettingComponent definition={def} value={value} onChange={setValue} t={t} />;
    }

    const def = definition({ type: 'number', default: 0, min: 0, max: 300, step: 5 });
    render(<Harness def={def} initial={0} />);

    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.blur(input);

    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('5');
  });

  it('rendert ein Text-Input', () => {
    render(<SettingComponent definition={definition({ type: 'string', default: '' })} value="hello" onChange={() => {}} t={t} />);
    expect(screen.getByDisplayValue('hello')).toBeTruthy();
  });

  it('Ordner-Button oeffnet den nativen Picker und meldet den Pfad', async () => {
    const onChange = vi.fn();
    const pickFolder = (window as unknown as { api: { dialog: { pickFolder: ReturnType<typeof vi.fn> } } }).api.dialog.pickFolder;
    pickFolder.mockResolvedValue('/home/user');
    render(<SettingComponent definition={definition({ type: 'folder', default: '' })} value="" onChange={onChange} t={t} />);

    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('/home/user'));
  });

  it('Datei-Button oeffnet den nativen Picker und meldet den Pfad', async () => {
    const onChange = vi.fn();
    const pickFile = (window as unknown as { api: { dialog: { pickFile: ReturnType<typeof vi.fn> } } }).api.dialog.pickFile;
    pickFile.mockResolvedValue('/path/file.txt');
    render(<SettingComponent definition={definition({ type: 'file', default: '' })} value="" onChange={onChange} t={t} />);

    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('/path/file.txt'));
  });
});

describe('SettingSectionComponent', () => {
  it('rendert eine Section mit Info-Hover und Einklapp-Toggle (zugeklappt, manuell aufklappen)', () => {
    const section: SettingSection = {
      id: 'appearance',
      title: 'settings.section.appearance',
      description: 'settings.section.appearance.description',
      settings: [definition({ key: 'theme', type: 'select', default: 'dark' })],
    };
    render(
      <SettingSectionComponent
        section={section}
        values={{ theme: 'dark' }}
        onChange={() => {}}
        t={t}
      />,
    );
    expect(screen.getByText('settings.section.appearance')).toBeTruthy();
    // Standard: zugeklappt -> Setting (Select) ist noch nicht sichtbar.
    expect(screen.queryByRole('combobox')).toBeNull();
    // Manuell aufklappen -> Setting erscheint.
    fireEvent.click(screen.getByText('settings.section.appearance'));
    expect(screen.getByRole('combobox')).toBeTruthy();
  });
});

describe('SettingsRenderer', () => {
  it('rendert alle Sections eines Baums (zugeklappt, aufgeklappt sichtbar)', () => {
    const sections: SettingSection[] = [
      {
        id: 'a',
        title: 'settings.section.a',
        settings: [definition({ key: 'alpha', type: 'string', default: '' })],
      },
      {
        id: 'b',
        title: 'settings.section.b',
        settings: [],
        sections: [{ id: 'b1', title: 'settings.section.b1', settings: [definition({ key: 'beta', type: 'boolean', default: false })] }],
      },
    ];
    render(<SettingsRenderer sections={sections} values={{ alpha: 'x', beta: false }} onChange={() => {}} t={t} />);
    expect(screen.getByText('settings.section.a')).toBeTruthy();
    expect(screen.getByText('settings.section.b')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull(); // zugeklappt

    // Aufklappen -> Settings sichtbar.
    fireEvent.click(screen.getByText('settings.section.a'));
    expect(screen.getAllByRole('textbox').length).toBeGreaterThanOrEqual(1);
  });
});
