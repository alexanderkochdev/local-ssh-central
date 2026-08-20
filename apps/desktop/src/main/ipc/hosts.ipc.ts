import { ipcMain } from 'electron';
import { IpcChannels } from '@ssh-central/ipc-contracts';
import type {
  HostDeleteRequest,
  HostSecretRefs,
  HostUpsertRequest,
} from '@ssh-central/ipc-contracts';
import type { AppServices } from './types.js';
import type { ResolvedHostInput } from '../services/host-store.js';

/**
 * Registriert die Host-Ipc-Handler. Secrets werden hier im Main-Process aus den
 * transienten `request.secrets` in den (entsperrten) Vault geschrieben; hosts.json
 * enthaelt nur Referenzen, nie Klartext.
 */
export function registerHostsIpc(services: AppServices): void {
  ipcMain.handle(IpcChannels.hostsList, () => services.hosts.list());

  ipcMain.handle(IpcChannels.hostsUpsert, async (_event, request: HostUpsertRequest) => {
    const vault = services.vault.underlying;
    if (vault.state !== 'unlocked') {
      throw new Error('Der Tresor muss entsperrt sein.');
    }

    const secrets = request.secrets ?? {};
    const existing = request.host.id ? services.hosts.getById(request.host.id) : undefined;
    const refs: HostSecretRefs = { ...existing?.secrets };

    // Direkte Referenzen (aus der Keychain gewaehlte/erzeugte Eintraege) uebernehmen.
    if (secrets.keyRef) {
      refs.keyRef = secrets.keyRef;
    }
    if (secrets.passwordRef) {
      refs.passwordRef = secrets.passwordRef;
    }

    // Neue/geaenderte Passwort-Secrets in den Vault schreiben.
    if (request.host.authMethod === 'password' && secrets.password) {
      const fields = {
        title: `${request.host.name} · Passwort`,
        userName: secrets.userName,
        password: secrets.password,
      };
      if (refs.passwordRef) {
        await vault.updateEntry(refs.passwordRef, fields);
      } else {
        refs.passwordRef = await vault.createEntry(fields);
      }
    }

    // Neue/geaenderte Key-Secrets in den Vault schreiben.
    if (request.host.authMethod === 'key' && secrets.privateKey) {
      const fields = {
        title: `${request.host.name} · SSH Key`,
        keyData: secrets.privateKey,
        password: secrets.keyPassphrase,
      };
      if (refs.keyRef) {
        await vault.updateEntry(refs.keyRef, fields);
      } else {
        refs.keyRef = await vault.createEntry(fields);
      }
    }

    const resolved: ResolvedHostInput = { ...request.host, secrets: refs };
    return services.hosts.upsert(resolved);
  });

  ipcMain.handle(IpcChannels.hostsDelete, (_event, request: HostDeleteRequest) =>
    services.hosts.remove(request),
  );
}
