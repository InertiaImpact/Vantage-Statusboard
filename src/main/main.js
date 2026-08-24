'use strict';

const path = require('node:path');
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const { InstallationManager } = require('./installation-manager');
const { SettingsRepository } = require('./settings-repository');
const { ThemeRepository } = require('./theme-repository');
const { StatusPoller } = require('./status-poller');
const { WebServer } = require('./web-server');

let mainWindow;
let settingsRepository;
let themeRepository;
let poller;
let webServer;
let installationManager;
let installationStarting = false;

const UI_SCALE_MIN = 80;
const UI_SCALE_MAX = 130;

function normalizedUiScale(value) {
  const percent = Number.parseInt(value, 10);
  return Number.isFinite(percent) ? Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, percent)) : 100;
}

function applyUiScale(percent) {
  if (!mainWindow || mainWindow.isDestroyed()) return 100;
  const normalized = normalizedUiScale(percent);
  const factor = normalized / 100;
  mainWindow.setMinimumSize(Math.round(940 * factor), Math.round(620 * factor));
  mainWindow.webContents.setZoomFactor(factor);
  return normalized;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

function applyAutostart(enabled) {
  if (process.platform !== 'win32' || !app.isPackaged) return;
  const executablePath = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: executablePath,
    args: ['--autostart']
  });
}

function installationStatus() {
  return installationManager?.getStatus() || {
    available: false,
    installed: false,
    portable: false,
    packaged: false,
    version: app.getVersion(),
    installDirectory: ''
  };
}

function startInstallation(trigger) {
  const currentStatus = installationStatus();
  if (currentStatus.installed) return { ...currentStatus, started: false, trigger };
  if (installationStarting) return { ...currentStatus, started: true, trigger };
  installationStarting = true;
  try {
    applyAutostart(false);
    const result = installationManager.startInstallation();
    const payload = { ...result, trigger };
    mainWindow?.webContents.send('installation-state', payload);
    if (result.started) setTimeout(() => app.quit(), 500);
    return payload;
  } catch (error) {
    installationStarting = false;
    mainWindow?.webContents.send('installation-state', { ...installationStatus(), error: error.message, trigger });
    throw error;
  }
}

function applyWindowState(settings) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setAlwaysOnTop(settings.desktop.alwaysOnTop, 'floating');
  mainWindow.setResizable(!settings.desktop.resizeLocked);
  mainWindow.setMovable(!settings.desktop.resizeLocked);
  applyUiScale(settings.dashboard.uiScalePercent);
  mainWindow.webContents.send('desktop-state', {
    alwaysOnTop: settings.desktop.alwaysOnTop,
    resizeLocked: settings.desktop.resizeLocked
  });
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.moveTop();
  mainWindow.focus();
}

async function handleWindowAction(action) {
  if (!mainWindow || mainWindow.isDestroyed()) return { available: false };
  const current = settingsRepository.get();
  if (action.type === 'toggle-pin') {
    current.desktop.alwaysOnTop = !current.desktop.alwaysOnTop;
  } else if (action.type === 'toggle-lock') {
    current.desktop.resizeLocked = !current.desktop.resizeLocked;
  } else if (action.type === 'minimize') {
    mainWindow.minimize();
    return { available: true, alwaysOnTop: current.desktop.alwaysOnTop, resizeLocked: current.desktop.resizeLocked };
  } else if (action.type === 'close') {
    mainWindow.close();
    return { available: true, alwaysOnTop: current.desktop.alwaysOnTop, resizeLocked: current.desktop.resizeLocked };
  } else {
    throw new Error('Unknown window action.');
  }
  settingsRepository.save(current);
  applyWindowState(current);
  return {
    available: true,
    alwaysOnTop: current.desktop.alwaysOnTop,
    resizeLocked: current.desktop.resizeLocked
  };
}

async function handleSettingsSaved() {
  const settings = settingsRepository.get();
  if (settings.desktop.autostart && installationStatus().portable) {
    try {
      startInstallation('autostart');
    } catch (error) {
      dialog.showErrorBox('Unable to install Vantage Statusboard', error.message);
    }
    return;
  }
  applyAutostart(settings.desktop.autostart);
  applyWindowState(settings);
  poller.start();

  const priorPort = webServer.address?.port;
  const priorHost = webServer.address?.host;
  const desiredHost = settings.dashboard.exposeToLan ? '0.0.0.0' : '127.0.0.1';
  if (priorPort !== settings.dashboard.webPort || priorHost !== desiredHost) {
    await webServer.restart();
    await mainWindow.loadURL(webServer.address.url);
  }
}

function createWindow() {
  const settings = settingsRepository.get();
  const bounds = settings.desktop.bounds || { width: 1440, height: 900 };
  const scaleFactor = normalizedUiScale(settings.dashboard.uiScalePercent) / 100;
  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: Math.round(940 * scaleFactor),
    minHeight: Math.round(620 * scaleFactor),
    frame: false,
    backgroundColor: '#121212',
    show: true,
    title: 'Vantage Statusboard',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.once('ready-to-show', showMainWindow);
  mainWindow.webContents.once('did-finish-load', showMainWindow);
  void mainWindow.loadURL(webServer.address.url)
    .then(showMainWindow)
    .catch((error) => {
      showMainWindow();
      dialog.showErrorBox('Unable to load Vantage Statusboard', error.message);
    });
  mainWindow.on('close', () => {
    if (!mainWindow.isMaximized() && !mainWindow.isMinimized()) {
      settingsRepository.updateDesktop({ bounds: mainWindow.getBounds() });
    }
  });
  mainWindow.on('will-move', (event) => {
    if (settingsRepository.get().desktop.resizeLocked) event.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  applyWindowState(settings);
}

async function initialize() {
  installationManager = new InstallationManager(app);
  settingsRepository = new SettingsRepository(app.getPath('userData'));
  themeRepository = new ThemeRepository(app.getPath('userData'));
  poller = new StatusPoller(settingsRepository);
  webServer = new WebServer({
    rendererDirectory: path.join(__dirname, '..', 'renderer'),
    settingsRepository,
    themeRepository,
    poller,
    onSettingsSaved: handleSettingsSaved
  });

  try {
    await webServer.start();
  } catch (error) {
    dialog.showErrorBox('Unable to start Vantage Statusboard', `${error.message}\n\nChange the dashboard web port in the saved settings or close the application using that port.`);
    app.quit();
    return;
  }

  ipcMain.handle('window:action', (_event, action) => handleWindowAction(action));
  ipcMain.handle('ui:preview-scale', (_event, payload) => applyUiScale(payload?.percent));
  ipcMain.handle('installation:status', () => installationStatus());
  ipcMain.handle('installation:install', () => startInstallation('manual'));
  createWindow();
  const autostart = settingsRepository.get().desktop.autostart;
  if (autostart && installationStatus().portable) {
    setTimeout(() => {
      try {
        startInstallation('autostart');
      } catch (error) {
        dialog.showErrorBox('Unable to install Vantage Statusboard', error.message);
      }
    }, 1000);
  } else {
    applyAutostart(autostart);
  }
  poller.start();
  poller.on('status', (status) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('status-update', status);
  });
}

if (gotLock) {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    showMainWindow();
  });

  app.whenReady().then(initialize);
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => {
    poller?.stop();
    void webServer?.stop();
  });
}
