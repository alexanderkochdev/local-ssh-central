import { describe, it, expect } from 'vitest';
import type { PluginInfo } from '@ssh-central/ipc-contracts';
import { resolveActiveView } from '../src/store/workspace-store.js';

function plugin(name: string, enabled: boolean): PluginInfo {
  return { name, version: '1.0.0', enabled, tabs: [], hasUi: false, permissions: [] };
}

describe('resolveActiveView', () => {
  it('laesst Nicht-Plugin-Views unveraendert', () => {
    expect(resolveActiveView('hosts', [])).toBe('hosts');
    expect(resolveActiveView('vault', [])).toBe('vault');
  });

  it('behaelt eine Plugin-View, solange das Plugin aktiviert ist', () => {
    const plugins = [plugin('p1', true)];
    expect(resolveActiveView('plugin:p1:t1', plugins)).toBe('plugin:p1:t1');
  });

  it('faellt auf hosts zurueck, wenn das Plugin deaktiviert ist', () => {
    const plugins = [plugin('p1', false)];
    expect(resolveActiveView('plugin:p1:t1', plugins)).toBe('hosts');
  });

  it('faellt auf hosts zurueck, wenn das Plugin nicht (mehr) installiert ist', () => {
    expect(resolveActiveView('plugin:p1:t1', [])).toBe('hosts');
  });

  it('sondert den Plugin-Namen korrekt aus einer View mit Doppelpunkt im Tab', () => {
    const plugins = [plugin('p1', true)];
    expect(resolveActiveView('plugin:p1:foo:bar', plugins)).toBe('plugin:p1:foo:bar');
  });
});
