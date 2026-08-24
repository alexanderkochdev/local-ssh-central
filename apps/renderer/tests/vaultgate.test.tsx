// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useVaultStore } from '../src/store/vault-store.js';
import { VaultGate } from '../src/features/vault/VaultGate.js';

const initialVault = useVaultStore.getState();

beforeEach(() => {
  useVaultStore.setState(initialVault, true);
});

function mockApi() {
  (window as unknown as Record<string, unknown>).api = {
    vault: {
      status: vi.fn().mockResolvedValue({ status: 'locked', exists: true, fileName: 'main.kdbx' }),
      list: vi.fn().mockResolvedValue([{ name: 'main', exists: true, active: true }]),
      unlock: vi.fn().mockResolvedValue(undefined),
    },
  };
}

describe('VaultGate (Login-Flow)', () => {
  it('zeigt nach dem Check den Entsperr-Dialog', async () => {
    mockApi();
    render(<VaultGate />);

    // Status ist zunaechst 'checking' -> Spinner, danach Entsperr-Formular.
    const input = await screen.findByLabelText(/passwort|password/i);
    expect(input).toBeTruthy();
  });

  it('entsperrt den Tresor mit dem eingegebenen Passwort', async () => {
    mockApi();
    render(<VaultGate />);

    const input = (await screen.findByLabelText(/passwort|password/i)) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'pw-1234567890' } });

    const button = screen.getByRole('button', { name: /entsperren|unlock/i });
    fireEvent.click(button);

    const api = (window as unknown as { api: { vault: { unlock: ReturnType<typeof vi.fn> } } }).api;
    await waitFor(() => expect(api.vault.unlock).toHaveBeenCalledWith({ masterPassword: 'pw-1234567890' }));
  });

  it('zeigt einen Fehler, wenn der Unlock fehlschlaegt', async () => {
    mockApi();
    const api = (window as unknown as { api: { vault: { unlock: ReturnType<typeof vi.fn> } } }).api;
    api.vault.unlock.mockRejectedValue(new Error('falsches Passwort'));

    render(<VaultGate />);
    const input = (await screen.findByLabelText(/passwort|password/i)) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'falsch' } });
    fireEvent.click(screen.getByRole('button', { name: /entsperren|unlock/i }));

    await screen.findByText('falsches Passwort');
  });
});
