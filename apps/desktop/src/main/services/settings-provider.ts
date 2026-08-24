import type { SettingDefinition, SettingValue } from '@ssh-central/ipc-contracts';
import { sanitizeSettings } from '@ssh-central/ipc-contracts';

/**
 * Abstrakter SettingsProvider - der gemeinsame Vertrag für ALLE Settings-Speicher.
 *
 * Konkrete Implementierungen:
 * - `UserSettings`  -> geräteweit in %APPDATA%/@ssh-local (JSON, atomar)
 * - `VaultSettings` -> pro Vault in der .kdbx (portabel)
 *
 * Beide teilen dieselbe Validierungs-/Clamp-Logik über die `SettingDefinition`s
 * und den gemeinsamen `sanitizeSettings`-Sanitizer. Dadurch ist das Verhalten
 * deterministisch und identisch, egal wo persistiert wird.
 */
export abstract class SettingsProvider<T extends object> {
  protected value: T;

  protected constructor(defaults: T) {
    this.value = { ...defaults };
  }

  /** Laedt die Settings vom Speicher und setzt `value` (mit Defaults/Validierung). */
  abstract load(): Promise<void>;

  /** Persistiert den aktuellen `value` auf den Speicher. */
  abstract save(): Promise<void>;

  /** Liefert die Schema-Definitionen dieses Providers (fuer Sanitizer + UI). */
  abstract definitions(): SettingDefinition[];

  /** Aktueller (gültiger) Stand - flache Kopie, damit der Aufrufer nicht mutieren kann. */
  get(): T {
    return { ...this.value };
  }

  /** Validiert + clammt + merged `patch` auf den aktuellen Stand und persistiert. */
  async update(patch: Partial<T>): Promise<T> {
    this.value = this.sanitize(patch, this.value);
    await this.save();
    return this.get();
  }

  protected sanitize(patch: Partial<T>, base: T): T {
    return sanitizeSettings(
      this.definitions(),
      base as Record<string, unknown>,
      patch as Record<string, unknown>,
    ) as T;
  }
}

/** Typ-Hilfe: stellt sicher, dass ein Werte-Objekt nur SettingValue-Felder enthaelt. */
export type SettingValues<T> = T extends Record<string, SettingValue | Record<string, string>>
  ? T
  : never;
