import type { SettingSection, SettingValue } from '@ssh-central/ipc-contracts';
import { SettingSectionComponent } from './SettingSectionComponent.js';

interface SettingsRendererProps {
  /** Der zu rendernde Section-Tree (aus ipc-contracts, z.B. USER_SETTINGS_SECTIONS). */
  sections: SettingSection[];
  /** Aktuelle Werte (Key -> Value) aller Settings im Baum. */
  values: Record<string, SettingValue>;
  onChange: (key: string, value: SettingValue) => void;
  /** i18n-Uebersetzer. */
  t: (key: string) => string;
}

/**
 * Generischer Settings-Renderer: rendert einen kompletten Section-Tree.
 *
 * Wird von beiden Dialogen (UserSettings + VaultSettings) verwendet, damit JEDE
 * Setting ueber die atomaren `SettingComponent`-Teile identisch gerendert wird.
 */
export function SettingsRenderer({ sections, values, onChange, t }: SettingsRendererProps) {
  return (
    <>
      {sections.map((section) => (
        <SettingSectionComponent
          key={section.id}
          section={section}
          values={values}
          onChange={onChange}
          t={t}
        />
      ))}
    </>
  );
}
