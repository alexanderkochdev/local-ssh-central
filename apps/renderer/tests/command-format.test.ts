import { describe, it, expect } from 'vitest';
import type { CommandRunResult } from '@ssh-central/ipc-contracts';
import { formatSingleOutput, formatAllOutputs } from '../src/features/command-runner/format.js';

function result(partial: Partial<CommandRunResult> & Pick<CommandRunResult, 'hostId'>): CommandRunResult {
  return { success: true, output: '', ...partial };
}

describe('formatSingleOutput', () => {
  it('formatiert Exit-Code + Output', () => {
    expect(formatSingleOutput(result({ hostId: 'h1', exitCode: 0, output: 'ok\n' }), 'prod')).toBe(
      '=== prod (exit 0) ===\nok\n',
    );
  });

  it('zeigt ein Fragezeichen, wenn kein Exit-Code vorliegt', () => {
    expect(formatSingleOutput(result({ hostId: 'h1', output: 'x' }), 'prod')).toBe(
      '=== prod (exit ?) ===\nx',
    );
  });
});

describe('formatAllOutputs', () => {
  const getName = (id: string): string | undefined => (id === 'h1' ? 'prod' : undefined);

  it('trennt mehrere Ergebnisse mit Leerzeile und nutzt den Host-Namen, sonst die ID', () => {
    const body = formatAllOutputs(
      [result({ hostId: 'h1', exitCode: 0, output: 'a' }), result({ hostId: 'h2', exitCode: 1, output: 'b' })],
      getName,
    );
    expect(body).toBe('=== prod (exit 0) ===\na\n\n=== h2 (exit 1) ===\nb');
  });
});
