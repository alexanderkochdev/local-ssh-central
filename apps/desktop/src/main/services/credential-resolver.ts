import type { Host } from '@ssh-central/ipc-contracts';
import type { HostConnectionConfig } from '@ssh-central/ssh-core';
import type { KdbxVault } from '@ssh-central/vault';

/**
 * Loest die zu einer Host-Metadaten-Referenz gehoerigen Secrets aus dem (entsperrten)
 * Vault auf und baut daraus eine ssh2-Verbindungskonfiguration. Laeuft ausschliesslich
 * im Main-Process; die Konfiguration verlaeuft NIE ueber die IPC an den Renderer.
 */
export function resolveConnectionConfig(host: Host, vault: KdbxVault): HostConnectionConfig {
  const config: HostConnectionConfig = {
    host: host.host,
    port: host.port,
    username: host.username,
    expectedFingerprint: host.fingerprint,
  };

  if (host.authMethod === 'password') {
    config.password = host.secrets.passwordRef
      ? vault.getSecret(host.secrets.passwordRef, 'password')
      : undefined;
  } else {
    config.privateKey = host.secrets.keyRef
      ? vault.getSecret(host.secrets.keyRef, 'keyData')
      : undefined;
    // Die Key-Passphrase liegt (falls vorhanden) im selben Key-Eintrag als Passwort-Feld.
    if (host.secrets.keyRef) {
      config.passphrase = vault.getSecret(host.secrets.keyRef, 'password');
    }
  }

  return config;
}
