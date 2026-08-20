import * as kdbxweb from 'kdbxweb';

let registered = false;

// Argon2Type (kdbxweb): 0 = Argon2d, 2 = Argon2id
// @node-rs/argon2 Algorithm: 0 = Argon2d, 2 = Argon2id
// @node-rs/argon2 Version: 0 = 0x10, 1 = 0x13
type Argon2Algorithm = 0 | 2;
type Argon2VersionValue = 0 | 1;

/**
 * Registriert die native Argon2-Implementierung (Prebuilt-Binary) bei kdbxweb.
 *
 * WICHTIG: `@node-rs/argon2` wird NUR hier lazy (dynamisch) geladen, NICHT beim
 * Modul-Load. Ein natives Modul, das beim Top-Level-require scheitert, wuerde sonst
 * den gesamten Electron-Main-Process beim Start crashen. So laedt es erst, wenn der
 * Tresor tatsaechlich erstellt/entsperrt wird. Ohne Registrierung schlaegt das
 * Speichern eines Argon2-Vaults fehl ("argon2 not implemented").
 */
export async function registerArgon2(): Promise<void> {
  if (registered) {
    return;
  }
  const { hashRaw } = await import('@node-rs/argon2');

  kdbxweb.CryptoEngine.setArgon2Impl(
    async (password, salt, memory, iterations, length, parallelism, type, version) => {
      const algorithm: Argon2Algorithm = type === 2 ? 2 : 0;
      const versionValue: Argon2VersionValue = version === 0x10 ? 0 : 1;
      const raw = await hashRaw(new Uint8Array(password), {
        memoryCost: memory,
        timeCost: iterations,
        outputLen: length,
        parallelism,
        algorithm,
        version: versionValue,
        salt: new Uint8Array(salt),
      });
      return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
    },
  );
  registered = true;
}
