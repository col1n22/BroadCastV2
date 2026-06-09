const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let mainWindow = null;
let activeRun = null;
let activeTitleOverridesPath = null;
let activeContentOverridesPath = null;

function desktopPath(...parts) {
  return path.join(app.getPath('desktop'), ...parts);
}

function defaultSettings() {
  const bundlePath = desktopPath('hu_teacher_resource_bundle_20260602');
  return {
    pythonPath: 'python',
    bundlePath,
    outputDir: desktopPath('6.5'),
    chanjingBaseUrl: 'https://www.chanjing.cc/api',
    chanjingAppId: '',
    chanjingSecretKey: '',
    modelBaseUrl: '',
    modelApiKey: '',
    modelName: '',
    titleFontPath: desktopPath('字体2', '尔雅新大黑（3500字试用版）.ttf'),
    captionFontPath: desktopPath('字体2', '优设书华体.ttf'),
    bgmFile: path.join(bundlePath, 'assets', 'BGM', 'bgm2.mp3'),
    titleTopColor: '#ffffff',
    titleTopOutlineColor: '#000000',
    titleTopOutlineSize: 8,
    titleMiddleColor: '#ffde00',
    titleMiddleOutlineColor: '#000000',
    titleMiddleOutlineSize: 8,
    titleBottomColor: '#ff2a00',
    titleBottomOutlineColor: '#ffffff',
    titleBottomOutlineSize: 8,
    captionColor: '#ffffff',
    captionOutlineColor: '#000000',
    captionOutlineSize: 8,
    disclaimerColor: '#ffffff',
    disclaimerOutlineColor: '#000000',
    disclaimerOutlineSize: 0,
    disclaimerOpacityPercent: 50,
    maxItems: 0,
    pollIntervalSeconds: 20,
    timeoutMinutes: 45
  };
}

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath())) {
      return { ...defaultSettings(), ...JSON.parse(fs.readFileSync(settingsPath(), 'utf8')) };
    }
  } catch (error) {
    console.error(error);
  }
  return defaultSettings();
}

function saveSettings(settings) {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify({ ...defaultSettings(), ...settings }, null, 2), 'utf8');
  return loadSettings();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: '#f4f5f7',
    title: '胡老师视频剪辑',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle('settings:load', () => loadSettings());
ipcMain.handle('settings:save', (_event, settings) => saveSettings(settings));

function safeSlug(item, index) {
  const raw = String(item.code || item.id || String(index).padStart(3, '0'));
  return raw.replace(/[^A-Za-z0-9_.-]+/g, '_').replace(/^_+|_+$/g, '') || String(index).padStart(3, '0');
}

function normalizeTitleLines(item) {
  const title = item.edited_title || item.title_override || item.title;
  if (Array.isArray(title)) {
    return title.map((line) => String(line).trim()).filter(Boolean).slice(0, 3);
  }
  if (typeof title === 'string' && title.trim()) {
    return title.split(/\r?\n+/).map((line) => line.trim()).filter(Boolean).slice(0, 3);
  }
  if (item.title_text) {
    return String(item.title_text).split(/\r?\n+/).map((line) => line.trim()).filter(Boolean).slice(0, 3);
  }
  return [];
}

ipcMain.handle('dialog:file', async (_event, options = {}) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: options.filters || [{ name: 'All files', extensions: ['*'] }]
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('dialog:directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('json:summary', async (_event, filePath) => {
  const raw = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw);
  const items = Array.isArray(data.items) ? data.items : [];
  return {
    meta: data.meta || {},
    count: items.length,
    items: items.map((item, index) => {
      const titleLines = normalizeTitleLines(item);
      return {
        index: index + 1,
        slug: safeSlug(item, index + 1),
        id: item.id ?? '',
        code: item.code ?? '',
        topic: item.topic ?? '',
        content: String(item.content || item.text || ''),
        titleLines,
        title: titleLines.join(' / '),
        chars: String(item.content || item.text || '').length
      };
    })
  };
});

ipcMain.handle('path:open', async (_event, targetPath) => {
  if (!targetPath) return false;
  await shell.openPath(targetPath);
  return true;
});

ipcMain.handle('run:start', async (_event, payload) => {
  if (activeRun) {
    throw new Error('已有任务正在运行');
  }
  const userData = app.getPath('userData');
  const jobsDir = path.join(userData, 'jobs');
  fs.mkdirSync(jobsDir, { recursive: true });
  const jobId = Date.now();
  const jobPath = path.join(jobsDir, `job_${jobId}.json`);
  const titleOverridesPath = path.join(jobsDir, `job_${jobId}_titles.json`);
  const contentOverridesPath = path.join(jobsDir, `job_${jobId}_contents.json`);
  fs.writeFileSync(titleOverridesPath, JSON.stringify(payload?.titleOverrides || {}, null, 2), 'utf8');
  fs.writeFileSync(contentOverridesPath, JSON.stringify(payload?.contentOverrides || {}, null, 2), 'utf8');
  const jobPayload = { ...payload, titleOverridesPath, contentOverridesPath, forceFreshChanjing: true };
  fs.writeFileSync(jobPath, JSON.stringify(jobPayload, null, 2), 'utf8');

  const scriptPath = path.join(__dirname, 'python', 'desktop_pipeline.py');
  const pythonPath = payload?.settings?.pythonPath || 'python';
  const child = spawn(pythonPath, ['-u', scriptPath, '--job', jobPath], {
    cwd: __dirname,
    windowsHide: true,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
  });
  activeRun = child;
  activeTitleOverridesPath = titleOverridesPath;
  activeContentOverridesPath = contentOverridesPath;

  const send = (channel, data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, data);
    }
  };

  child.stdout.on('data', (data) => send('run:log', { stream: 'stdout', text: data.toString('utf8') }));
  child.stderr.on('data', (data) => send('run:log', { stream: 'stderr', text: data.toString('utf8') }));
  child.on('error', (error) => {
    activeRun = null;
    activeTitleOverridesPath = null;
    activeContentOverridesPath = null;
    send('run:done', { code: -1, error: error.message });
  });
  child.on('close', (code) => {
    activeRun = null;
    activeTitleOverridesPath = null;
    activeContentOverridesPath = null;
    send('run:done', { code });
  });
  return { started: true, pid: child.pid, jobPath };
});

ipcMain.handle('run:updateTitleOverrides', async (_event, titleOverrides) => {
  if (!activeRun || !activeTitleOverridesPath) return false;
  fs.writeFileSync(activeTitleOverridesPath, JSON.stringify(titleOverrides || {}, null, 2), 'utf8');
  return true;
});

ipcMain.handle('run:updateContentOverrides', async (_event, contentOverrides) => {
  if (!activeRun || !activeContentOverridesPath) return false;
  fs.writeFileSync(activeContentOverridesPath, JSON.stringify(contentOverrides || {}, null, 2), 'utf8');
  return true;
});

ipcMain.handle('run:cancel', async () => {
  if (!activeRun) return false;
  activeRun.kill();
  activeRun = null;
  activeTitleOverridesPath = null;
  activeContentOverridesPath = null;
  return true;
});
