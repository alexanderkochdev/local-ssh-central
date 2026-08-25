/**
 * Reine Formatierungs-Logik des Multi-Host Command Runners (separat testbar).
 */
import type { CommandRunResult } from '@ssh-central/ipc-contracts';

/** Formatiert EIN Ergebnis fuer die Export-Ausgabe. */
export function formatSingleOutput(result: CommandRunResult, hostName: string): string {
  return `=== ${hostName} (exit ${result.exitCode ?? '?'}) ===\n${result.output}`;
}

/** Baut den zusammenhaengenden Text fuer "Alle Ausgaben kopieren". */
export function formatAllOutputs(
  results: CommandRunResult[],
  getName: (hostId: string) => string | undefined,
): string {
  return results
    .map((result) => formatSingleOutput(result, getName(result.hostId) ?? result.hostId))
    .join('\n\n');
}
