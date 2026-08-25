// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VaultSettingsDialog } from '../src/features/settings/VaultSettingsDialog.js';
import { useSettingsStore } from '../src/store/settings-store.js';

const initialVault = useSettingsStore.getState().vault;

beforeEach(() => {
  // Store auf definierten Ausgangszustand setzen; clipboardClearSeconds auf 0 (wie beim User).
  useSettingsStore.setState({ vault: { ...initialVault, clipboardClearSeconds: 0 } }, false);
  // window.api so mocken, dass setVault wie der Main den Patch auf den aktuellen Stand merged.
  // (Nur die api-Eigenschaft setzen - jsdom-window NICHT ersetzen, sonst fehlen window-Methoden.)
  (window as unknown as { api?: unknown }).api = {
    settings: {
      setVault: vi.fn(async (patch: Record<string, unknown>) => ({
        ...useSettingsStore.getState().vault,
        ...patch,
      })),
    },
  };
});

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('VaultSettingsDialog Clipboard-Feld (kompletter Flow)', () => {
  it('Wert 0 -> 5 tippen + Blur behaelt 5 im Feld UND im Store', async () => {
    render(<VaultSettingsDialog open onClose={() => undefined} />);

    // Spinbuttons in Render-Reihenfolge: autoLock(0), clipboardClearSeconds(1), sftpConcurrency(2)
    const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    const clipboard = inputs[1]!;
    expect(clipboard.value).toBe('0');

    fireEvent.change(clipboard, { target: { value: '5' } });
    fireEvent.blur(clipboard);

    await flush();

    const after = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    expect(after[1]!.value).toBe('5');
    expect(useSettingsStore.getState().vault.clipboardClearSeconds).toBe(5);
  });
});
