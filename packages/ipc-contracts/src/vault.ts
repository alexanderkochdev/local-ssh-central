/** Vault-Zustand und -Operationen (KeePass/KDBX) + SSH-Keychain. */

/** Mindestlaenge des Master-Passworts (geteilt zwischen UI und Main-Enforcement). */
export const MIN_MASTER_PASSWORD_LENGTH = 12;

export type VaultStatus = 'no-vault' | 'locked' | 'unlocked';

export interface VaultInfo {
  status: VaultStatus;
  /** Existiert bereits eine Vault-Datei auf der Platte? */
  exists: boolean;
  /** Name/Version der Vault-Datei (nur Diagnose, keine Secrets). */
  fileName?: string;
}

export interface VaultCreateOptions {
  name: string;
  masterPassword: string;
}

/** Eine verfuegbare Vault-Datenbank. */
export interface VaultMeta {
  name: string;
  exists: boolean;
  active: boolean;
}

export interface VaultUnlockRequest {
  masterPassword: string;
}

export interface VaultChangeMasterPasswordRequest {
  currentPassword: string;
  newPassword: string;
}

/** Referenz auf ein gespeichertes Geheimnis - die Aufloesung passiert NUR im Main-Process. */
export type SecretRef = string;

// ------------------------------------------------------------------ Vault-Eintraege

export interface VaultEntryFields {
  title?: string;
  userName?: string;
  password?: string;
  /** Private-Key-Inhalt (PEM/OpenSSH). */
  keyData?: string;
  notes?: string;
}

/** Nicht-sensitiv: nur IDs + Anzeigenamen. */
export interface VaultEntrySummary {
  id: string;
  title?: string;
  userName?: string;
  /** true, wenn der Eintrag einen Private Key (KeyData) enthaelt. */
  hasKeyData?: boolean;
  /** Nur bei Key-Eintraegen: Fingerprint "SHA256:..." (oeffentlicher Teil). */
  fingerprint?: string;
  /** Nur bei Key-Eintraegen: ssh2-Keytyp. */
  keyType?: string;
}

export interface VaultEntryCreateRequest {
  fields: VaultEntryFields;
}

export interface VaultEntryUpdateRequest {
  id: string;
  fields: VaultEntryFields;
}

export interface VaultEntryDeleteRequest {
  id: string;
}

/** Holt das Passwort eines Eintrags - NUR fuer einen expliziten Copy-Vorgang (Clipboard-Guard). */
export interface VaultEntryGetRequest {
  id: string;
}

// ------------------------------------------------------------------ SSH-Keychain

export type SshKeyType = 'ed25519' | 'rsa';

export interface GenerateSshKeyRequest {
  keyType: SshKeyType;
  comment?: string;
  title?: string;
}

export interface ImportSshKeyRequest {
  privateKey: string;
  passphrase?: string;
  title?: string;
}

/** Oeffentlicher Teil eines Keys (Private Key verlaeuft nie an den Renderer). */
export interface SshKeyResult {
  id: string;
  title?: string;
  keyType: string;
  publicSsh: string;
  publicPem: string;
  fingerprint: string;
  comment?: string;
}

export type VaultEvent =
  | { type: 'unlocked' }
  | { type: 'locked' }
  | { type: 'autoLocked'; reason: string };
