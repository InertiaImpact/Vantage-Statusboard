'use strict';

const path = require('node:path');
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const { SettingsRepository } = require('./settings-repository');
const { ThemeRepository } = require('./theme-repository');
const { StatusPoller } = require('./status-poller');
const { WebServer } = require('./web-server');

let mainWindow;
let settingsRepository;
let themeRepository;
let poller;
let webServer;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

function applyAutostart(enabled) {
  if (process.platform !== 'win32') return;
  const executablePath = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: executablePath,
    args: app.isPackaged ? ['--autostart'] : [app.getAppPath(), '--autostart']
  });
}

function applyWindowState(settings) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setAlwaysOnTop(settings.desktop.alwaysOnTop, 'floating');
  mainWindow.setResizable(!settings.desktop.resizeLocked);
  mainWindow.setMovable(!settings.desktop.resizeLocked);
  mainWindow.webContents.send('desktop-state', {
    alwaysOnTop: settings.desktop.alwaysOnTop,
    resizeLocked: settings.desktop.resizeLocked
  });
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
  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 940,
    minHeight: 620,
    frame: false,
    backgroundColor: '#121212',
    show: false,
    title: 'Vantage Statusboard',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadURL(webServer.address.url);
  mainWindow.once('ready-to-show', () => mainWindow.show());
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
  createWindow();
  applyAutostart(settingsRepository.get().desktop.autostart);
  poller.start();
  poller.on('status', (status) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('status-update', status);
  });
}

if (gotLock) {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(initialize);
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => {
    poller?.stop();
    void webServer?.stop();
  });
}
