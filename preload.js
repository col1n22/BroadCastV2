const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('huApp', {
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  chooseFile: (options) => ipcRenderer.invoke('dialog:file', options),
  chooseDirectory: () => ipcRenderer.invoke('dialog:directory'),
  readJsonSummary: (filePath) => ipcRenderer.invoke('json:summary', filePath),
  openPath: (targetPath) => ipcRenderer.invoke('path:open', targetPath),
  startRun: (payload) => ipcRenderer.invoke('run:start', payload),
  updateTitleOverrides: (titleOverrides) => ipcRenderer.invoke('run:updateTitleOverrides', titleOverrides),
  updateContentOverrides: (contentOverrides) => ipcRenderer.invoke('run:updateContentOverrides', contentOverrides),
  cancelRun: () => ipcRenderer.invoke('run:cancel'),
  onLog: (callback) => ipcRenderer.on('run:log', (_event, data) => callback(data)),
  onDone: (callback) => ipcRenderer.on('run:done', (_event, data) => callback(data))
});
