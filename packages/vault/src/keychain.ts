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
  const keyType = type === 'rsa' ? 'ssh-rsa' : 'ssh-ed25519';
  const pair = utils.generateKeyPairSync(keyType as never, { comment } as never);
  return describeKey(pair.private, undefined, comment);
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

  const base = publicSshBuffer.toString('utf8').trim();
  const effectiveComment = comment ?? parsed.comment;
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
