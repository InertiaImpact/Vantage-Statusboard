'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build, Platform } = require('electron-builder');
const packageJson = require('../package.json');

const projectDirectory = path.resolve(__dirname, '..');
const outputDirectory = path.join(projectDirectory, 'dist');
const generatedDirectory = path.join(projectDirectory, 'build', 'generated');
const versionedSetupName = `Vantage-Statusboard-Setup-${packageJson.version}.exe`;
const embeddedSetupName = 'Vantage-Statusboard-Setup.exe';
const baseConfiguration = packageJson.build;

async function buildWindowsArtifacts() {
  const stagingDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'vantage-statusboard-build-'));
  const installerOutputDirectory = path.join(stagingDirectory, 'installer');
  const portableOutputDirectory = path.join(stagingDirectory, 'portable');
  fs.mkdirSync(outputDirectory, { recursive: true });
  const installerConfiguration = {
    ...baseConfiguration,
    directories: { ...baseConfiguration.directories, output: installerOutputDirectory },
    artifactName: 'Vantage-Statusboard-Setup-${version}.${ext}',
    win: { ...baseConfiguration.win, target: ['nsis'] },
    nsis: {
      oneClick: true,
      perMachine: false,
      allowElevation: false,
      createDesktopShortcut: false,
      createStartMenuShortcut: true,
      shortcutName: 'Vantage Statusboard',
      uninstallDisplayName: 'Vantage Statusboard',
      runAfterFinish: true,
      deleteAppDataOnUninstall: false
    }
  };

  try {
    await build({
      projectDir: projectDirectory,
      targets: Platform.WINDOWS.createTarget(['nsis']),
      config: installerConfiguration
    });

    const stagedSetupPath = path.join(installerOutputDirectory, versionedSetupName);
    if (!fs.existsSync(stagedSetupPath)) throw new Error(`Installer was not created at ${stagedSetupPath}`);
    const setupPath = path.join(outputDirectory, versionedSetupName);
    fs.copyFileSync(stagedSetupPath, setupPath);
    const stagedBlockMapPath = `${stagedSetupPath}.blockmap`;
    if (fs.existsSync(stagedBlockMapPath)) fs.copyFileSync(stagedBlockMapPath, `${setupPath}.blockmap`);
    fs.mkdirSync(generatedDirectory, { recursive: true });
    const embeddedSetupPath = path.join(generatedDirectory, embeddedSetupName);
    fs.copyFileSync(stagedSetupPath, embeddedSetupPath);

    const portableConfiguration = {
      ...baseConfiguration,
      directories: { ...baseConfiguration.directories, output: portableOutputDirectory },
      artifactName: 'Vantage-Statusboard-${version}-portable.${ext}',
      win: { ...baseConfiguration.win, target: ['portable'] },
      portable: { artifactName: 'Vantage-Statusboard-${version}-portable.${ext}' },
      extraResources: [
        { from: embeddedSetupPath, to: `installer/${embeddedSetupName}` }
      ]
    };

    await build({
      projectDir: projectDirectory,
      targets: Platform.WINDOWS.createTarget(['portable']),
      config: portableConfiguration
    });

    const portableName = `Vantage-Statusboard-${packageJson.version}-portable.exe`;
    const stagedPortablePath = path.join(portableOutputDirectory, portableName);
    const embeddedOutputPath = path.join(portableOutputDirectory, 'win-unpacked', 'resources', 'installer', embeddedSetupName);
    if (!fs.existsSync(stagedPortablePath) || !fs.existsSync(embeddedOutputPath)) {
      throw new Error('The portable build or its embedded installer was not created.');
    }
    fs.copyFileSync(stagedPortablePath, path.join(outputDirectory, portableName));
  } finally {
    try {
      fs.rmSync(stagingDirectory, { recursive: true, force: true });
    } catch (error) {
      console.warn(`Temporary build files could not be removed: ${error.message}`);
    }
  }
}

buildWindowsArtifacts().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
