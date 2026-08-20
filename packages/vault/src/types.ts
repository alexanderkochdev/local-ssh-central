/** Fachliche Typen des Vault-Pakets (unabhaengig von kdbxweb-Implementierungsdetails). */

export type VaultState = 'no-vault' | 'locked' | 'unlocked';

/** Felder eines gespeicherten Geheimnisses (entspricht KeePass-Standardfeldern). */
export interface SecretFields {
  userName?: string;
  password?: string;
  /** Private-Key-Inhalt (PEM). */
  keyData?: string;
  /** Optionaler Titel/Anzeigename des Eintrags. */
  title?: string;
  /** Optionaler Kommentar. */
  notes?: string;
}

export interface VaultEntry {
  /** UUID des Eintrags - wird als SecretRef / Host-Referenz verwendet. */
  id: string;
  fields: SecretFields;
  createdAt?: number;
  modifiedAt?: number;
}

export interface VaultErrorOptions {
  /** Menschenlesbare, nicht-sensitiv Meldung fuer die UI. */
  message: string;
}

/** Fehler, der als abgegrenzte Entitaet ueber IPC propagiert wird (keine internen Stacks mit Secrets). */
export class VaultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VaultError';
  }
}
