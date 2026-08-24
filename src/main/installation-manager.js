'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const EMBEDDED_INSTALLER_NAME = 'Vantage-Statusboard-Setup.exe';
const PRODUCT_DIRECTORY_NAME = 'vantage-statusboard';

class InstallationManager {
  constructor(electronApp, options = {}) {
    this.app = electronApp;
    this.environment = options.environment || process.env;
    this.executablePath = options.executablePath || process.execPath;
    this.resourcesPath = options.resourcesPath || process.resourcesPath;
    this.platform = options.platform || process.platform;
    this.fileExists = options.fileExists || fs.existsSync;
    this.spawn = options.spawn || spawn;
  }

  getStatus() {
    const portable = Boolean(this.environment.PORTABLE_EXECUTABLE_FILE);
    const packaged = Boolean(this.app.isPackaged);
    const installed = packaged && !portable;
    const installerPath = this.#findInstallerPath();
    return {
      available: this.platform === 'win32' && portable && Boolean(installerPath),
      installed,
      portable,
      packaged,
      version: this.app.getVersion(),
      installDirectory: this.#installDirectory()
    };
  }

  startInstallation() {
    const status = this.getStatus();
    if (status.installed) return { ...status, started: false };
    if (!status.available) {
      throw new Error('The Windows installer is not available in this copy of the app.');
    }

    const installerPath = this.#findInstallerPath();
    const child = this.spawn(installerPath, [], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false
    });
    child.unref();
    return { ...status, started: true };
  }

  #findInstallerPath() {
    const candidates = [
      path.join(this.resourcesPath, 'installer', EMBEDDED_INSTALLER_NAME),
      path.join(
        path.dirname(this.environment.PORTABLE_EXECUTABLE_FILE || this.executablePath),
        `Vantage-Statusboard-Setup-${this.app.getVersion()}.exe`
      )
    ];
    return candidates.find((candidate) => this.fileExists(candidate)) || null;
  }

  #installDirectory() {
    const localAppData = String(this.environment.LOCALAPPDATA || '').trim();
    return localAppData && path.isAbsolute(localAppData)
      ? path.join(localAppData, 'Programs', PRODUCT_DIRECTORY_NAME)
      : '';
  }
}

module.exports = { EMBEDDED_INSTALLER_NAME, InstallationManager, PRODUCT_DIRECTORY_NAME };
