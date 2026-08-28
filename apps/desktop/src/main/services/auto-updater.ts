import type { AutoUpdateState } from '@ssh-central/ipc-contracts';

/**
 * In-App-Update (electron-updater).
 *
 * Aufgabenteilung mit `release-checker.ts`:
 * - `ReleaseChecker` fragt die GitHub-Releases-API ab und ERINNERT beim Start an ein Update.
 *   Das funktioniert immer - auch im Dev-Modus und bei der .deb-Installation.
 * - `AutoUpdateService` LAEDT und INSTALLIERT das Update, wo electron-updater das kann
 *   (Windows-NSIS-Installation, Linux-AppImage). Sonst bleibt der manuelle Weg ueber die
 *   Release-Seite.
 *
 * Der Updater ist als Port injiziert, damit der Service ohne Electron-/electron-updater-
 * Harness testbar ist. Fehler werden nie geworfen, sondern als `stage: 'error'` gemeldet -
 * ein fehlgeschlagenes Update darf die App nie blockieren.
 */

/** Fortschritts-Payload von electron-updater (`download-progress`). */
export interface UpdaterProgressInfo {
  percent?: number;
  transferred?: number;
  total?: number;
  bytesPerSecond?: number;
}

/** Versions-Payload von electron-updater (`update-available` / `update-downloaded`). */
export interface UpdaterVersionInfo {
  version?: string;
}

/** Minimaler Ausschnitt der electron-updater-API, den dieser Service benoetigt. */
export interface UpdaterPort {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  on(event: string, listener: (payload: never) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
}

/** Neutraler Ausgangszustand. */
export const AUTO_UPDATE_IDLE: AutoUpdateState = {
  stage: 'idle',
  version: null,
  percent: 0,
  transferred: 0,
  total: 0,
  bytesPerSecond: 0,
  message: null,
};

/** Umgebungs-Merkmale, die entscheiden, ob sich der Build selbst aktualisieren kann. */
export interface AutoUpdateEnvironment {
  platform: string;
  /** app.isPackaged - im Dev-Modus gibt es keine Installation zum Ersetzen. */
  isPackaged: boolean;
  /** true, wenn die App aus einem AppImage laeuft (process.env.APPIMAGE gesetzt). */
  isAppImage: boolean;
}

/**
 * Kann dieser Build sich selbst aktualisieren?
 * - Windows (NSIS-Installer): ja
 * - Linux: nur als AppImage (.deb wird vom Paketmanager verwaltet)
 * - alles andere / Dev-Modus: nein
 */
export function isAutoUpdateSupported(environment: AutoUpdateEnvironment): boolean {
  if (!environment.isPackaged) {
    return false;
  }
  if (environment.platform === 'win32') {
    return true;
  }
  if (environment.platform === 'linux') {
    return environment.isAppImage;
  }
  return false;
}

/** Liest die Umgebungs-Merkmale aus dem laufenden Prozess. */
export function detectAutoUpdateEnvironment(isPackaged: boolean): AutoUpdateEnvironment {
  return {
    platform: process.platform,
    isPackaged,
    isAppImage: Boolean(process.env.APPIMAGE),
  };
}

const UNSUPPORTED_MESSAGE = 'Dieser Build kann sich nicht selbst aktualisieren.';

export class AutoUpdateService {
  private state: AutoUpdateState;

  constructor(
    private readonly updater: UpdaterPort,
    private readonly emit: (state: AutoUpdateState) => void,
    private readonly supported: boolean,
  ) {
    if (!this.supported) {
      this.state = { ...AUTO_UPDATE_IDLE, stage: 'unsupported', message: UNSUPPORTED_MESSAGE };
      return;
    }
    this.state = { ...AUTO_UPDATE_IDLE };
    // Nie ungefragt im Hintergrund laden - der User entscheidet im Update-Dialog.
    this.updater.autoDownload = false;
    // Ein bereits geladenes Update darf beim naechsten Beenden installiert werden.
    this.updater.autoInstallOnAppQuit = true;
    this.registerEvents();
  }

  /** true, wenn Download + Installation aus der App heraus moeglich sind. */
  isSupported(): boolean {
    return this.supported;
  }

  getState(): AutoUpdateState {
    return { ...this.state };
  }

  /** Startet den Download (idempotent: laufender/fertiger Download wird nicht neu gestartet). */
  async download(): Promise<AutoUpdateState> {
    if (!this.supported || this.state.stage === 'downloading' || this.state.stage === 'downloaded') {
      return this.getState();
    }
    this.setState({ stage: 'downloading', percent: 0, transferred: 0, message: null });
    try {
      // electron-updater verlangt einen Check, bevor `downloadUpdate` erlaubt ist.
      await this.updater.checkForUpdates();
      await this.updater.downloadUpdate();
    } catch (error) {
      this.setState({ stage: 'error', message: toMessage(error) });
    }
    return this.getState();
  }

  /** Beendet die App und installiert das heruntergeladene Update. */
  install(): boolean {
    if (this.state.stage !== 'downloaded') {
      return false;
    }
    try {
      this.updater.quitAndInstall(false, true);
      return true;
    } catch (error) {
      this.setState({ stage: 'error', message: toMessage(error) });
      return false;
    }
  }

  private registerEvents(): void {
    this.updater.on('update-available', ((info: UpdaterVersionInfo) => {
      this.setState({ version: info?.version ?? this.state.version });
    }) as (payload: never) => void);

    this.updater.on('download-progress', ((progress: UpdaterProgressInfo) => {
      this.setState({
        stage: 'downloading',
        percent: clampPercent(progress?.percent),
        transferred: Math.max(0, progress?.transferred ?? 0),
        total: Math.max(0, progress?.total ?? 0),
        bytesPerSecond: Math.max(0, progress?.bytesPerSecond ?? 0),
      });
    }) as (payload: never) => void);

    this.updater.on('update-downloaded', ((info: UpdaterVersionInfo) => {
      this.setState({
        stage: 'downloaded',
        percent: 100,
        version: info?.version ?? this.state.version,
        message: null,
      });
    }) as (payload: never) => void);

    this.updater.on('error', ((error: unknown) => {
      this.setState({ stage: 'error', message: toMessage(error) });
    }) as (payload: never) => void);
  }

  private setState(patch: Partial<AutoUpdateState>): void {
    this.state = { ...this.state, ...patch };
    this.emit(this.getState());
  }
}

function clampPercent(percent: number | undefined): number {
  if (typeof percent !== 'number' || !Number.isFinite(percent)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(percent)));
}

function toMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error.length > 0) {
    return error;
  }
  return 'Unbekannter Update-Fehler.';
}
