'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { EMBEDDED_INSTALLER_NAME, InstallationManager } = require('../src/main/installation-manager');

const app = { isPackaged: true, getVersion: () => '1.4.7' };

test('finds and starts the installer embedded in a portable build', () => {
  const resourcesPath = path.join('C:\\Temp', 'Vantage', 'resources');
  const embeddedInstaller = path.join(resourcesPath, 'installer', EMBEDDED_INSTALLER_NAME);
  let launched = null;
  let detached = false;
  const manager = new InstallationManager(app, {
    environment: {
      LOCALAPPDATA: 'C:\\Users\\Newsroom\\AppData\\Local',
      PORTABLE_EXECUTABLE_FILE: 'D:\\Tools\\Vantage-Statusboard-1.4.7-portable.exe'
    },
    executablePath: 'C:\\Temp\\Vantage\\Vantage Statusboard.exe',
    resourcesPath,
    platform: 'win32',
    fileExists: (candidate) => candidate === embeddedInstaller,
    spawn: (executable, args, options) => {
      launched = { executable, args, options };
      return { unref: () => { detached = true; } };
    }
  });

  const status = manager.getStatus();
  assert.equal(status.portable, true);
  assert.equal(status.installed, false);
  assert.equal(status.available, true);
  assert.equal(status.installDirectory, 'C:\\Users\\Newsroom\\AppData\\Local\\Programs\\vantage-statusboard');

  const result = manager.startInstallation();
  assert.equal(result.started, true);
  assert.equal(launched.executable, embeddedInstaller);
  assert.deepEqual(launched.args, []);
  assert.equal(launched.options.windowsHide, false);
  assert.equal(detached, true);
});

test('recognizes a packaged non-portable build as installed', () => {
  const manager = new InstallationManager(app, {
    environment: { LOCALAPPDATA: 'C:\\Users\\Newsroom\\AppData\\Local' },
    executablePath: 'C:\\Users\\Newsroom\\AppData\\Local\\Programs\\vantage-statusboard\\Vantage Statusboard.exe',
    resourcesPath: 'C:\\Installed\\resources',
    platform: 'win32',
    fileExists: () => false
  });
  const status = manager.getStatus();
  assert.equal(status.installed, true);
  assert.equal(status.portable, false);
  assert.equal(status.available, false);
  assert.equal(manager.startInstallation().started, false);
});

test('refuses installation when a portable build is missing its installer', () => {
  const manager = new InstallationManager(app, {
    environment: { PORTABLE_EXECUTABLE_FILE: 'D:\\Tools\\Vantage.exe' },
    executablePath: 'C:\\Temp\\Vantage Statusboard.exe',
    resourcesPath: 'C:\\Temp\\resources',
    platform: 'win32',
    fileExists: () => false
  });
  assert.equal(manager.getStatus().available, false);
  assert.throws(() => manager.startInstallation(), /installer is not available/i);
});
