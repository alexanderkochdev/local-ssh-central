import { utils } from 'ssh2';
import { createHash } from 'node:crypto';
import { VaultError } from './types.js';

export type SshKeyType = 'ed25519' | 'rsa';

export interface SshKeyInfo {
  /** Private-Key-Inhalt (PEM/OpenSSH) - NUR im Main-Process. */
  privateKey: string;
  /** public key in authorized_keys-Format ("ssh-ed25519 AAAA... comment"). */
  publicSsh: string;
  /** public key als PEM. */
  publicPem: string;
  /** Fingerprint "SHA256:..." des Public Keys. */
  fingerprint: string;
  /** ssh2-Keytyp, z.B. "ssh-ed25519" oder "ssh-rsa". */
  keyType: string;
  comment?: string;
}

/**
 * SSH-Keychain: erzeugt, importiert und analysiert SSH-Schluesselpaare.
 * Laeuft ausschliesslich im Main-Process; der Private Key wird hier NICHT geloggt
 * und nur verschluesselt (ueber den KDBX-Vault) persistiert.
 */
export function generateSshKey(type: SshKeyType, comment = 'ssh-central'): SshKeyInfo {
  // ssh2 erwartet den kurzen Algorithmusnamen ("rsa"/"ed25519"), nicht den
  // OpenSSH-Typstring ("ssh-ed25519"); RSA benoetigt zudem die Bitlaenge.
  const algo = type === 'rsa' ? 'rsa' : 'ed25519';
  const opts = type === 'rsa' ? { bits: 2048, comment } : { comment };
  // ssh2-Bug (ed25519): beginnt der generierte Public-Key zufaellig mit Byte 0x00
  // (~1/256), entfernt ssh2 beim Serialisieren ein echtes Key-Byte -> der eigene
  // parseKey scheitert. Darum erzeugen wir mit Retry, bis ein gueltiger Key da ist.
  for (let attempt = 0; attempt < 8; attempt++) {
    const pair = utils.generateKeyPairSync(algo as never, opts as never);
    try {
      return describeKey(pair.private, undefined, comment);
    } catch {
      // ssh2-Fehlerfall: naechster Versuch (bei 8 Versuchen < 1e-19 Ausfallwahrscheinlichkeit).
    }
  }
  throw new VaultError('SSH-Schluessel konnte nicht erzeugt werden.');
}

/** Importiert einen vorhandenen Private Key (OpenSSH/PEM) und validiert ihn. */
export function importSshKey(privateKey: string, passphrase?: string, comment?: string): SshKeyInfo {
  return describeKey(privateKey, passphrase, comment);
}

function describeKey(privateKey: string, passphrase?: string, comment?: string): SshKeyInfo {
  const parsed = utils.parseKey(privateKey, passphrase);
  if (parsed instanceof Error) {
    throw new VaultError(
      'Ungueltiger SSH-Private-Key. Pruefe das Format und - falls verschluesselt - die Passphrase.',
    );
  }

  const publicSshBuffer = parsed.getPublicSSH();
  const fingerprint =
    'SHA256:' + createHash('sha256').update(publicSshBuffer).digest('base64');

  // Lesbares authorized_keys-Format: "<typ> <base64(blob)> <kommentar>".
  const effectiveComment = comment ?? parsed.comment;
  const base = `${parsed.type} ${publicSshBuffer.toString('base64')}`;
  const publicSsh = effectiveComment ? `${base} ${effectiveComment}` : base;

  return {
    privateKey,
    publicSsh,
    publicPem: parsed.getPublicPEM(),
    fingerprint,
    keyType: parsed.type,
    comment: effectiveComment || undefined,
  };
}
