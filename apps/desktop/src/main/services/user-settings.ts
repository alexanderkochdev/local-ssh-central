import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  USER_SETTINGS_DEFAULTS,
  USER_SETTINGS_DEFINITIONS,
  type SettingDefinition,
  type UserSettingsValues,
} from '@ssh-central/ipc-contracts';
import { SettingsProvider } from './settings-provider.js';

/**
 * Geräteweite UserSettings (Theme, Sprache, Terminal, Debug).
 *
 * Gespeichert in `%APPDATA%/@ssh-local/user-settings.json` - AUSSERHALB des Vaults,
 * damit sie bereits auf dem Login-Screen verfügbar sind (vor dem Unlock).
 * Schreiben ist atomar (tmp + rename), validiert über das gemeinsame Schema.
 */
export class UserSettings extends SettingsProvider<UserSettingsValues> {
  private readonly filePath: string;

  constructor(baseDir: string) {
    super(USER_SETTINGS_DEFAULTS);
    this.filePath = join(baseDir, 'user-settings.json');
  }

  override definitions(): SettingDefinition[] {
    return USER_SETTINGS_DEFINITIONS;
  }

  override async load(): Promise<void> {
    try {
      const raw = JSON.parse(await fs.readFile(this.filePath, 'utf8')) as Partial<UserSettingsValues>;
      this.value = this.sanitize(raw, this.value);
    } catch {
      // Datei fehlt oder ist beschädigt -> Defaults (beschädigte Settings nie rendern/ausliefern).
      this.value = { ...USER_SETTINGS_DEFAULTS };
    }
  }

  override async save(): Promise<void> {
    await fs.mkdir(dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(this.value, null, 2), 'utf8');
    await fs.rename(tmp, this.filePath);
  }
}
