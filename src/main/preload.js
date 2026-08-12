'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopBridge', {
  isDesktop: true,
  windowAction: (type) => ipcRenderer.invoke('window:action', { type }),
  onStatusUpdate: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('status-update', listener);
    return () => ipcRenderer.removeListener('status-update', listener);
  },
  onDesktopState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('desktop-state', listener);
    return () => ipcRenderer.removeListener('desktop-state', listener);
  }
});
