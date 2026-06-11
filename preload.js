const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('huApp', {
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  exportSettings: (settings) => ipcRenderer.invoke('settings:export', settings),
  importSettings: () => ipcRenderer.invoke('settings:import'),
  chooseFile: (options) => ipcRenderer.invoke('dialog:file', options),
  chooseDirectory: () => ipcRenderer.invoke('dialog:directory'),
  readJsonSummary: (filePath) => ipcRenderer.invoke('json:summary', filePath),
  saveCustomText: (payload) => ipcRenderer.invoke('customText:save', payload),
  listChanjingAssets: (settings) => ipcRenderer.invoke('chanjing:assets', settings),
  getPreviewBackground: (payload) => ipcRenderer.invoke('preview:background', payload),
  openPath: (targetPath) => ipcRenderer.invoke('path:open', targetPath),
  startRun: (payload) => ipcRenderer.invoke('run:start', payload),
  updateTitleOverrides: (titleOverrides) => ipcRenderer.invoke('run:updateTitleOverrides', titleOverrides),
  updateContentOverrides: (contentOverrides) => ipcRenderer.invoke('run:updateContentOverrides', contentOverrides),
  cancelRun: () => ipcRenderer.invoke('run:cancel'),
  onLog: (callback) => ipcRenderer.on('run:log', (_event, data) => callback(data)),
  onDone: (callback) => ipcRenderer.on('run:done', (_event, data) => callback(data))
});
