import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { IpcChannels } from '@ssh-central/ipc-contracts';
import type { SshEvent } from '@ssh-central/ipc-contracts';
import '@xterm/xterm/css/xterm.css';

interface TerminalSessionProps {
  sessionId: string;
  /** Terminal-Schriftgroesse aus den Einstellungen (live anwendbar). */
  fontSize: number;
}

/**
 * Bindet eine SSH-Session an ein xterm.js-Terminal (WebGL-beschleunigt).
 * Datenstrom via `ssh:event` (sessionData), Eingaben via `ssh:write`.
 */
export function TerminalSession({ sessionId, fontSize }: TerminalSessionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);

  // Schriftgroesse aus den Einstellungen live anwenden, ohne das Terminal neu zu erstellen.
  useEffect(() => {
    const term = termRef.current;
    if (term) {
      term.options.fontSize = fontSize;
      term.refresh(0, term.rows - 1);
    }
  }, [fontSize]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const term = new Terminal({
      cursorBlink: true,
      fontSize,
      fontFamily: '"JetBrains Mono", "Cascadia Code", Consolas, monospace',
      scrollback: 10_000,
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    try {
      fit.fit();
      term.loadAddon(new WebglAddon());
    } catch {
      // WebGL nicht verfuegbar -> DOM-Renderer ist automatisch aktiv.
    }
    termRef.current = term;

    // Daten + Status von der Session empfangen.
    const off = window.api.onEvent(IpcChannels.sshEvent, (payload) => {
      const event = payload as SshEvent;
      if (event.type === 'sessionData' && event.sessionId === sessionId) {
        term.write(event.data);
      } else if (
        event.type === 'sessionStatus' &&
        event.sessionId === sessionId &&
        (event.status === 'closed' || event.status === 'error')
      ) {
        term.write(
          `\r\n\x1b[31m[SSH Central] Session ${event.status === 'closed' ? 'geschlossen' : 'Fehler'}: ${event.error ?? ''}\x1b[0m\r\n`,
        );
      }
    });

    // Eingaben senden.
    term.onData((data) => {
      void window.api.ssh.write({ sessionId, data });
    });
    term.onResize(({ cols, rows }) => {
      void window.api.ssh.resize({ sessionId, cols, rows });
    });

    const observer = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        // container noch nicht sichtbar
      }
    });
    observer.observe(container);

    return () => {
      off();
      observer.disconnect();
      term.dispose();
      termRef.current = null;
    };
    // Schriftgroesse bewusst nicht in den Deps: ein Aendern darf das Terminal NICHT neu
    // erstellen (Verbindung/Scrollback wuerden verloren gehen); Updates laufen ueber den
    // separaten fontSize-Effekt oben.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return <div ref={containerRef} style={{ height: '100%', width: '100%' }} />;
}
