const { app, BrowserWindow, dialog, ipcMain, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { spawn } = require('child_process');

let mainWindow = null;
let activeRun = null;
let activeTitleOverridesPath = null;
let activeContentOverridesPath = null;

function desktopPath(...parts) {
  return path.join(app.getPath('desktop'), ...parts);
}

function appResourcePath(...parts) {
  return app.isPackaged
    ? path.join(process.resourcesPath, ...parts)
    : path.join(__dirname, ...parts);
}

function firstExistingPath(...paths) {
  return paths.find((candidate) => candidate && fs.existsSync(candidate)) || paths.find(Boolean) || '';
}

function bundledBundlePath() {
  return firstExistingPath(
    appResourcePath('resources_bundle', 'hu_teacher_resource_bundle_20260602'),
    desktopPath('hu_teacher_resource_bundle_20260602')
  );
}

function bundledPythonPath() {
  return firstExistingPath(
    appResourcePath('vendor', 'python', 'python.exe'),
    'python'
  );
}

function bundledCaCertPath() {
  return firstExistingPath(
    appResourcePath('vendor', 'python', 'Lib', 'site-packages', 'certifi', 'cacert.pem'),
    appResourcePath('vendor', 'python', 'Lib', 'site-packages', 'pip', '_vendor', 'certifi', 'cacert.pem'),
    ''
  );
}

function bundledFfmpegBinDir() {
  return firstExistingPath(
    appResourcePath('vendor', 'ffmpeg', 'bin'),
    ''
  );
}

function bundledNodeDir() {
  return firstExistingPath(
    appResourcePath('vendor', 'nodejs'),
    ''
  );
}

function bundledChromeExecutable() {
  return firstExistingPath(
    appResourcePath('vendor', 'chrome', 'Application', 'chrome.exe'),
    appResourcePath('vendor', 'chrome', 'chrome.exe'),
    ''
  );
}

function bundledFontPath(bundlePath, fileName) {
  return path.join(bundlePath, 'assets', 'template_assets', 'fonts', fileName);
}

function bundledUserAssetPath(...parts) {
  return appResourcePath('resources_bundle', 'user_assets', ...parts);
}

function defaultLogoFile(bundlePath = bundledBundlePath()) {
  return path.join(bundlePath, 'assets', 'template_assets', 'medical_logo_ref_1080.png');
}

function defaultSettings() {
  const bundlePath = bundledBundlePath();
  const defaultTitleFontPath = bundledFontPath(bundlePath, '尔雅新大黑（3500字试用版）.ttf');
  const defaultCaptionFontPath = bundledFontPath(bundlePath, '优设书华体.ttf');
  return {
    pythonPath: bundledPythonPath(),
    bundlePath,
    outputDir: desktopPath('6.5'),
    chanjingBaseUrl: 'https://www.chanjing.cc/api',
    chanjingAppId: '',
    chanjingSecretKey: '',
    chanjingAccountIndex: 1,
    runChanjingAccountIndex: 1,
    chanjingAccounts: [
      { name: '账号1' },
      { name: '账号2' },
      { name: '账号3' }
    ],
    chanjingAssetIndex: 1,
    currentTemplateId: '',
    templateSourceAssetIndex: 1,
    assetSelectionMode: 'random_account',
    runRandomAccountIndexes: '1',
    runRotateAccountIndexes: '1',
    chanjingAssetOverrides: {},
    accountTemplates: {},
    accountAssetTemplates: {},
    modelBaseUrl: '',
    modelApiKey: '',
    modelName: '',
    fontLibrary: [
      { name: '尔雅新大黑', path: defaultTitleFontPath },
      { name: '优设书华体', path: defaultCaptionFontPath }
    ],
    titleFontPath: defaultTitleFontPath,
    titleTopFontPath: defaultTitleFontPath,
    titleMiddleFontPath: defaultTitleFontPath,
    titleBottomFontPath: defaultTitleFontPath,
    titleTopLetterSpacing: 0,
    titleMiddleLetterSpacing: 0,
    titleBottomLetterSpacing: 0,
    titleLineSpacing: 165,
    titleBackgroundEnabled: false,
    titleTopBgEnabled: false,
    titleTopBgColor: '#000000',
    titleTopBgOpacityPercent: 85,
    titleMiddleBgEnabled: false,
    titleMiddleBgColor: '#000000',
    titleMiddleBgOpacityPercent: 85,
    titleBottomBgEnabled: false,
    titleBottomBgColor: '#000000',
    titleBottomBgOpacityPercent: 85,
    titleBgPaddingX: 36,
    titleBgPaddingY: 18,
    titleBgRadius: 12,
    captionFontPath: defaultCaptionFontPath,
    textEffectFontPath: defaultCaptionFontPath,
    disclaimerFontPath: defaultCaptionFontPath,
    bgmFile: path.join(bundlePath, 'assets', 'BGM', 'bgm2.mp3'),
    bgmLibrary: [
      { name: 'bgm2', path: path.join(bundlePath, 'assets', 'BGM', 'bgm2.mp3') }
    ],
    bgmVolumePercent: 22,
    clipPreset: 'title_bgm',
    clipTitle: true,
    clipCaption: true,
    clipBgm: true,
    hideCtaCaptions: false,
    clipTitleMotion: false,
    clipTextEffects: false,
    clipLogo: false,
    textEffectIds: ['kinetic', 'slide-reveal', 'word-bounce', 'spring-up', 'bubble'],
    textEffectKeywordRules: [],
    clipPatent: false,
    clipIntro: false,
    clipPip: false,
    bgmStartMode: 'after_title',
    sfxMode: 'random',
    sfxFolder: path.join(bundlePath, 'assets', 'keyword_sfx'),
    sfxFile: '',
    sfxLibrary: [],
    sfxVolumePercent: 85,
    useSfxFile: false,
    keywordSfxEnabled: true,
    keywordSfxKeywords: '',
    openingVideoFolder: path.join(bundlePath, 'assets', 'template_assets'),
    openingVideoFile: '',
    openingVideoLibrary: [],
    useOpeningVideoFile: false,
    titleMotionPriority: 5,
    pipFolder: path.join(bundlePath, 'assets', 'pip'),
    pipMaterialLibrary: [],
    pipMaterialFile: '',
    usePipMaterialFile: false,
    pipKeywords: '',
    pipRules: [],
    pipPriority: 5,
    pipX: 156,
    pipY: 910,
    pipHeight: 432,
    pipDurationSeconds: 4,
    pipCloseAtSentenceEnd: false,
    patentFile: '',
    patentPriority: 5,
    inheritanceFile: '',
    inheritancePriority: 5,
    textEffectPriority: 5,
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
    captionLetterSpacing: 0,
    captionSingleLine: false,
    captionBufferSeconds: 0.12,
    trimSilenceEnabled: true,
    silenceMinSeconds: 0.18,
    silenceKeepBufferSeconds: 0.04,
    disclaimerColor: '#ffffff',
    disclaimerOutlineColor: '#000000',
    disclaimerOutlineSize: 0,
    disclaimerOpacityPercent: 50,
    logoFolder: path.join(bundlePath, 'assets', 'template_assets'),
    previewTitleX: 80,
    previewTitleY: 980,
    previewTitleW: 920,
    previewTitleH: 500,
    previewCaptionX: 100,
    previewCaptionY: 1385,
    previewCaptionW: 880,
    previewCaptionH: 220,
    previewTextEffectX: 100,
    previewTextEffectY: 1385,
    previewTextEffectW: 880,
    previewTextEffectH: 220,
    previewDisclaimerX: 90,
    previewDisclaimerY: 1735,
    previewDisclaimerW: 900,
    previewDisclaimerH: 150,
    logoFile: defaultLogoFile(bundlePath),
    useLogoFile: true,
    logoOpacityPercent: 100,
    previewLogoX: 90,
    previewLogoY: 88,
    previewLogoW: 180,
    previewLogoH: 180,
    previewVisibleObjects: ['title', 'caption', 'textEffect', 'pip', 'logo', 'disclaimer'],
    maxItems: 0,
    pollIntervalSeconds: 20,
    timeoutMinutes: 45
  };
}

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function bundledDefaultSettingsPath() {
  return appResourcePath('defaults', 'settings.json');
}

function loadBundledDefaultSettings() {
  try {
    const filePath = bundledDefaultSettingsPath();
    if (fs.existsSync(filePath)) {
      const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload.settings && typeof payload.settings === 'object' ? payload.settings : payload)
        : {};
    }
  } catch (error) {
    console.error(error);
  }
  return {};
}

function looksLikeAbsoluteWindowsPath(value) {
  return /^[A-Za-z]:[\\/]/.test(String(value || ''));
}

function pathAfterBundleName(value) {
  const normalized = String(value || '').replace(/\//g, '\\');
  const marker = '\\hu_teacher_resource_bundle_20260602\\';
  const index = normalized.toLowerCase().indexOf(marker.toLowerCase());
  if (index < 0) return '';
  return normalized.slice(index + marker.length);
}

function remapPackagedPath(value, bundlePath = bundledBundlePath()) {
  if (!looksLikeAbsoluteWindowsPath(value)) return value;
  if (fs.existsSync(value)) return value;

  const suffix = pathAfterBundleName(value);
  if (suffix) {
    const candidate = path.join(bundlePath, ...suffix.split(/[\\/]+/).filter(Boolean));
    if (fs.existsSync(candidate)) return candidate;
  }

  const baseName = path.basename(value);
  const candidates = [
    path.join(bundlePath, 'assets', 'template_assets', 'fonts', baseName),
    path.join(bundlePath, 'assets', 'font', baseName),
    path.join(bundlePath, 'assets', 'template_assets', baseName),
    path.join(bundlePath, 'assets', 'BGM', baseName),
    path.join(bundlePath, 'assets', 'keyword_sfx', baseName),
    bundledUserAssetPath(baseName),
    bundledUserAssetPath('audio', baseName),
    bundledUserAssetPath('video', baseName),
    bundledUserAssetPath('image', baseName),
    bundledUserAssetPath('font', baseName)
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || value;
}

function remapSettingsPaths(value, bundlePath = bundledBundlePath()) {
  if (Array.isArray(value)) {
    return value.map((item) => remapSettingsPaths(item, bundlePath));
  }
  if (value && typeof value === 'object') {
    const next = {};
    for (const [key, entry] of Object.entries(value)) {
      if (key === 'bundlePath') {
        next[key] = fs.existsSync(entry) ? entry : bundlePath;
      } else if (key === 'pythonPath') {
        next[key] = fs.existsSync(entry) ? entry : bundledPythonPath();
      } else if (key === 'outputDir') {
        next[key] = entry && fs.existsSync(entry) ? entry : desktopPath('6.5');
      } else {
        next[key] = remapSettingsPaths(entry, bundlePath);
      }
    }
    return next;
  }
  if (typeof value === 'string') {
    return remapPackagedPath(value, bundlePath);
  }
  return value;
}

function normalizeLoadedSettings(saved) {
  const merged = { ...defaultSettings(), ...(saved || {}) };
  const remapped = remapSettingsPaths(merged, bundledBundlePath());
  if (saved?.useSfxFile === undefined && saved?.sfxMode === 'fixed') {
    remapped.useSfxFile = true;
  }
  if (saved?.clipTitleMotion === undefined && saved?.clipPreset === 'title_motion_bgm_effects') {
    remapped.clipTitleMotion = true;
  }
  if (!remapped.logoFile) {
    remapped.logoFile = defaultLogoFile(remapped.bundlePath);
  }
  remapped.clipTitle = true;
  remapped.clipCaption = true;
  remapped.clipBgm = true;
  return remapped;
}

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath())) {
      const saved = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
      return normalizeLoadedSettings(saved);
    }
  } catch (error) {
    console.error(error);
  }
  return normalizeLoadedSettings(loadBundledDefaultSettings());
}

function saveSettings(settings) {
  const normalized = remapSettingsPaths(settings || {}, bundledBundlePath());
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify({
    ...defaultSettings(),
    ...normalized,
    clipTitle: true,
    clipCaption: true,
    clipBgm: true
  }, null, 2), 'utf8');
  return loadSettings();
}

function timestampForFileName() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '_',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('');
}

async function exportSettings(settings) {
  const normalized = saveSettings(settings || loadSettings());
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出配置',
    defaultPath: desktopPath(`医生视频剪辑配置_${timestampForFileName()}.json`),
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return null;
  const payload = {
    meta: {
      kind: 'hu-teacher-desktop-settings',
      name: '医生视频剪辑配置',
      version: 1,
      exportedAt: new Date().toISOString()
    },
    settings: normalized
  };
  fs.writeFileSync(result.filePath, JSON.stringify(payload, null, 2), 'utf8');
  return { filePath: result.filePath, settings: normalized };
}

async function importSettings() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '导入配置',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePaths?.[0]) return null;
  const filePath = result.filePaths[0];
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const imported = payload && typeof payload === 'object' && payload.settings && typeof payload.settings === 'object'
    ? payload.settings
    : payload;
  if (!imported || typeof imported !== 'object' || Array.isArray(imported)) {
    throw new Error('配置文件格式不正确');
  }
  const next = saveSettings(imported);
  return { filePath, settings: next };
}

function createWindow() {
  const { width: workWidth, height: workHeight } = screen.getPrimaryDisplay().workAreaSize;
  const windowWidth = Math.min(1360, Math.max(960, workWidth - 64));
  const windowHeight = Math.min(920, Math.max(640, workHeight - 64));
  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: '#f4f5f7',
    title: '医生视频剪辑',
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
ipcMain.handle('settings:export', (_event, settings) => exportSettings(settings));
ipcMain.handle('settings:import', () => importSettings());

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

function stableJobName(inputPath) {
  const stem = path.basename(inputPath, path.extname(inputPath))
    .replace(/[^A-Za-z0-9_.-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'job';
  const pathHash = crypto.createHash('sha1').update(path.resolve(inputPath), 'utf8').digest('hex').slice(0, 10);
  return `desktop_${stem}_${pathHash}`;
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function jsonSummary(data) {
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
}

function normalizeBodyPunctuation(text) {
  return String(text || '')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, '')
    .replace(/,/g, '，')
    .replace(/\?/g, '？')
    .replace(/!/g, '！')
    .replace(/;/g, '；')
    .replace(/:/g, '：')
    .replace(/\(/g, '（')
    .replace(/\)/g, '）')
    .replace(/\.{3,}/g, '……')
    .replace(/([^0-9])\.([^0-9]|$)/g, '$1。$2')
    .replace(/\n+/g, '');
}

function stripBoundaryPunctuation(text) {
  return String(text || '')
    .replace(/^[\s，。！？；：、,.!?;:（）()]+|[\s，。！？；：、,.!?;:（）()]+$/g, '')
    .trim();
}

function titleCharLength(text) {
  return Array.from(stripBoundaryPunctuation(text).replace(/[，。！？；：、,.!?;:（）()\s]/g, '')).length;
}

function titleLinesFromCandidate(text) {
  const normalized = normalizeBodyPunctuation(text);
  const parts = normalized
    .split(/[，。！？；：、,.!?;:]+/)
    .map(stripBoundaryPunctuation)
    .filter(Boolean);
  if (parts.length >= 2 && parts.slice(0, 3).every((line) => titleCharLength(line) <= 16)) {
    return parts.slice(0, 3);
  }
  const oneLine = stripBoundaryPunctuation(normalized);
  return oneLine ? [oneLine] : [];
}

function sentenceCandidates(text) {
  const normalized = normalizeBodyPunctuation(text);
  const matches = normalized.match(/[^。！？；]+[。！？；]?/g) || [];
  return matches.map(stripBoundaryPunctuation).filter(Boolean);
}

function derivedTitleLines(contentLines, content) {
  const lineCandidates = contentLines.map(stripBoundaryPunctuation).filter(Boolean);
  const candidates = lineCandidates.length >= 3 ? lineCandidates : sentenceCandidates(content);
  return candidates.slice(0, 3).map(stripBoundaryPunctuation).filter(Boolean);
}

function splitCustomTextGroups(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .split(/\n\s*\n+/)
    .map((group) => group.trim())
    .filter(Boolean)
    .map((group) => group.split(/\n+/).map((line) => line.trim()).filter(Boolean))
    .filter((lines) => lines.length);
}

function buildCustomItemsFromGroups(groups, decisions) {
  if (!Array.isArray(decisions) || decisions.length !== groups.length) {
    throw new Error(`模型返回条数不一致：需要 ${groups.length} 条，实际 ${Array.isArray(decisions) ? decisions.length : 0} 条`);
  }
  return groups.map((lines, groupIndex) => {
    const decision = decisions[groupIndex] || {};
    const rawIndexes = Array.isArray(decision.contentLineIndexes)
      ? decision.contentLineIndexes
      : (Array.isArray(decision.content_line_indexes) ? decision.content_line_indexes : []);
    const indexes = rawIndexes
      .map((value) => Number(value))
      .filter((value, pos, arr) => Number.isInteger(value) && value >= 1 && value <= lines.length && arr.indexOf(value) === pos);
    if (!indexes.length) {
      throw new Error(`第 ${groupIndex + 1} 组模型没有返回正文行`);
    }
    const rawTitle = decision.title ?? decision.titleLines ?? decision.title_lines ?? '';
    const titleLines = Array.isArray(rawTitle)
      ? rawTitle.map(stripBoundaryPunctuation).filter(Boolean).slice(0, 3)
      : titleLinesFromCandidate(rawTitle || '');
    const contentLines = indexes.map((lineIndex) => lines[lineIndex - 1]);
    const content = normalizeBodyPunctuation(contentLines.join(''));
    const finalTitleLines = titleLines.length ? titleLines : derivedTitleLines(contentLines, content);
    const code = String(groupIndex + 1).padStart(3, '0');
    return {
      id: groupIndex + 1,
      code,
      title: finalTitleLines.slice(0, 3),
      title_text: finalTitleLines.slice(0, 3).join('\n'),
      topic: finalTitleLines[0] || `自定义文案${groupIndex + 1}`,
      content
    };
  }).filter((item) => item.content);
}

function parseCustomTextItems(text) {
  return splitCustomTextGroups(text).map((lines, groupIndex) => {
    const firstLine = lines[0] || '';
    const firstLineIsTitle = lines.length > 1 && titleCharLength(firstLine) > 0 && titleCharLength(firstLine) <= 24;
    const titleLines = firstLineIsTitle ? titleLinesFromCandidate(firstLine) : [];
    const contentLines = firstLineIsTitle ? lines.slice(1) : lines;
    const content = normalizeBodyPunctuation(contentLines.join(''));
    const finalTitleLines = titleLines.length ? titleLines : derivedTitleLines(contentLines, content);
    const code = String(groupIndex + 1).padStart(3, '0');
    return {
      id: groupIndex + 1,
      code,
      title: finalTitleLines.slice(0, 3),
      title_text: finalTitleLines.slice(0, 3).join('\n'),
      topic: finalTitleLines[0] || `自定义文案${groupIndex + 1}`,
      content
    };
  }).filter((item) => item.content);
}

function extractJsonFromModel(text) {
  let value = String(text || '').trim();
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) value = fenced[1].trim();
  try {
    return JSON.parse(value);
  } catch (_error) {
    const objectStart = value.indexOf('{');
    const arrayStart = value.indexOf('[');
    const starts = [objectStart, arrayStart].filter((pos) => pos >= 0);
    if (!starts.length) throw _error;
    const start = Math.min(...starts);
    const end = Math.max(value.lastIndexOf('}'), value.lastIndexOf(']'));
    if (end <= start) throw _error;
    return JSON.parse(value.slice(start, end + 1));
  }
}

async function chatCompletion(settings, messages) {
  const baseUrl = String(settings?.modelBaseUrl || '').trim().replace(/\/+$/, '');
  const apiKey = String(settings?.modelApiKey || '').trim();
  const model = String(settings?.modelName || '').trim();
  if (!baseUrl || !apiKey || !model) {
    throw new Error('请先在设置里填写模型接口 URL、API Key 和模型名');
  }
  const url = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0
      })
    });
    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`模型接口失败 ${response.status}：${raw.slice(0, 500)}`);
    }
    const payload = JSON.parse(raw);
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error(`模型接口返回格式异常：${raw.slice(0, 500)}`);
    }
    return content;
  } finally {
    clearTimeout(timeout);
  }
}

async function modelCustomTextItems(text, settings) {
  const groups = splitCustomTextGroups(text);
  if (!groups.length) return [];
  const numberedGroups = groups.map((lines, groupIndex) => ({
    group: groupIndex + 1,
    lines: lines.map((line, lineIndex) => ({ line: lineIndex + 1, text: line }))
  }));
  const content = await chatCompletion(settings, [
    {
      role: 'system',
      content: [
        '你是中文短视频口播文案整理助手，只输出合法 JSON。',
        '你负责判断每个空行分组里的标题和正文行，但不要改写正文。',
        '标题可以整理为 1-3 行；没有标题时，从正文前三句或前三行整理三行标题。',
        '标题必须使用原文已有信息，不新增事实，不夸大医疗承诺。'
      ].join('\n')
    },
    {
      role: 'user',
      content: JSON.stringify({
        task: '按空行分组整理口播文案',
        rules: [
          '每组第一行如果比较短、像标题，就把它作为标题来源，后面行作为正文',
          '如果第一行不是标题，整组都作为正文',
          '正文只允许由 contentLineIndexes 指定原始行，程序会只改标点；你不要输出改写后的正文',
          '没有标题时，由正文前三句或前三行整理成三行标题',
          '返回 items 数量必须等于输入 groups 数量，顺序不能变'
        ],
        output_schema: {
          items: [
            {
              group: 1,
              title: ['第一行标题', '第二行标题', '第三行标题'],
              contentLineIndexes: [2, 3]
            }
          ]
        },
        groups: numberedGroups
      }, null, 2)
    }
  ]);
  const parsed = extractJsonFromModel(content);
  const decisions = Array.isArray(parsed) ? parsed : parsed.items;
  return buildCustomItemsFromGroups(groups, decisions);
}

function chanjingAssetsPath(bundlePath) {
  return path.join(bundlePath, 'openapi', 'hu_teacher_api_assets.json');
}

function normalizeAssetOverrides(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function loadChanjingAssets(bundlePath, overrides = {}) {
  const filePath = chanjingAssetsPath(bundlePath || defaultSettings().bundlePath);
  if (!fs.existsSync(filePath)) return [];
  const raw = readJsonFile(filePath);
  if (!Array.isArray(raw)) return [];
  const assetOverrides = normalizeAssetOverrides(overrides);
  return raw.map((asset, index) => ({
    ...asset,
    index: index + 1,
    label: String(assetOverrides[index + 1]?.name || `资产${index + 1}`).trim() || `资产${index + 1}`,
    enabled: assetOverrides[index + 1]?.enabled !== false,
    detailLabel: asset.name || asset.file || asset.person_id || ''
  }));
}

function selectedTemplateAssetIndex(settings = {}) {
  const templates = settings.accountTemplates;
  if (!templates || typeof templates !== 'object' || Array.isArray(templates)) {
    return 0;
  }
  const accountIndex = Math.max(1, Number(settings.chanjingAccountIndex || settings.runChanjingAccountIndex || 1));
  const list = templates[String(accountIndex)] || templates[accountIndex] || [];
  if (!Array.isArray(list) || !list.length) return 0;
  const currentId = String(settings.currentTemplateId || '').trim();
  const selected = list.find((template) => (
    template
    && template.enabled !== false
    && String(template.id || '') === currentId
  )) || list.find((template) => template && template.enabled !== false);
  return Number(selected?.assetIndex || selected?.chanjingAssetIndex || selected?.asset || 0);
}

function selectedChanjingAsset(settings = {}) {
  const assets = loadChanjingAssets(settings.bundlePath || defaultSettings().bundlePath, settings.chanjingAssetOverrides);
  const index = selectedTemplateAssetIndex(settings) || Number(settings.chanjingAssetIndex || 0);
  if (!index || index < 1 || index > assets.length) return null;
  const asset = assets[index - 1];
  return asset?.enabled === false ? null : asset;
}

function findAssetPreviewInState(statePath) {
  if (!statePath || !fs.existsSync(statePath)) return null;
  try {
    const state = readJsonFile(statePath);
    const items = state && typeof state === 'object' ? state.items : null;
    if (!items || typeof items !== 'object') return null;
    for (const entry of Object.values(items)) {
      const asset = entry && typeof entry === 'object' ? entry.asset : null;
      if (asset?.pic_url) return { kind: 'image', url: asset.pic_url, source: statePath };
      if (asset?.preview_url) return { kind: 'video', url: asset.preview_url, source: statePath };
    }
  } catch (error) {
    console.warn('preview background state failed', error);
  }
  return null;
}

function latestMatchingFile(dirPath, matcher) {
  if (!fs.existsSync(dirPath)) return null;
  const files = fs.readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && matcher(entry.name))
    .map((entry) => {
      const filePath = path.join(dirPath, entry.name);
      const stat = fs.statSync(filePath);
      return { filePath, mtimeMs: stat.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files[0]?.filePath || null;
}

function findPreviewBackground(payload = {}) {
  const bundlePath = payload.settings?.bundlePath || defaultSettings().bundlePath;
  const selectedAsset = selectedChanjingAsset(payload.settings || {});
  if (selectedAsset?.pic_url) {
    return { kind: 'image', url: selectedAsset.pic_url, source: selectedAsset.label || selectedAsset.name || '' };
  }
  if (selectedAsset?.preview_url) {
    return { kind: 'video', url: selectedAsset.preview_url, source: selectedAsset.label || selectedAsset.name || '' };
  }

  const workDir = path.join(bundlePath, 'work');
  const inputPath = payload.inputJsonPath;
  if (inputPath) {
    const currentState = path.join(workDir, `${stableJobName(inputPath)}_state.json`);
    const fromCurrentState = findAssetPreviewInState(currentState);
    if (fromCurrentState) return fromCurrentState;
  }

  const latestState = latestMatchingFile(workDir, (name) => name.endsWith('_state.json'));
  const fromLatestState = findAssetPreviewInState(latestState);
  if (fromLatestState) return fromLatestState;

  const latestRaw = latestMatchingFile(path.join(workDir, 'generated'), (name) => name.endsWith('_raw.mp4'));
  if (latestRaw) {
    return { kind: 'video', url: pathToFileURL(latestRaw).href, source: latestRaw };
  }
  return null;
}

ipcMain.handle('dialog:file', async (_event, options = {}) => {
  const properties = ['openFile'];
  if (options.multiSelections) properties.push('multiSelections');
  const result = await dialog.showOpenDialog(mainWindow, {
    properties,
    filters: options.filters || [{ name: 'All files', extensions: ['*'] }]
  });
  if (result.canceled) return null;
  return options.multiSelections ? result.filePaths : result.filePaths[0];
});

ipcMain.handle('dialog:directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('json:summary', async (_event, filePath) => {
  return jsonSummary(readJsonFile(filePath));
});

ipcMain.handle('customText:save', async (_event, payload = {}) => {
  const text = String(payload.text || '').trim();
  if (!text) {
    throw new Error('请先粘贴文案');
  }
  const items = await modelCustomTextItems(text, payload.settings || {});
  if (!items.length) {
    throw new Error('没有识别到可用正文');
  }
  const createdAt = new Date().toISOString();
  const data = {
    meta: {
      name: String(payload.name || '自定义文案').trim() || '自定义文案',
      source: 'custom_text',
      count: items.length,
      created_at: createdAt,
      notes: [
        '空行分组导入',
        '首行较短时作为标题',
        '正文仅做标点规范',
        '无标题时用正文前三句或前三行生成三段标题'
      ]
    },
    items
  };
  const dir = path.join(app.getPath('userData'), 'custom_text_jobs');
  fs.mkdirSync(dir, { recursive: true });
  const fileName = `custom_text_${createdAt.replace(/[-:.TZ]/g, '').slice(0, 14)}.json`;
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return {
    filePath,
    summary: jsonSummary(data)
  };
});

ipcMain.handle('chanjing:assets', (_event, settings = {}) => {
  return loadChanjingAssets(settings.bundlePath || defaultSettings().bundlePath, settings.chanjingAssetOverrides);
});

ipcMain.handle('preview:background', (_event, payload) => findPreviewBackground(payload));

ipcMain.handle('path:open', async (_event, targetPath) => {
  if (!targetPath) return false;
  await shell.openPath(targetPath);
  return true;
});

function runtimePythonPath(settings = {}) {
  const configured = settings.pythonPath;
  if (configured && fs.existsSync(configured)) return configured;
  return bundledPythonPath();
}

function runtimeEnvironment() {
  const extraPath = [];
  const python = bundledPythonPath();
  if (python && fs.existsSync(python)) {
    extraPath.push(path.dirname(python), path.join(path.dirname(python), 'Scripts'));
  }
  const ffmpegBin = bundledFfmpegBinDir();
  if (ffmpegBin && fs.existsSync(ffmpegBin)) {
    extraPath.push(ffmpegBin);
  }
  const nodeDir = bundledNodeDir();
  if (nodeDir && fs.existsSync(nodeDir)) {
    extraPath.push(nodeDir);
  }
  const chrome = bundledChromeExecutable();
  const caCert = bundledCaCertPath();
  const env = {
    ...process.env,
    PATH: [...extraPath, process.env.PATH || ''].filter(Boolean).join(path.delimiter),
    PYTHONIOENCODING: 'utf-8',
    PYTHONUTF8: '1',
    CHROME_EXECUTABLE: chrome || process.env.CHROME_EXECUTABLE || '',
    CHROME_PATH: chrome || process.env.CHROME_PATH || ''
  };
  if (caCert && fs.existsSync(caCert)) {
    env.SSL_CERT_FILE = caCert;
    env.REQUESTS_CA_BUNDLE = caCert;
    env.CURL_CA_BUNDLE = caCert;
    env.NODE_EXTRA_CA_CERTS = caCert;
  }
  return env;
}

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
  const runtimeSettings = normalizeLoadedSettings(payload?.settings || {});
  const jobPayload = {
    ...payload,
    settings: runtimeSettings,
    titleOverridesPath,
    contentOverridesPath,
    forceFreshChanjing: false
  };
  fs.writeFileSync(jobPath, JSON.stringify(jobPayload, null, 2), 'utf8');

  const scriptPath = path.join(__dirname, 'python', 'desktop_pipeline.py');
  const pythonPath = runtimePythonPath(runtimeSettings);
  const child = spawn(pythonPath, ['-u', scriptPath, '--job', jobPath], {
    cwd: __dirname,
    windowsHide: true,
    env: runtimeEnvironment()
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
