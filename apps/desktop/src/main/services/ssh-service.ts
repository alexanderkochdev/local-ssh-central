import {
  CommandRunner,
  ConnectionManager,
  SessionManager,
  type HostConnectionConfig,
  type TerminalSession,
} from '@ssh-central/ssh-core';
import type { CommandRunResult, SessionInfo, SshEvent } from '@ssh-central/ipc-contracts';

export type SshEventSink = (event: SshEvent) => void;

/**
 * Orchestriert SSH-Sessions im Main-Process: baut Verbindungen auf, öffnet Terminal-
 * Kanäle und streamt Daten/Status an den Renderer. Beliebig viele parallele Sessions.
 */
export class SshService {
  private readonly connections = new ConnectionManager();
  private readonly sessions = new SessionManager(this.connections);
  private readonly runner = new CommandRunner(this.connections);
  private readonly infos = new Map<string, SessionInfo>();
  private readonly terminals = new Map<string, TerminalSession>();

  constructor(
    private readonly getConfig: (hostId: string) => Promise<HostConnectionConfig>,
    private readonly emit: SshEventSink,
    private readonly persistFingerprint: (hostId: string, fingerprint: string) => Promise<void>,
  ) {}

  async connect(hostId: string, cols = 80, rows = 24, command?: string): Promise<SessionInfo> {
    const config = await this.getConfig(hostId);
    const terminal = await this.sessions.open(hostId, config, cols, rows, command);

    // TOFU: Nach erfolgreichem Verbindungsaufbau den Host-Key-Fingerprint persistieren
    // (nur beim ersten Mal, da HostStore bereits vorhandene Fingerprints unangetastet laesst).
    const fingerprint = this.connections.getFingerprint(hostId);
    if (fingerprint) {
      await this.persistFingerprint(hostId, fingerprint);
    }

    const info: SessionInfo = {
      id: terminal.id,
      hostId,
      status: 'connected',
      title: `${config.username}@${config.host}`,
      startedAt: Date.now(),
    };
    this.infos.set(terminal.id, info);
    this.terminals.set(terminal.id, terminal);

    terminal.onData((chunk) => {
      this.emit({ type: 'sessionData', sessionId: terminal.id, data: chunk.toString('utf8') });
    });
    terminal.onClose((err) => {
      // Bereits per disconnect geschlossen -> kein doppeltes sessionClosed/Status-Event.
      if (!this.terminals.has(terminal.id)) {
        return;
      }
      const current = this.infos.get(terminal.id);
      if (current) {
        current.status = err ? 'error' : 'closed';
        current.error = err?.message;
        this.emit({
          type: 'sessionStatus',
          sessionId: terminal.id,
          status: current.status,
          error: current.error,
        });
      }
      this.emit({ type: 'sessionClosed', sessionId: terminal.id });
      this.infos.delete(terminal.id);
      this.terminals.delete(terminal.id);
    });

    this.emit({ type: 'sessionCreated', session: info });
    return info;
  }

  write(sessionId: string, data: string): void {
    this.terminals.get(sessionId)?.write(data);
  }

  disconnect(sessionId: string): void {
    if (!this.terminals.has(sessionId)) {
      return;
    }
    const current = this.infos.get(sessionId);
    // Erst aus den Tracking-Maps nehmen, damit ein (ggf. synchron beim stream.end() im
    // SessionManager) ausgeloestes close-Event den onClose-Guard trifft und kein zweites
    // sessionClosed/Status emittiert.
    this.terminals.delete(sessionId);
    if (current) {
      this.infos.delete(sessionId);
    }
    this.sessions.close(sessionId);
    // Explizites Schliessen (z.B. Terminal-Fenster zu): sessionClosed/Status SOFORT und
    // zuverlaessig emittieren - unabhaengig davon, ob der ssh2-Stream (z.B. haengende Shell)
    // ueberhaupt ein 'close'-Event liefert.
    if (current) {
      current.status = 'closed';
      this.emit({ type: 'sessionStatus', sessionId, status: 'closed' });
    }
    this.emit({ type: 'sessionClosed', sessionId });
  }

  resize(sessionId: string, cols: number, rows: number): void {
    this.sessions.resize(sessionId, cols, rows);
  }

  listSessions(): SessionInfo[] {
    return [...this.infos.values()];
  }

  /**
   * Fuehrt ein einzelnes Kommando auf einem Host aus (nicht-interaktiv) und liefert
   * Output + Exit-Code zurueck. Laeuft ausschliesslich im Main-Process (Config wird
   * lokal aufgeloest, nie an den Renderer gesendet).
   */
  async exec(hostId: string, command: string, timeoutMs?: number): Promise<CommandRunResult> {
    const config = await this.getConfig(hostId);
    const outcome = await this.runner.run(hostId, config, command, timeoutMs);
    return { hostId, ...outcome };
  }

  /** Schließt alle Sessions und Verbindungen (App-Quit / Vault-Lock). */
  async dispose(): Promise<void> {
    await this.sessions.closeAll();
  }

  /**
   * Schließt die Verbindung zu einem Host (z.B. nach einer Credential-Aenderung),
   * damit die naechste Verbindung die neuen Username/Passwort verwendet.
   */
  invalidateHost(hostId: string): void {
    this.connections.closeConnection(hostId);
  }
}
