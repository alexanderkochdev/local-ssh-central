/** System-Ressourcen-Statistiken für die Statusleiste (nur eigener Verbrauch des Programms). */
export interface SystemStats {
  cpu: {
    /** CPU-Auslastung des App-Prozesses (0-100). */
    appPercent: number;
  };
  memory: {
    /** Arbeitsspeicher des App-Prozesses in MB (RSS). */
    appRssMb: number;
  };
  gpu: {
    /** Anzeigename der GPU (falls verfügbar). */
    name?: string;
  };
  disk: {
    /** Vom App-Datenverzeichnis belegter Speicher in MB. */
    appDataMb: number;
  };
  network: {
    /** Systemweiter Upload in KB/s (Delta-basiert). */
    upKbps: number;
    /** Systemweiter Download in KB/s (Delta-basiert). */
    downKbps: number;
    /** Latenz zum konfigurierbaren Ping-Ziel in ms (undefined, wenn nicht erreichbar). */
    latencyMs?: number;
  };
  /** Zeitstempel der Messung (ms). */
  timestamp: number;
}
