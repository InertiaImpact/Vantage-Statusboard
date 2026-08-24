'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopBridge', {
  isDesktop: true,
  windowAction: (type) => ipcRenderer.invoke('window:action', { type }),
  previewUiScale: (percent) => ipcRenderer.invoke('ui:preview-scale', { percent }),
  getInstallationStatus: () => ipcRenderer.invoke('installation:status'),
  installApplication: () => ipcRenderer.invoke('installation:install'),
  onStatusUpdate: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('status-update', listener);
    return () => ipcRenderer.removeListener('status-update', listener);
  },
  onDesktopState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('desktop-state', listener);
    return () => ipcRenderer.removeListener('desktop-state', listener);
  },
  onInstallationState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('installation-state', listener);
    return () => ipcRenderer.removeListener('installation-state', listener);
  }
});
