import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { load } from 'js-yaml';

/**
 * Regressionstests fuer die Packaging-/Release-Konfiguration.
 *
 * Diese Datei prueft KEINEN Laufzeit-Code, sondern die Kopplung zwischen drei Dateien, die
 * zwangsweise zusammenpassen muessen. Beide hier abgesicherten Faelle waren echte Bugs:
 *
 * 1. `directories.output` (electron-builder) und der Upload-Glob (CI) liefen auseinander:
 *    electron-builder schrieb nach `release/<version>/`, die CI suchte in `release/`.
 *    Folge: eine GitHub-Release OHNE Installer - und `if-no-files-found: warn` verschwieg es.
 * 2. `artifactName` enthielt `${productName}` ("SSH Central") MIT Leerzeichen. GitHub ersetzt
 *    Leerzeichen in Asset-Namen durch Punkte, electron-builder schreibt in `latest.yml` aber
 *    Bindestriche. Folge: Auto-Update laeuft in einen 404.
 *
 * Beide Fehler sind beim Bauen unsichtbar und fallen erst beim Release bzw. beim Endnutzer auf -
 * genau deshalb stehen sie hier.
 */

const desktopRoot = join(__dirname, '..');
const repoRoot = join(desktopRoot, '../..');

interface BuilderConfig {
  directories: { output: string };
  win: { artifactName: string };
  linux: { artifactName: string };
  publish: { provider: string; owner: string; repo: string };
}

interface WorkflowStep {
  name?: string;
  uses?: string;
  with?: Record<string, string>;
}

interface Workflow {
  jobs: Record<string, { needs?: string | string[]; steps: WorkflowStep[] }>;
}

function readYaml<T>(...pathSegments: string[]): T {
  return load(readFileSync(join(...pathSegments), 'utf8')) as T;
}

const builder = readYaml<BuilderConfig>(desktopRoot, 'electron-builder.yml');
const workflow = readYaml<Workflow>(repoRoot, '.github/workflows/build.yml');

/** Der Schritt, der die Installer als Workflow-Artifact hochlaedt. */
const uploadStep = workflow.jobs.package!.steps.find((step) => step.uses?.startsWith('actions/upload-artifact'))!;
const uploadGlobs = (uploadStep.with!.path ?? '')
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

describe('electron-builder-Konfiguration', () => {
  it('baut versionsspezifisch (verhindert EBUSY gegen ein altes win-unpacked)', () => {
    expect(builder.directories.output).toBe('release/${version}');
  });

  it('Artifact-Namen enthalten keine Leerzeichen (sonst 404 beim Auto-Update)', () => {
    for (const [platform, artifactName] of Object.entries({
      win: builder.win.artifactName,
      linux: builder.linux.artifactName,
    })) {
      expect(artifactName, `${platform}.artifactName darf kein Leerzeichen enthalten`).not.toMatch(/\s/);
      // ${productName} ist "SSH Central" - die Vorlage selbst ist leerzeichenfrei, das
      // Ergebnis aber nicht. Deshalb hier verboten.
      expect(artifactName, `${platform}.artifactName darf \${productName} nicht verwenden`).not.toContain(
        '${productName}',
      );
      expect(artifactName).toContain('${version}');
    }
  });

  it('veroeffentlicht gegen das echte Repo (Quelle fuer app-update.yml)', () => {
    const repositoryUrl = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).repository.url as string;
    expect(builder.publish.provider).toBe('github');
    expect(repositoryUrl).toContain(`${builder.publish.owner}/${builder.publish.repo}`);
  });
});

describe('CI-Upload passt zum electron-builder-Output', () => {
  /** Aus `release/${version}` folgt: die Artifacts liegen GENAU eine Ebene unter `release/`. */
  const expectedPrefix = 'apps/desktop/release/*/';

  it('jeder Upload-Glob greift auf der richtigen Ebene', () => {
    const outputDepth = builder.directories.output.split('/').length; // release/${version} -> 2
    expect(outputDepth).toBe(expectedPrefix.replace(/^apps\/desktop\//, '').split('/').length - 1);

    expect(uploadGlobs.length).toBeGreaterThan(0);
    for (const glob of uploadGlobs) {
      expect(glob.startsWith(expectedPrefix), `Glob "${glob}" liegt nicht in ${expectedPrefix}`).toBe(true);
      // Genau eine Verzeichnis-Ebene: alles Tiefere wuerde die internen Helfer aus
      // win-unpacked/ (elevate.exe, pagent.exe) mit in die Release ziehen.
      expect(glob.slice(expectedPrefix.length), `Glob "${glob}" greift zu tief`).not.toContain('/');
    }
  });

  it('laedt alle fuer das Auto-Update noetigen Dateien hoch', () => {
    const suffixes = uploadGlobs.map((glob) => glob.slice(expectedPrefix.length));
    // Installer
    expect(suffixes).toContain('*.exe');
    expect(suffixes).toContain('*.AppImage');
    expect(suffixes).toContain('*.deb');
    // Update-Metadaten - ohne diese findet electron-updater kein Update.
    // `latest*.yml` deckt latest.yml (Windows) UND latest-linux.yml (AppImage) ab.
    expect(suffixes).toContain('latest*.yml');
    expect(suffixes).toContain('*.blockmap');
  });

  it('schlaegt laut fehl, wenn nichts gebaut wurde (kein stilles "warn")', () => {
    expect(uploadStep.with!['if-no-files-found']).toBe('error');
  });
});

describe('Release-Job', () => {
  const releaseJob = workflow.jobs.release!;
  const downloadStep = releaseJob.steps.find((step) => step.uses?.startsWith('actions/download-artifact'))!;

  it('laeuft erst nach dem Packen', () => {
    expect(releaseJob.needs).toBe('package');
  });

  it('laedt genau die Artifacts, die der package-Job hochlaedt', () => {
    const uploadedName = uploadStep.with!.name!; // z.B. "ssh-central-${{ matrix.os }}"
    const pattern = downloadStep.with!.pattern!; // z.B. "ssh-central-*"
    const prefix = pattern.replace(/\*$/, '');

    expect(pattern.endsWith('*'), 'Download-Pattern muss ein Praefix-Glob sein').toBe(true);
    expect(
      uploadedName.startsWith(prefix),
      `Artifact-Name "${uploadedName}" passt nicht zu Pattern "${pattern}"`,
    ).toBe(true);
    // Coverage-Berichte heissen "coverage-<os>" und duerfen so NIE in der Release landen.
    expect('coverage-ubuntu-latest'.startsWith(prefix)).toBe(false);
  });
});
