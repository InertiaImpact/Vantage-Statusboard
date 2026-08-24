'use strict';

const fs = require('node:fs');
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
  const installerConfiguration = {
    ...baseConfiguration,
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

  await build({
    projectDir: projectDirectory,
    targets: Platform.WINDOWS.createTarget(['nsis']),
    config: installerConfiguration
  });

  const setupPath = path.join(outputDirectory, versionedSetupName);
  if (!fs.existsSync(setupPath)) throw new Error(`Installer was not created at ${setupPath}`);
  fs.mkdirSync(generatedDirectory, { recursive: true });
  const embeddedSetupPath = path.join(generatedDirectory, embeddedSetupName);
  fs.copyFileSync(setupPath, embeddedSetupPath);

  const portableConfiguration = {
    ...baseConfiguration,
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

  const embeddedOutputPath = path.join(outputDirectory, 'win-unpacked', 'resources', 'installer', embeddedSetupName);
  if (!fs.existsSync(embeddedOutputPath)) throw new Error('The portable build does not contain its installer.');
}

buildWindowsArtifacts().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
