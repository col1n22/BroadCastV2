const fields = [
  'pythonPath',
  'bundlePath',
  'outputDir',
  'chanjingBaseUrl',
  'chanjingAppId',
  'chanjingSecretKey',
  'chanjingAccountIndex',
  'runChanjingAccountIndex',
  'runRandomAccountIndexes',
  'runRotateAccountIndexes',
  'runFixedAccountIndex',
  'runFixedTemplateId',
  'chanjingAssetIndex',
  'currentTemplateId',
  'templateSourceAssetIndex',
  'assetSelectionMode',
  'modelBaseUrl',
  'modelApiKey',
  'modelName',
  'sensitiveReplacementRules',
  'fontLibrary',
  'titleFontPath',
  'titleTopFontPath',
  'titleMiddleFontPath',
  'titleBottomFontPath',
  'titleFontSize',
  'titleTopLetterSpacing',
  'titleMiddleLetterSpacing',
  'titleBottomLetterSpacing',
  'titleLineSpacing',
  'titleBackgroundEnabled',
  'titleTopBgEnabled',
  'titleTopBgColor',
  'titleTopBgOpacityPercent',
  'titleMiddleBgEnabled',
  'titleMiddleBgColor',
  'titleMiddleBgOpacityPercent',
  'titleBottomBgEnabled',
  'titleBottomBgColor',
  'titleBottomBgOpacityPercent',
  'titleBgPaddingX',
  'titleBgPaddingY',
  'titleBgRadius',
  'captionFontPath',
  'captionFontSize',
  'textEffectFontPath',
  'textEffectColor',
  'textEffectOutlineColor',
  'textEffectOutlineSize',
  'disclaimerFontPath',
  'bgmFile',
  'bgmLibrary',
  'bgmVolumePercent',
  'clipPreset',
  'clipTitle',
  'clipCaption',
  'clipBgm',
  'hideCtaCaptions',
  'clipTitleMotion',
  'clipTextEffects',
  'clipLogo',
  'clipPatent',
  'clipIntro',
  'clipPip',
  'clipFullScreenPip',
  'bgmStartMode',
  'sfxMode',
  'sfxFolder',
  'sfxFile',
  'sfxLibrary',
  'sfxVolumePercent',
  'useSfxFile',
  'keywordSfxEnabled',
  'keywordSfxKeywords',
  'openingVideoFolder',
  'openingVideoFile',
  'openingVideoLibrary',
  'useOpeningVideoFile',
  'openingHorizontalAspectMode',
  'titleMotionPriority',
  'pipFolder',
  'pipMaterialLibrary',
  'pipMaterialFile',
  'usePipMaterialFile',
  'pipKeywords',
  'pipRules',
  'pipPriority',
  'pipX',
  'pipY',
  'pipWidth',
  'pipHeight',
  'pipDurationSeconds',
  'pipCloseAtSentenceEnd',
  'fullScreenPipFolder',
  'fullScreenPipMaterialLibrary',
  'fullScreenPipMaterialFile',
  'useFullScreenPipMaterialFile',
  'fullScreenPipKeywords',
  'fullScreenPipDurationSeconds',
  'fullScreenPipCloseAtClauseEnd',
  'fullScreenPipHorizontalAspectMode',
  'fullScreenPipPriority',
  'patentFile',
  'patentPriority',
  'inheritanceFile',
  'inheritancePriority',
  'textEffectPriority',
  'titleTopColor',
  'titleTopOutlineColor',
  'titleTopOutlineSize',
  'titleMiddleColor',
  'titleMiddleOutlineColor',
  'titleMiddleOutlineSize',
  'titleBottomColor',
  'titleBottomOutlineColor',
  'titleBottomOutlineSize',
  'captionColor',
  'captionOutlineColor',
  'captionOutlineSize',
  'captionLetterSpacing',
  'captionSingleLine',
  'captionBufferSeconds',
  'videoSpeedEnabled',
  'videoSpeedRate',
  'disableSilenceTrim',
  'trimSilenceEnabled',
  'silenceMinSeconds',
  'silenceKeepBufferSeconds',
  'disclaimerColor',
  'disclaimerOutlineColor',
  'disclaimerOutlineSize',
  'disclaimerOpacityPercent',
  'logoFolder',
  'logoFile',
  'useLogoFile',
  'logoOpacityPercent',
  'openingHorizontalAspectMode',
  'previewTitleX',
  'previewTitleY',
  'previewTitleW',
  'previewTitleH',
  'previewCaptionX',
  'previewCaptionY',
  'previewCaptionW',
  'previewCaptionH',
  'previewTextEffectX',
  'previewTextEffectY',
  'previewTextEffectW',
  'previewTextEffectH',
  'previewDisclaimerX',
  'previewDisclaimerY',
  'previewDisclaimerW',
  'previewDisclaimerH',
  'previewPipX',
  'previewPipY',
  'previewPipW',
  'previewPipH',
  'previewLogoX',
  'previewLogoY',
  'previewLogoW',
  'previewLogoH',
  'maxItems',
  'pollIntervalSeconds',
  'timeoutMinutes'
];

let settings = {};
let inputJsonPath = '';
let running = false;
let runQueue = [];
let activeQueueItem = null;
let queueSeq = 0;
let queueStopRequested = false;
let activeRunIndexes = new Set();
let currentSummary = null;
let lockedThroughIndex = 0;
let stdoutBuffer = '';
let titleUpdateTimer = null;
let contentUpdateTimer = null;
let rowTimings = new Map();
let rowClockTimer = null;
let stdoutTail = '';
let stderrTail = '';
let currentRunFailures = 0;
let contentOverrides = {};
let editingContentIndex = 0;
let customTextSaving = false;
let previewDragState = null;
let chanjingAssets = [];
let defaultTemplateSnapshot = null;
let templateManagerAccountIndex = 1;
let templateManagerDraftConfigs = new Map();
let templateManagerDraftAccounts = [];
let templateManagerFilterAccountIndexes = new Set();
let previewLayoutFrame = 0;

const requiredClipFields = new Set(['clipTitle', 'clipCaption', 'clipBgm']);
const optionalClipFields = ['hideCtaCaptions', 'clipTitleMotion', 'clipIntro', 'clipPatent', 'clipPip', 'clipFullScreenPip', 'clipTextEffects', 'clipLogo'];
const textEffectIds = ['kinetic', 'slide-reveal', 'word-bounce', 'spring-up', 'bubble'];
const defaultSensitiveReplacementRules = '医=醫\n药=藥\n病=疒\n血=皿\n手术=手S';
const clipFieldLabels = {
  clipTitle: '标题',
  clipCaption: '字幕',
  clipBgm: 'BGM',
  hideCtaCaptions: '隐藏CTA字幕',
  clipTitleMotion: '标题动画',
  clipIntro: '身份背书',
  clipPatent: '专利',
  clipPip: '画中画',
  clipFullScreenPip: '全屏画中画',
  clipTextEffects: '花字',
  clipLogo: 'Logo'
};
const clipPresetFlags = {
  title_bgm: {},
  title_motion_bgm: { clipTitleMotion: true },
  title_bgm_text_effects: { clipTextEffects: true },
  title_bgm_patent: { clipPatent: true },
  title_bgm_intro: { clipIntro: true },
  title_motion_bgm_effects: { clipTitleMotion: true, clipTextEffects: true },
  title_motion_bgm_patent: { clipTitleMotion: true, clipPatent: true },
  title_motion_bgm_intro: { clipTitleMotion: true, clipIntro: true },
  title_bgm_pip: { clipPip: true },
  full: { clipTitleMotion: true, clipIntro: true, clipPatent: true, clipPip: true, clipTextEffects: true }
};

const defaultAccounts = [
  { name: '账号1' },
  { name: '账号2' },
  { name: '账号3' }
];
const assetSelectionModeLabels = {
  random_account: '指定账号随机模板',
  rotate_account: '指定账号轮换模板',
  fixed_template: '指定账号指定模板',
  custom: '指定账号随机模板'
};
const assetManagerAllAssetsValue = '__all__';
const queueStatusLabels = {
  pending: '等待',
  running: '进行中',
  done: '已完成',
  failed: '失败',
  stopped: '已停止'
};
const templateFields = [
  'titleFontPath',
  'titleTopFontPath',
  'titleMiddleFontPath',
  'titleBottomFontPath',
  'titleFontSize',
  'titleTopLetterSpacing',
  'titleMiddleLetterSpacing',
  'titleBottomLetterSpacing',
  'titleLineSpacing',
  'titleBackgroundEnabled',
  'titleTopBgEnabled',
  'titleTopBgColor',
  'titleTopBgOpacityPercent',
  'titleMiddleBgEnabled',
  'titleMiddleBgColor',
  'titleMiddleBgOpacityPercent',
  'titleBottomBgEnabled',
  'titleBottomBgColor',
  'titleBottomBgOpacityPercent',
  'titleBgPaddingX',
  'titleBgPaddingY',
  'titleBgRadius',
  'captionFontPath',
  'captionFontSize',
  'textEffectFontPath',
  'textEffectColor',
  'textEffectOutlineColor',
  'textEffectOutlineSize',
  'disclaimerFontPath',
  'titleTopColor',
  'titleTopOutlineColor',
  'titleTopOutlineSize',
  'titleMiddleColor',
  'titleMiddleOutlineColor',
  'titleMiddleOutlineSize',
  'titleBottomColor',
  'titleBottomOutlineColor',
  'titleBottomOutlineSize',
  'captionColor',
  'captionOutlineColor',
  'captionOutlineSize',
  'captionLetterSpacing',
  'captionSingleLine',
  'captionBufferSeconds',
  'disclaimerColor',
  'disclaimerOutlineColor',
  'disclaimerOutlineSize',
  'disclaimerOpacityPercent',
  'logoFolder',
  'logoFile',
  'useLogoFile',
  'logoOpacityPercent',
  'previewTitleX',
  'previewTitleY',
  'previewTitleW',
  'previewTitleH',
  'previewCaptionX',
  'previewCaptionY',
  'previewCaptionW',
  'previewCaptionH',
  'previewTextEffectX',
  'previewTextEffectY',
  'previewTextEffectW',
  'previewTextEffectH',
  'previewDisclaimerX',
  'previewDisclaimerY',
  'previewDisclaimerW',
  'previewDisclaimerH',
  'previewPipX',
  'previewPipY',
  'previewPipW',
  'previewPipH',
  'previewLogoX',
  'previewLogoY',
  'previewLogoW',
  'previewLogoH',
  'pipX',
  'pipY',
  'pipWidth',
  'pipHeight',
  'previewVisibleObjects'
];
const previewCanvas = { width: 1080, height: 1920 };
const previewSafeTextWidth = 980;
const previewTitleMinFontSize = 72;
const previewCaptionSampleText = '昨夜西风吹折千林梢';
const pipAspectRatio = 16 / 9;
const previewDefaults = {
  title: { prefix: 'previewTitle', x: 80, y: 980, w: 920, h: 500, minW: 260, minH: 170 },
  caption: { prefix: 'previewCaption', x: 100, y: 1385, w: 880, h: 220, minW: 280, minH: 90 },
  textEffect: { prefix: 'previewTextEffect', x: 100, y: 1385, w: 880, h: 220, minW: 280, minH: 90 },
  pip: { prefix: 'previewPip', x: 156, y: 910, w: 768, h: 432, minW: 142, minH: 80, fixedAspect: pipAspectRatio },
  logo: { prefix: 'previewLogo', x: 90, y: 88, w: 180, h: 180, minW: 48, minH: 48 },
  disclaimer: { prefix: 'previewDisclaimer', x: 90, y: 1735, w: 900, h: 150, minW: 280, minH: 70 }
};
const previewObjectLabels = {
  title: '标题',
  caption: '字幕',
  textEffect: '花字限制',
  pip: '画中画',
  logo: 'Logo',
  disclaimer: '底部声明'
};
const previewObjectKinds = Object.keys(previewDefaults);
let previewVisibleKinds = new Set(previewObjectKinds);

function $(id) {
  return document.getElementById(id);
}

function appendLog(text, isError = false) {
  const box = $('logBox');
  const line = document.createElement('span');
  if (isError) line.className = 'log-error';
  line.textContent = text;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

function setStatus(text, state = '') {
  $('statusText').textContent = text;
  $('statusDot').className = `status-dot ${state}`;
}

function trimTail(value, maxLength = 12000) {
  const text = String(value || '');
  return text.length > maxLength ? text.slice(text.length - maxLength) : text;
}

function appendTail(buffer, text) {
  return trimTail(`${buffer || ''}${text || ''}`);
}

function cloneForQueue(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function queueRowsText(indexes) {
  const rows = Array.isArray(indexes) ? indexes : [];
  const visible = rows.slice(0, 10).join('、');
  return rows.length > 10 ? `${visible} 等 ${rows.length} 行` : `${visible || '-'}`;
}

function queueItemMatchesCurrentInput(item) {
  return Boolean(inputJsonPath) && String(item?.payload?.inputJsonPath || '') === String(inputJsonPath);
}

function activeQueueMatchesCurrentInput() {
  return queueItemMatchesCurrentInput(activeQueueItem);
}

function queueCounts() {
  return runQueue.reduce(
    (counts, item) => {
      counts[item.status] = (counts[item.status] || 0) + 1;
      return counts;
    },
    { pending: 0, running: 0, done: 0, failed: 0 }
  );
}

function renderQueue() {
  const list = $('queueList');
  if (!list) return;
  const counts = queueCounts();
  if ($('queuePendingCount')) $('queuePendingCount').textContent = String(counts.pending || 0);
  if ($('queueRunningCount')) $('queueRunningCount').textContent = String(counts.running || 0);
  if ($('queueDoneCount')) $('queueDoneCount').textContent = String(counts.done || 0);
  if ($('queueFailedCount')) $('queueFailedCount').textContent = String(counts.failed || 0);

  if (!runQueue.length) {
    list.innerHTML = '<div class="queue-empty">还没有加入队列的任务</div>';
    return;
  }

  list.innerHTML = '';
  for (const item of runQueue) {
    const card = document.createElement('div');
    card.className = `queue-card queue-card-${item.status}`;
    const canRemove = item.status !== 'running';
    const meta = [
      `加入 ${formatTimestamp(item.createdAt)}`,
      item.batchOutputName ? `输出 ${item.batchOutputName}` : '',
      item.startedAt ? `开始 ${formatTimestamp(item.startedAt)}` : '',
      item.completedAt ? `结束 ${formatTimestamp(item.completedAt)}` : '',
      item.failures ? `失败 ${item.failures} 条` : '',
      item.error ? item.error : ''
    ].filter(Boolean).join(' · ');
    card.innerHTML = `
      <div class="queue-card-header">
        <div class="queue-card-title">
          <strong>第 ${item.id} 批：${escapeHtml(item.name || '未命名任务')}</strong>
          <span>行号：${escapeHtml(queueRowsText(item.selectedIndexes))}</span>
        </div>
        <div class="queue-card-actions">
          <span class="queue-status ${item.status}">${escapeHtml(queueStatusLabels[item.status] || item.status)}</span>
          ${canRemove ? `<button class="button secondary small-button" data-queue-remove="${item.id}" type="button">删除</button>` : ''}
        </div>
      </div>
      <div class="queue-meta">${escapeHtml(meta || '等待开始')}</div>
    `;
    list.appendChild(card);
  }
}

function refreshQueueRowLocks() {
  const queuedIndexes = queuedRunIndexes();
  rows().forEach((row) => {
    const rowIndex = Number(row.dataset.rowIndex || 0);
    const locked = queuedIndexes.has(rowIndex) || row.classList.contains('row-done') || row.classList.contains('row-failed');
    setRowLocked(row, locked);
  });
  updateActiveRunSelectionLocks();
  updateSelectAllState();
}

function removeQueueItem(id) {
  const queueId = Number(id || 0);
  const item = runQueue.find((entry) => entry.id === queueId);
  if (!item || item.status === 'running') return;
  runQueue = runQueue.filter((entry) => entry.id !== queueId);
  refreshQueueRowLocks();
  renderQueue();
  appendLog(`[队列] 已删除第 ${queueId} 批\n`);
}

function clearSelectedRows() {
  document.querySelectorAll('[data-row-select]').forEach((el) => {
    el.checked = false;
  });
  updateSelectedCount();
  updateSelectAllState();
}

function queuedRunIndexes() {
  const indexes = activeQueueMatchesCurrentInput() ? new Set(activeRunIndexes) : new Set();
  runQueue.forEach((item) => {
    if (item.status !== 'pending' && item.status !== 'running') return;
    if (!queueItemMatchesCurrentInput(item)) return;
    (item.selectedIndexes || []).forEach((index) => indexes.add(index));
  });
  return indexes;
}

function updateActiveRunSelectionLocks() {
  const queuedIndexes = queuedRunIndexes();
  document.querySelectorAll('[data-row-select]').forEach((el) => {
    const index = Number(el.dataset.rowSelect || 0);
    el.disabled = queuedIndexes.has(index);
  });
  updateSelectAllState();
}

function lockPendingQueueRows() {
  const queuedIndexes = queuedRunIndexes();
  queuedIndexes.forEach((index) => {
    const row = rowForIndex(index);
    if (row && !row.classList.contains('row-done') && !row.classList.contains('row-failed')) {
      setRowLocked(row, true);
    }
  });
  updateActiveRunSelectionLocks();
}

function resetRowsForQueueItem(item) {
  if (!queueItemMatchesCurrentInput(item)) return;
  lockedThroughIndex = 0;
  for (const index of item.selectedIndexes || []) {
    rowTimings.delete(index);
    setRowTime(index, '未开始');
    const row = rowForIndex(index);
    if (!row) continue;
    row.classList.remove('row-running', 'row-done', 'row-failed', 'row-locked');
    setRowLocked(row, false);
  }
}

function lockActiveQueueRows() {
  if (!activeQueueMatchesCurrentInput()) return;
  activeRunIndexes.forEach((index) => {
    const row = rowForIndex(index);
    if (row) setRowLocked(row, true);
  });
  updateActiveRunSelectionLocks();
}

function markUnfinishedActiveRowsFailed() {
  if (!activeQueueMatchesCurrentInput()) return;
  activeRunIndexes.forEach((index) => {
    const row = rowForIndex(index);
    if (row && !row.classList.contains('row-done') && !row.classList.contains('row-failed')) {
      markFailedRow(index);
    }
  });
}

function normalizeClipPreset(value) {
  return Object.prototype.hasOwnProperty.call(clipPresetFlags, value) ? value : 'title_bgm';
}

function applyClipPresetFlags(target) {
  const preset = normalizeClipPreset(target.clipPreset);
  target.clipPreset = preset;
  requiredClipFields.forEach((field) => {
    target[field] = true;
  });
  optionalClipFields.forEach((field) => {
    target[field] = false;
  });
  Object.assign(target, clipPresetFlags[preset]);
  return target;
}

function clipPresetFromSettings(value) {
  const direct = normalizeClipPreset(value?.clipPreset);
  const hasOptionalFlags = optionalClipFields.some((field) => Boolean(value?.[field]));
  if (!hasOptionalFlags) return direct;

  return clipPresetFromFlags(value) || direct;
}

function clipPresetFromFlags(value) {
  for (const [preset, flags] of Object.entries(clipPresetFlags)) {
    const matches = optionalClipFields.every((field) => Boolean(value?.[field]) === Boolean(flags[field]));
    if (matches) return preset;
  }
  return 'custom';
}

function clipConfigFromInputs() {
  const current = {};
  requiredClipFields.forEach((field) => {
    current[field] = true;
  });
  optionalClipFields.forEach((field) => {
    current[field] = Boolean($(field)?.checked);
  });
  current.clipPreset = clipPresetFromFlags(current);
  return current;
}

function clipConfigText(value) {
  const parts = ['clipTitle', 'clipCaption', 'clipBgm', ...optionalClipFields]
    .filter((field) => Boolean(value?.[field]))
    .map((field) => clipFieldLabels[field]);
  return parts.join('+') || '标题+字幕+BGM';
}

function syncClipConfigUi() {
  const current = clipConfigFromInputs();
  const preset = $('clipPreset');
  const text = $('clipConfigText');
  if (preset) preset.value = current.clipPreset;
  if (text) text.textContent = clipConfigText(current);
  return current;
}

function setClipConfigOpen(open) {
  const menu = $('clipConfigMenu');
  const button = $('clipConfigButton');
  if (!menu || !button) return;
  menu.hidden = !open;
  button.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function toggleClipConfigOpen() {
  setClipConfigOpen(Boolean($('clipConfigMenu')?.hidden));
}

function normalizePreviewVisibleObjects(value) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,，\s]+/)
      : previewObjectKinds;
  const visible = raw.filter((kind) => previewObjectKinds.includes(kind));
  return visible.length ? visible : [...previewObjectKinds];
}

function collectPreviewVisibleObjects() {
  const checked = Array.from(document.querySelectorAll('[data-preview-visibility]:checked'))
    .map((input) => input.dataset.previewVisibility)
    .filter((kind) => previewObjectKinds.includes(kind));
  return checked.length ? checked : [...previewObjectKinds];
}

function previewVisibilityText(value = [...previewVisibleKinds]) {
  const parts = value
    .filter((kind) => previewObjectKinds.includes(kind))
    .map((kind) => previewObjectLabels[kind]);
  return parts.length === previewObjectKinds.length ? '全部显示' : parts.join('+');
}

function syncPreviewVisibilityControls() {
  document.querySelectorAll('[data-preview-visibility]').forEach((input) => {
    input.checked = previewVisibleKinds.has(input.dataset.previewVisibility);
  });
  const text = $('previewVisibilityText');
  if (text) text.textContent = previewVisibilityText();
}

function setPreviewVisibilityOpen(open) {
  const menu = $('previewVisibilityMenu');
  const button = $('previewVisibilityButton');
  if (!menu || !button) return;
  menu.hidden = !open;
  button.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function togglePreviewVisibilityOpen() {
  setPreviewVisibilityOpen(Boolean($('previewVisibilityMenu')?.hidden));
}

function updatePreviewVisibilityFromInputs() {
  const selected = collectPreviewVisibleObjects();
  previewVisibleKinds = new Set(selected);
  syncPreviewVisibilityControls();
  selectPreviewBox($('previewObject')?.value || selected[0]);
}

function formatDuration(ms) {
  const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-CN', { hour12: false });
}

function compactTimestamp(value = Date.now()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(Date.now());
  return `${date.getFullYear()}年${String(date.getMonth() + 1).padStart(2, '0')}月${String(date.getDate()).padStart(2, '0')}日${String(date.getHours()).padStart(2, '0')}时${String(date.getMinutes()).padStart(2, '0')}分${String(date.getSeconds()).padStart(2, '0')}秒`;
}

function eventTimeMs(event, key, fallback = Date.now()) {
  const value = Number(event?.[key]);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value > 1000000000000 ? value : value * 1000;
}

function rowTimeCell(index) {
  return document.querySelector(`[data-row-time="${index}"]`);
}

function setRowTime(index, primary, secondary = '') {
  const cell = rowTimeCell(index);
  if (!cell) return;
  cell.innerHTML = `<span>${escapeHtml(primary || '')}</span><span class="time-secondary">${escapeHtml(secondary || '')}</span>`;
}

function startRowClock() {
  if (rowClockTimer) return;
  rowClockTimer = setInterval(updateRunningTimers, 1000);
}

function stopRowClockIfIdle() {
  const hasRunning = Array.from(rowTimings.values()).some((timing) => timing.startedAt && !timing.doneAt);
  if (!hasRunning && rowClockTimer) {
    clearInterval(rowClockTimer);
    rowClockTimer = null;
  }
}

function updateRunningTimers() {
  const now = Date.now();
  rowTimings.forEach((timing, index) => {
    if (!timing.startedAt || timing.doneAt) return;
    setRowTime(index, `进行中 ${formatDuration(now - timing.startedAt)}`, `开始 ${formatTimestamp(timing.startedAt)}`);
  });
  stopRowClockIfIdle();
}

function resetTimingState() {
  rowTimings = new Map();
  if (rowClockTimer) {
    clearInterval(rowClockTimer);
    rowClockTimer = null;
  }
  document.querySelectorAll('[data-row-time]').forEach((cell) => {
    cell.innerHTML = '<span>未开始</span><span class="time-secondary"></span>';
  });
}

function normalizePipRules(value) {
  const raw = Array.isArray(value) ? value : [];
  return raw
    .map((rule) => ({
      keywords: String(rule?.keywords || '').trim(),
      videoFolder: String(rule?.videoFolder || rule?.folder || '').trim(),
      videoFile: String(rule?.videoFile || '').trim(),
      useVideoFile: rule?.useVideoFile === undefined ? true : Boolean(rule.useVideoFile),
      priority: Number.isFinite(Number(rule?.priority)) ? Number(rule.priority) : ''
    }))
    .filter((rule) => rule.keywords || rule.videoFolder || rule.videoFile || rule.priority !== '');
}

function normalizeTextEffectKeywordRules(value) {
  const raw = Array.isArray(value) ? value : [];
  return raw
    .map((rule) => ({
      keywords: String(rule?.keywords || '').trim(),
      priority: Number.isFinite(Number(rule?.priority)) ? Number(rule.priority) : ''
    }))
    .filter((rule) => rule.keywords || rule.priority !== '');
}

function collectPipRules() {
  return Array.from(document.querySelectorAll('[data-pip-rule-row]'))
    .map((row) => ({
      keywords: row.querySelector('[data-pip-rule-keywords]')?.value.trim() || '',
      videoFolder: row.querySelector('[data-pip-rule-folder]')?.value.trim() || '',
      videoFile: row.querySelector('[data-pip-rule-video]')?.value.trim() || '',
      useVideoFile: Boolean(row.querySelector('[data-pip-rule-use-video]')?.checked),
      priority: row.querySelector('[data-pip-rule-priority]')?.value === ''
        ? ''
        : Number(row.querySelector('[data-pip-rule-priority]')?.value)
    }))
    .filter((rule) => rule.keywords || rule.videoFolder || rule.videoFile || rule.priority !== '');
}

function collectTextEffectKeywordRules() {
  return Array.from(document.querySelectorAll('[data-text-effect-keyword-rule-row]'))
    .map((row) => ({
      keywords: row.querySelector('[data-text-effect-keyword-rule-keywords]')?.value.trim() || '',
      priority: row.querySelector('[data-text-effect-keyword-rule-priority]')?.value === ''
        ? ''
        : Number(row.querySelector('[data-text-effect-keyword-rule-priority]')?.value)
    }))
    .filter((rule) => rule.keywords || rule.priority !== '');
}

function renderPipRules(value) {
  const list = $('pipRuleList');
  if (!list) return;
  const rules = normalizePipRules(value);
  list.innerHTML = '';
  rules.forEach((rule) => addPipRuleRow(rule));
}

function renderTextEffectKeywordRules(value) {
  const list = $('textEffectKeywordRuleList');
  if (!list) return;
  const rules = normalizeTextEffectKeywordRules(value);
  list.innerHTML = '';
  rules.forEach((rule) => addTextEffectKeywordRuleRow(rule));
}

function addPipRuleRow(rule = {}) {
  const list = $('pipRuleList');
  if (!list) return;
  const row = document.createElement('div');
  row.className = 'pip-rule-row';
  row.dataset.pipRuleRow = '1';
  row.innerHTML = `
    <textarea data-pip-rule-keywords rows="2" placeholder="关键词，多个用逗号或换行分隔">${escapeHtml(rule.keywords || '')}</textarea>
    <div class="path-row">
      <input data-pip-rule-folder value="${escapeHtml(rule.videoFolder || '')}" placeholder="随机素材文件夹" />
      <button class="icon-button" type="button" data-pip-rule-pick-folder title="选择目录">...</button>
    </div>
    <div class="path-row with-toggle">
      <input data-pip-rule-video value="${escapeHtml(rule.videoFile || '')}" placeholder="指定素材文件" />
      <button class="icon-button" type="button" data-pip-rule-pick title="选择素材">...</button>
      <label class="inline-check"><input data-pip-rule-use-video type="checkbox" ${rule.useVideoFile === false ? '' : 'checked'} /><span>使用指定</span></label>
    </div>
  `;
  const priorityRow = document.createElement('label');
  priorityRow.className = 'pip-rule-priority';
  priorityRow.innerHTML = `
    <span>特效优先级（0-10，数字越小越优先）</span>
    <input data-pip-rule-priority type="number" min="0" max="10" step="1" value="${escapeHtml(rule.priority === '' || rule.priority === undefined ? '' : rule.priority)}" placeholder="跟随画中画" />
  `;
  row.appendChild(priorityRow);
  const actions = document.createElement('div');
  actions.className = 'rule-actions';
  actions.innerHTML = '<button class="icon-button danger" type="button" data-pip-rule-remove title="删除">×</button>';
  row.appendChild(actions);
  list.appendChild(row);
}

function addTextEffectKeywordRuleRow(rule = {}) {
  const list = $('textEffectKeywordRuleList');
  if (!list) return;
  const row = document.createElement('div');
  row.className = 'text-effect-keyword-rule-row';
  row.dataset.textEffectKeywordRuleRow = '1';
  row.innerHTML = `
    <textarea data-text-effect-keyword-rule-keywords rows="2" placeholder="触发关键词，多个用逗号或换行分隔">${escapeHtml(rule.keywords || '')}</textarea>
  `;
  const priorityRow = document.createElement('label');
  priorityRow.className = 'pip-rule-priority';
  priorityRow.innerHTML = `
    <span>特效优先级（0-10，数字越小越优先）</span>
    <input data-text-effect-keyword-rule-priority type="number" min="0" max="10" step="1" value="${escapeHtml(rule.priority === '' || rule.priority === undefined ? '' : rule.priority)}" placeholder="跟随花字" />
  `;
  const actions = document.createElement('div');
  actions.className = 'rule-actions';
  actions.innerHTML = '<button class="icon-button danger" type="button" data-text-effect-keyword-rule-remove title="删除">×</button>';
  row.appendChild(priorityRow);
  row.appendChild(actions);
  list.appendChild(row);
}

function cloneTemplateValue(value) {
  if (Array.isArray(value)) return [...value];
  if (value && typeof value === 'object') return JSON.parse(JSON.stringify(value));
  return value;
}

function normalizeAccounts(value) {
  const source = Array.isArray(value) ? value : defaultAccounts;
  return source.map((account, index) => {
    const name = typeof account === 'string' ? account : account?.name;
    return { name: String(name || `账号${index + 1}`).trim() || `账号${index + 1}` };
  });
}

function normalizeAssetSelectionMode(value) {
  const text = String(value || '').trim();
  if (text === 'random' || text === 'random_all') return 'random_account';
  if (text === 'rotate') return 'rotate_account';
  if (text === 'custom') return 'random_account';
  return Object.prototype.hasOwnProperty.call(assetSelectionModeLabels, text) ? text : 'random_account';
}

function normalizeAssetOverrides(value) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const normalized = {};
  for (const [key, item] of Object.entries(raw)) {
    const index = Number(key);
    if (!index || index < 1) continue;
    normalized[index] = {
      name: String(item?.name || `模板${index}`).trim() || `模板${index}`,
      enabled: item?.enabled !== false
    };
  }
  return normalized;
}

function defaultLogoFilePath(bundlePath = settings.bundlePath) {
  const root = String(bundlePath || '').replace(/[\\/]+$/, '');
  if (!root) return '';
  const sep = root.includes('\\') ? '\\' : '/';
  return `${root}${sep}assets${sep}template_assets${sep}medical_logo_ref_1080.png`;
}

function templateDisplayName(assetOrName, index = 0) {
  const raw = typeof assetOrName === 'string' ? assetOrName : assetOrName?.label;
  const fallbackIndex = Number(index || assetOrName?.index || 0);
  const text = String(raw || '').trim();
  if (!text) return `模板${fallbackIndex || ''}`.trim();
  return text;
}

function accountName(index = settings.chanjingAccountIndex) {
  const accountIndex = Math.max(1, Number(index || 1));
  const accounts = normalizeAccounts(settings.chanjingAccounts);
  if (!accounts.length) return '未添加账号';
  return accounts[accountIndex - 1]?.name || `账号${accountIndex}`;
}

function accountCount() {
  return normalizeAccounts(settings.chanjingAccounts).length;
}

function normalizeTemplateMap(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

function newTemplateId() {
  return `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function templateKey(accountIndex = settings.chanjingAccountIndex, assetIndex = settings.chanjingAssetIndex) {
  const account = Math.max(1, Number(accountIndex || 1));
  const asset = Math.max(1, Number(assetIndex || 1));
  return `${account}:${asset}`;
}

function captureTemplate(source) {
  const template = {};
  for (const field of templateFields) {
    if (source[field] !== undefined) {
      template[field] = cloneTemplateValue(source[field]);
    }
  }
  return template;
}

function templateFallback() {
  return defaultTemplateSnapshot ? captureTemplate(defaultTemplateSnapshot) : captureTemplate(settings);
}

function newTemplateDefaultConfig() {
  const template = templateFallback();
  for (const defaults of Object.values(previewDefaults)) {
    template[`${defaults.prefix}X`] = defaults.x;
    template[`${defaults.prefix}Y`] = defaults.y;
    template[`${defaults.prefix}W`] = defaults.w;
    template[`${defaults.prefix}H`] = defaults.h;
  }
  template.pipX = previewDefaults.pip.x;
  template.pipY = previewDefaults.pip.y;
  template.pipWidth = previewDefaults.pip.w;
  template.pipHeight = previewDefaults.pip.h;
  template.previewVisibleObjects = [...previewObjectKinds];
  return template;
}

function templateConfigFrom(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? (value.config && typeof value.config === 'object' ? value.config : value)
    : {};
  const config = captureTemplate(source);
  if (config.textEffectColor === undefined && source.captionColor !== undefined) {
    config.textEffectColor = cloneTemplateValue(source.captionColor);
  }
  if (config.textEffectOutlineColor === undefined && source.captionOutlineColor !== undefined) {
    config.textEffectOutlineColor = cloneTemplateValue(source.captionOutlineColor);
  }
  if (config.textEffectOutlineSize === undefined && source.captionOutlineSize !== undefined) {
    config.textEffectOutlineSize = cloneTemplateValue(source.captionOutlineSize);
  }
  return config;
}

function normalizeTemplateDefinition(value, accountIndex, position) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const assetIndex = Math.max(1, Number(source.assetIndex || source.chanjingAssetIndex || source.asset || 1));
  const id = String(source.id || `tpl_${accountIndex}_${position}_${assetIndex}`).trim();
  return {
    id,
    name: String(source.name || `模板${position}`).trim() || `模板${position}`,
    assetIndex,
    enabled: source.enabled !== false,
    config: templateConfigFrom(source)
  };
}

function normalizeAccountTemplates(value) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const normalized = {};
  for (const [accountKey, list] of Object.entries(raw)) {
    const accountIndex = Math.max(1, Number(accountKey || 1));
    if (!Array.isArray(list)) continue;
    normalized[accountIndex] = list
      .map((item, index) => normalizeTemplateDefinition(item, accountIndex, index + 1))
      .filter((item) => item.id);
  }
  return normalized;
}

function migrateLegacyAccountTemplates(value, legacyValue) {
  const normalized = normalizeAccountTemplates(value);
  if (Object.values(normalized).some((list) => list.length)) return normalized;

  const legacy = normalizeTemplateMap(legacyValue);
  for (const [key, config] of Object.entries(legacy)) {
    const [accountRaw, assetRaw] = key.split(':');
    const accountIndex = Math.max(1, Number(accountRaw || 1));
    const assetIndex = Math.max(1, Number(assetRaw || 1));
    const list = normalized[accountIndex] || [];
    list.push({
      id: `tpl_${accountIndex}_${list.length + 1}_${assetIndex}`,
      name: `模板${list.length + 1}`,
      assetIndex,
      enabled: true,
      config: templateConfigFrom(config)
    });
    normalized[accountIndex] = list;
  }
  return normalized;
}

function accountTemplateList(accountIndex = settings.chanjingAccountIndex, includeDisabled = false) {
  const account = Math.max(1, Number(accountIndex || 1));
  const list = normalizeAccountTemplates(settings.accountTemplates)[account] || [];
  return includeDisabled ? list : list.filter((template) => template.enabled !== false);
}

function templateById(accountIndex, templateId, includeDisabled = true) {
  const id = String(templateId || '');
  return accountTemplateList(accountIndex, includeDisabled).find((template) => template.id === id) || null;
}

function firstEnabledTemplate(accountIndex = settings.chanjingAccountIndex) {
  return accountTemplateList(accountIndex, false)[0] || null;
}

function enabledTemplateEntries() {
  const templates = normalizeAccountTemplates(settings.accountTemplates);
  const entries = [];
  for (const [accountKey, list] of Object.entries(templates)) {
    const accountIndex = Math.max(1, Number(accountKey || 1));
    for (const template of list) {
      if (template.enabled !== false) {
        entries.push({ accountIndex, template });
      }
    }
  }
  return entries;
}

function enabledTemplateCount() {
  return enabledTemplateEntries().length;
}

function firstAccountWithEnabledTemplate() {
  return enabledTemplateEntries()[0]?.accountIndex || 0;
}

function accountHasEnabledTemplate(accountIndex) {
  return accountTemplateList(accountIndex, false).length > 0;
}

function selectedTemplate(accountIndex = settings.chanjingAccountIndex) {
  return templateById(accountIndex, settings.currentTemplateId, false) || firstEnabledTemplate(accountIndex);
}

function templateChoiceValue(accountIndex, templateId) {
  const account = Math.max(1, Number(accountIndex || 1));
  return `${account}:${String(templateId || '')}`;
}

function parseTemplateChoice(value, fallbackAccount = settings.runChanjingAccountIndex || settings.chanjingAccountIndex) {
  const text = String(value || '').trim();
  if (!text) return { accountIndex: Math.max(1, Number(fallbackAccount || 1)), templateId: '' };
  const match = text.match(/^(\d+):(.+)$/);
  if (match) {
    return {
      accountIndex: Math.max(1, Number(match[1] || 1)),
      templateId: match[2]
    };
  }
  return {
    accountIndex: Math.max(1, Number(fallbackAccount || 1)),
    templateId: text
  };
}

function templateChoiceByValue(value) {
  const choice = parseTemplateChoice(value);
  const template = templateById(choice.accountIndex, choice.templateId, false);
  return template ? { accountIndex: choice.accountIndex, template } : null;
}

function allTemplateChoices() {
  const accounts = normalizeAccounts(settings.chanjingAccounts);
  const choices = [];
  accounts.forEach((_account, accountOffset) => {
    const accountIndex = accountOffset + 1;
    accountTemplateList(accountIndex, false).forEach((template) => {
      choices.push({ accountIndex, template });
    });
  });
  return choices;
}

function templateForSelection(accountIndex, templateId) {
  const template = templateById(accountIndex, templateId, true);
  return template?.config || templateFallback();
}

function fileBaseName(filePath) {
  const raw = String(filePath || '').trim();
  const base = raw.split(/[\\/]/).filter(Boolean).pop() || raw;
  return base.replace(/\.(ttf|otf|ttc)$/i, '') || base;
}

function mediaFileBaseName(filePath) {
  const raw = String(filePath || '').trim();
  const base = raw.split(/[\\/]/).filter(Boolean).pop() || raw;
  return base.replace(/\.[^.\\/]+$/i, '') || base;
}

function normalizeFontLibrary(value) {
  const raw = Array.isArray(value) ? value : [];
  const seen = new Set();
  const fonts = [];
  raw.forEach((item) => {
    const fontPath = String(typeof item === 'string' ? item : item?.path || '').trim();
    if (!fontPath || !/\.(ttf|otf|ttc)$/i.test(fontPath)) return;
    const key = fontPath.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const name = String(typeof item === 'string' ? '' : item?.name || '').trim() || fileBaseName(fontPath);
    fonts.push({ name, path: fontPath });
  });
  return fonts;
}

const mediaLibraryConfigs = {
  bgm: {
    settingKey: 'bgmLibrary',
    listId: 'bgmLibraryList',
    countId: 'bgmLibraryCount',
    importButtonId: 'btnImportBgmLibrary',
    importFolderButtonId: 'btnImportBgmLibraryFolder',
    selectId: 'bgmLibrarySelect',
    fileFieldId: 'bgmFile',
    label: 'BGM',
    emptyText: '还没有导入 BGM',
    randomText: '从 BGM 库随机',
    filterName: 'Audio',
    extensions: ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg']
  },
  sfx: {
    settingKey: 'sfxLibrary',
    listId: 'sfxLibraryList',
    countId: 'sfxLibraryCount',
    importButtonId: 'btnImportSfxLibrary',
    importFolderButtonId: 'btnImportSfxLibraryFolder',
    selectId: 'sfxLibrarySelect',
    fileFieldId: 'sfxFile',
    label: '音效',
    emptyText: '还没有导入音效',
    filterName: 'Audio',
    extensions: ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg']
  },
  openingVideo: {
    settingKey: 'openingVideoLibrary',
    listId: 'openingVideoLibraryList',
    countId: 'openingVideoLibraryCount',
    importButtonId: 'btnImportOpeningVideoLibrary',
    importFolderButtonId: 'btnImportOpeningVideoLibraryFolder',
    selectId: 'openingVideoLibrarySelect',
    fileFieldId: 'openingVideoFile',
    label: '开头视频',
    emptyText: '还没有导入开头视频',
    filterName: 'Video',
    extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v']
  },
  pipMaterial: {
    settingKey: 'pipMaterialLibrary',
    listId: 'pipMaterialLibraryList',
    countId: 'pipMaterialLibraryCount',
    importButtonId: 'btnImportPipMaterialLibrary',
    importFolderButtonId: 'btnImportPipMaterialLibraryFolder',
    selectId: 'pipMaterialLibrarySelect',
    fileFieldId: 'pipMaterialFile',
    label: '画中画素材',
    emptyText: '还没有导入画中画素材',
    filterName: 'Media',
    extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v', 'png', 'jpg', 'jpeg', 'webp']
  },
  fullScreenPipMaterial: {
    settingKey: 'fullScreenPipMaterialLibrary',
    listId: 'fullScreenPipMaterialLibraryList',
    countId: 'fullScreenPipMaterialLibraryCount',
    importButtonId: 'btnImportFullScreenPipMaterialLibrary',
    importFolderButtonId: 'btnImportFullScreenPipMaterialLibraryFolder',
    selectId: 'fullScreenPipMaterialLibrarySelect',
    fileFieldId: 'fullScreenPipMaterialFile',
    label: '全屏画中画素材',
    emptyText: '还没有导入全屏画中画素材',
    filterName: 'Media',
    extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v', 'png', 'jpg', 'jpeg', 'webp']
  }
};

function normalizeMediaLibrary(value, extensions) {
  let raw = Array.isArray(value) ? value : [];
  if (typeof value === 'string' && value.trim()) {
    try {
      raw = JSON.parse(value);
    } catch {
      raw = [value];
    }
  }
  const allowed = new Set(extensions.map((ext) => ext.toLowerCase()));
  const seen = new Set();
  const items = [];
  raw.forEach((item) => {
    const mediaPath = String(typeof item === 'string' ? item : item?.path || '').trim();
    if (!mediaPath) return;
    const ext = (mediaPath.split('.').pop() || '').toLowerCase();
    if (!allowed.has(ext)) return;
    const key = mediaPath.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const name = String(typeof item === 'string' ? '' : item?.name || '').trim() || mediaFileBaseName(mediaPath);
    items.push({ name, path: mediaPath });
  });
  return items;
}

function normalizeMediaLibraryForKind(kind, value = settings[mediaLibraryConfigs[kind]?.settingKey]) {
  const config = mediaLibraryConfigs[kind];
  return config ? normalizeMediaLibrary(value, config.extensions) : [];
}

function mediaLibraryWithCurrentPath(kind, currentPath) {
  const config = mediaLibraryConfigs[kind];
  if (!config) return [];
  const items = normalizeMediaLibraryForKind(kind);
  const pathText = String(currentPath || '').trim();
  if (pathText && !items.some((item) => item.path.toLowerCase() === pathText.toLowerCase())) {
    items.push({ name: `${mediaFileBaseName(pathText)}（当前文件）`, path: pathText });
  }
  return items;
}

function collectMediaLibraryFromUi(kind) {
  const config = mediaLibraryConfigs[kind];
  const list = config ? $(config.listId) : null;
  if (!config || !list) return normalizeMediaLibraryForKind(kind);
  const rows = Array.from(list.querySelectorAll('[data-media-library-path]'));
  return normalizeMediaLibrary(rows.map((row) => ({
    name: row.querySelector('[data-media-library-name]')?.value || row.dataset.mediaLibraryName || '',
    path: row.dataset.mediaLibraryPath || ''
  })), config.extensions);
}

function renderMediaLibrarySelect(kind) {
  const config = mediaLibraryConfigs[kind];
  const select = config ? $(config.selectId) : null;
  if (!config || !select) return;
  const fileInput = $(config.fileFieldId);
  const currentPath = String(fileInput?.value || settings[config.fileFieldId] || '').trim();
  const items = mediaLibraryWithCurrentPath(kind, currentPath);
  select.innerHTML = '';
  if (kind === 'bgm' && normalizeMediaLibraryForKind(kind).length) {
    const randomOption = document.createElement('option');
    randomOption.value = '';
    randomOption.textContent = config.randomText;
    select.appendChild(randomOption);
  }
  if (!items.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = `请先导入${config.label}`;
    select.appendChild(option);
    select.value = '';
    select.disabled = true;
    return;
  }
  if (kind !== 'bgm') {
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = `请选择库内${config.label}`;
    select.appendChild(emptyOption);
  }
  items.forEach((item) => {
    const option = document.createElement('option');
    option.value = item.path;
    option.textContent = item.name;
    option.title = item.path;
    select.appendChild(option);
  });
  select.disabled = false;
  select.value = items.some((item) => item.path === currentPath) ? currentPath : '';
}

function renderMediaLibrary(kind) {
  const config = mediaLibraryConfigs[kind];
  const list = config ? $(config.listId) : null;
  const count = config ? $(config.countId) : null;
  if (!config || !list) return;
  const items = normalizeMediaLibraryForKind(kind);
  if (count) count.textContent = `${items.length} 个${config.label}`;
  list.innerHTML = '';
  if (!items.length) {
    list.innerHTML = `<div class="font-library-empty">${escapeHtml(config.emptyText)}</div>`;
    renderMediaLibrarySelect(kind);
    return;
  }
  items.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'font-library-row media-library-row';
    row.dataset.mediaLibraryKind = kind;
    row.dataset.mediaLibraryPath = item.path;
    row.dataset.mediaLibraryName = item.name;
    row.innerHTML = `
      <input data-media-library-name value="${escapeHtml(item.name)}" />
      <span title="${escapeHtml(item.path)}">${escapeHtml(item.path)}</span>
      <button class="icon-button danger" type="button" data-media-library-remove title="删除">×</button>
    `;
    list.appendChild(row);
  });
  renderMediaLibrarySelect(kind);
}

function renderAllMediaLibraries() {
  Object.keys(mediaLibraryConfigs).forEach((kind) => renderMediaLibrary(kind));
}

async function importMediaLibrary(kind) {
  const config = mediaLibraryConfigs[kind];
  if (!config) return;
  const selected = await window.huApp.chooseFile({
    multiSelections: true,
    filters: [{ name: config.filterName, extensions: config.extensions }]
  });
  const paths = Array.isArray(selected) ? selected : (selected ? [selected] : []);
  if (!paths.length) return;
  const next = normalizeMediaLibrary([
    ...collectMediaLibraryFromUi(kind),
    ...paths.map((mediaPath) => ({ path: mediaPath }))
  ], config.extensions);
  settings[config.settingKey] = next;
  renderMediaLibrary(kind);
}

async function importMediaLibraryFolder(kind) {
  const config = mediaLibraryConfigs[kind];
  if (!config) return;
  const selected = await window.huApp.chooseMediaDirectory({ extensions: config.extensions });
  if (!selected?.directoryPath) return;
  const paths = Array.isArray(selected.filePaths) ? selected.filePaths : [];
  if (!paths.length) {
    appendLog(`[${config.label}库] 文件夹及其子文件夹中没有支持的素材：${selected.directoryPath}\n`, true);
    return;
  }
  const next = normalizeMediaLibrary([
    ...collectMediaLibraryFromUi(kind),
    ...paths.map((mediaPath) => ({ path: mediaPath }))
  ], config.extensions);
  settings[config.settingKey] = next;
  renderMediaLibrary(kind);
  appendLog(`[${config.label}库] 已从文件夹递归导入 ${paths.length} 个素材：${selected.directoryPath}\n`);
}

function fontLibraryWithCurrentPath(currentPath) {
  const fonts = normalizeFontLibrary(settings.fontLibrary);
  const pathText = String(currentPath || '').trim();
  if (pathText && !fonts.some((font) => font.path.toLowerCase() === pathText.toLowerCase())) {
    fonts.push({ name: `${fileBaseName(pathText)}（当前字体）`, path: pathText });
  }
  return fonts;
}

function collectFontLibraryFromUi() {
  const list = $('fontLibraryList');
  if (!list) return normalizeFontLibrary(settings.fontLibrary);
  const rows = Array.from(list.querySelectorAll('[data-font-library-path]'));
  return normalizeFontLibrary(rows.map((row) => ({
    name: row.querySelector('[data-font-library-name]')?.value || row.dataset.fontLibraryName || '',
    path: row.dataset.fontLibraryPath || ''
  })));
}

function renderFontLibrary() {
  const list = $('fontLibraryList');
  const count = $('fontLibraryCount');
  if (!list) return;
  const fonts = normalizeFontLibrary(settings.fontLibrary);
  if (count) count.textContent = `${fonts.length} 个字体`;
  list.innerHTML = '';
  if (!fonts.length) {
    list.innerHTML = '<div class="font-library-empty">还没有导入字体</div>';
    return;
  }
  fonts.forEach((font) => {
    const row = document.createElement('div');
    row.className = 'font-library-row';
    row.dataset.fontLibraryPath = font.path;
    row.dataset.fontLibraryName = font.name;
    row.innerHTML = `
      <input data-font-library-name value="${escapeHtml(font.name)}" />
      <span title="${escapeHtml(font.path)}">${escapeHtml(font.path)}</span>
      <button class="icon-button danger" type="button" data-font-library-remove title="删除">×</button>
    `;
    list.appendChild(row);
  });
}

function renderFontSelectOptions(targetId = '') {
  document.querySelectorAll('[data-preview-font-select]').forEach((select) => {
    const target = select.dataset.previewFontSelect;
    if (targetId && target !== targetId) return;
    const source = $(target);
    const currentPath = String(source?.value || settings[target] || '').trim();
    const fonts = fontLibraryWithCurrentPath(currentPath);
    select.innerHTML = '';
    if (!fonts.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = '请先在风格里导入字体';
      select.appendChild(option);
      select.value = '';
      select.disabled = true;
      return;
    }
    fonts.forEach((font) => {
      const option = document.createElement('option');
      option.value = font.path;
      option.textContent = font.name;
      option.title = font.path;
      select.appendChild(option);
    });
    select.disabled = false;
    select.value = currentPath && fonts.some((font) => font.path === currentPath)
      ? currentPath
      : fonts[0].path;
    if (source && !source.value && select.value) {
      source.value = select.value;
    }
  });
}

function syncFontSelectControls(targetId = '') {
  renderFontSelectOptions(targetId);
}

function normalizeTitleLineFontSettings(target = settings) {
  const fallback = String(target.titleFontPath || target.titleTopFontPath || target.titleMiddleFontPath || target.titleBottomFontPath || '').trim();
  target.titleFontPath = fallback;
  target.titleTopFontPath = String(target.titleTopFontPath || fallback).trim();
  target.titleMiddleFontPath = String(target.titleMiddleFontPath || fallback).trim();
  target.titleBottomFontPath = String(target.titleBottomFontPath || fallback).trim();
  return target;
}

function normalizeSensitiveReplacementRules(value) {
  if (value === undefined || value === null) return defaultSensitiveReplacementRules;
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (Array.isArray(item)) return `${item[0] || ''}=${item[1] || ''}`;
      if (item && typeof item === 'object') return `${item.from || item.source || ''}=${item.to || item.target || ''}`;
      return String(item || '');
    }).join('\n');
  }
  return String(value);
}

function sensitiveReplacementRowsFromText(value) {
  const text = normalizeSensitiveReplacementRules(value);
  const rows = [];
  const seen = new Set();
  text.split(/\r?\n/).forEach((line) => {
    const raw = line.trim();
    if (!raw || raw.startsWith('#')) return;
    let separator = raw.indexOf('=>');
    let length = 2;
    if (separator < 0) {
      separator = raw.indexOf('->');
      length = 2;
    }
    if (separator < 0) {
      separator = raw.indexOf('=');
      length = 1;
    }
    if (separator < 0) return;
    const from = raw.slice(0, separator).trim();
    const to = raw.slice(separator + length).trim();
    if (!from || seen.has(from)) return;
    seen.add(from);
    rows.push({ from, to });
  });
  return rows;
}

function serializeSensitiveReplacementRows(rows) {
  return rows
    .map((row) => ({ from: String(row.from || '').trim(), to: String(row.to || '').trim() }))
    .filter((row) => row.from)
    .map((row) => `${row.from}=${row.to}`)
    .join('\n');
}

function parseSensitiveReplacementRules(value) {
  return sensitiveReplacementRowsFromText(value)
    .sort((left, right) => right.from.length - left.from.length);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function applySensitiveReplacements(value, rulesValue = settings.sensitiveReplacementRules) {
  const pairs = parseSensitiveReplacementRules(rulesValue);
  let text = String(value || '');
  if (!pairs.length || !text) return text;
  const replacements = new Map(pairs.map((pair) => [pair.from, pair.to]));
  const pattern = new RegExp(pairs.map((pair) => escapeRegExp(pair.from)).join('|'), 'g');
  return text.replace(pattern, (match) => replacements.get(match) ?? match);
}

function sensitiveReplacementRowElement(row = {}) {
  const el = document.createElement('div');
  el.className = 'sensitive-replacement-row';
  el.innerHTML = `
    <input data-sensitive-from value="${escapeHtml(row.from || '')}" placeholder="例如：手术" />
    <span class="sensitive-replacement-equals">=</span>
    <input data-sensitive-to value="${escapeHtml(row.to || '')}" placeholder="例如：手S" />
    <button class="icon-button danger" type="button" data-sensitive-remove title="删除">×</button>
  `;
  return el;
}

function collectSensitiveReplacementRulesFromUi() {
  const list = $('sensitiveReplacementRuleList');
  if (!list) return $('sensitiveReplacementRules')?.value || settings.sensitiveReplacementRules || defaultSensitiveReplacementRules;
  const rows = Array.from(list.querySelectorAll('.sensitive-replacement-row')).map((row) => ({
    from: row.querySelector('[data-sensitive-from]')?.value || '',
    to: row.querySelector('[data-sensitive-to]')?.value || ''
  }));
  return serializeSensitiveReplacementRows(rows);
}

function syncSensitiveReplacementRulesFromUi(updatePreview = true) {
  const hidden = $('sensitiveReplacementRules');
  const value = collectSensitiveReplacementRulesFromUi();
  if (hidden) hidden.value = value;
  settings.sensitiveReplacementRules = value;
  if (updatePreview) {
    generatePreviewTitle();
    generatePreviewCaption();
    updatePreviewLayout();
  }
}

function renderSensitiveReplacementRules(value = settings.sensitiveReplacementRules) {
  const list = $('sensitiveReplacementRuleList');
  const hidden = $('sensitiveReplacementRules');
  if (!list) return;
  const rows = sensitiveReplacementRowsFromText(value);
  list.innerHTML = '';
  (rows.length ? rows : [{ from: '', to: '' }]).forEach((row) => {
    list.appendChild(sensitiveReplacementRowElement(row));
  });
  if (hidden) hidden.value = serializeSensitiveReplacementRows(rows);
}

function settingBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const text = String(value).trim().toLowerCase();
  if (['false', '0', 'no', 'off', '关闭'].includes(text)) return false;
  if (['true', '1', 'yes', 'on', '开启'].includes(text)) return true;
  return Boolean(value);
}

function normalizeTitleBackgroundSettings(target = settings) {
  const rowKeys = ['titleTopBgEnabled', 'titleMiddleBgEnabled', 'titleBottomBgEnabled'];
  const hasRowSetting = rowKeys.some((key) => Object.prototype.hasOwnProperty.call(target, key));
  if (!hasRowSetting && target.titleBackgroundEnabled !== undefined) {
    const legacyEnabled = settingBoolean(target.titleBackgroundEnabled);
    rowKeys.forEach((key) => {
      target[key] = legacyEnabled;
    });
  } else {
    rowKeys.forEach((key) => {
      target[key] = settingBoolean(target[key]);
    });
  }
  target.titleBackgroundEnabled = rowKeys.some((key) => settingBoolean(target[key]));
  return target;
}

async function importFontsToLibrary() {
  const selected = await window.huApp.chooseFile({
    multiSelections: true,
    filters: [{ name: 'Fonts', extensions: ['ttf', 'otf', 'ttc'] }]
  });
  const paths = Array.isArray(selected) ? selected : (selected ? [selected] : []);
  if (!paths.length) return;
  const next = normalizeFontLibrary([
    ...collectFontLibraryFromUi(),
    ...paths.map((fontPath) => ({ path: fontPath }))
  ]);
  settings.fontLibrary = next;
  renderFontLibrary();
  syncFontSelectControls();
}

function collectSettingsBase() {
  const next = {};
  for (const field of fields) {
    const el = $(field);
    if (!el) continue;
    if (el.type === 'checkbox') {
      next[field] = el.checked;
    } else if (el.type === 'number') {
      next[field] = Number(el.value || 0);
    } else {
      next[field] = el.value.trim();
    }
  }
  return next;
}

function stashCurrentTemplate(accountIndex = settings.chanjingAccountIndex, templateId = settings.currentTemplateId, source = null) {
  const current = source || collectSettingsBase();
  current.previewVisibleObjects = [...previewVisibleKinds];
  current.pipX = Number(current.previewPipX || current.pipX || previewDefaults.pip.x);
  current.pipY = Number(current.previewPipY || current.pipY || previewDefaults.pip.y);
  current.pipHeight = Number(current.previewPipH || current.pipHeight || previewDefaults.pip.h);
  current.pipWidth = Math.round(current.pipHeight * pipAspectRatio);
  const templates = normalizeAccountTemplates(settings.accountTemplates);
  const account = Math.max(1, Number(accountIndex || 1));
  const id = String(templateId || '');
  if (!id) return templates;
  const list = templates[account] || [];
  const index = list.findIndex((template) => template.id === id);
  if (index >= 0) {
    list[index] = {
      ...list[index],
      assetIndex: Math.max(1, Number(list[index].assetIndex || current.chanjingAssetIndex || 1)),
      config: captureTemplate(current)
    };
  }
  templates[account] = list;
  settings.accountTemplates = templates;
  return templates;
}

function collectSettings() {
  const next = collectSettingsBase();
  normalizeTitleLineFontSettings(next);
  normalizeTitleBackgroundSettings(next);
  next.sensitiveReplacementRules = normalizeSensitiveReplacementRules(collectSensitiveReplacementRulesFromUi());
  next.chanjingAccounts = normalizeAccounts(settings.chanjingAccounts);
  next.chanjingAssetOverrides = normalizeAssetOverrides(settings.chanjingAssetOverrides);
  next.accountTemplates = normalizeAccountTemplates(settings.accountTemplates);
  next.chanjingAccountIndex = next.chanjingAccounts.length
    ? clampNumber(Number(next.chanjingAccountIndex || settings.chanjingAccountIndex || 1), 1, next.chanjingAccounts.length)
    : 0;
  next.runChanjingAccountIndex = next.chanjingAccounts.length
    ? clampNumber(
      Number(next.runChanjingAccountIndex || settings.runChanjingAccountIndex || next.chanjingAccountIndex || 1),
      1,
      next.chanjingAccounts.length
    )
    : 0;
  next.runRandomAccountIndexes = normalizeAccountIndexList(next.runRandomAccountIndexes, next.runChanjingAccountIndex).join(',');
  next.runRotateAccountIndexes = normalizeAccountIndexList(next.runRotateAccountIndexes, next.runRandomAccountIndexes).join(',');
  next.assetSelectionMode = normalizeAssetSelectionMode(next.assetSelectionMode || settings.assetSelectionMode);
  requiredClipFields.forEach((field) => {
    next[field] = true;
  });
  Object.assign(next, normalizeSilenceTrimSettings(next));
  Object.assign(next, normalizeVideoSpeedSettings(next));
  next.pipX = Number(next.previewPipX || next.pipX || previewDefaults.pip.x);
  next.pipY = Number(next.previewPipY || next.pipY || previewDefaults.pip.y);
  next.pipHeight = Number(next.previewPipH || next.pipHeight || previewDefaults.pip.h);
  next.pipWidth = Math.round(next.pipHeight * pipAspectRatio);
  next.textEffectIds = Array.from(document.querySelectorAll('[data-text-effect-id]:checked'))
    .map((el) => el.dataset.textEffectId)
    .filter((id) => textEffectIds.includes(id));
  next.pipRules = collectPipRules();
  next.textEffectKeywordRules = collectTextEffectKeywordRules();
  next.fontLibrary = collectFontLibraryFromUi();
  next.bgmLibrary = collectMediaLibraryFromUi('bgm');
  next.sfxLibrary = collectMediaLibraryFromUi('sfx');
  next.openingVideoLibrary = collectMediaLibraryFromUi('openingVideo');
  next.pipMaterialLibrary = collectMediaLibraryFromUi('pipMaterial');
  next.fullScreenPipMaterialLibrary = collectMediaLibraryFromUi('fullScreenPipMaterial');
  next.previewVisibleObjects = [...previewVisibleKinds];
  next.accountTemplates = next.chanjingAccountIndex && next.currentTemplateId
    ? stashCurrentTemplate(next.chanjingAccountIndex, next.currentTemplateId, next)
    : normalizeAccountTemplates(settings.accountTemplates);
  const activeTemplate = templateById(next.chanjingAccountIndex, next.currentTemplateId, true);
  if (activeTemplate) {
    next.chanjingAssetIndex = activeTemplate.assetIndex;
  }
  next.clipPreset = clipPresetFromFlags(next);
  next.sfxMode = next.useSfxFile ? 'fixed' : 'random';
  return next;
}

function fillSettings(value) {
  settings = { ...(value || {}) };
  settings.chanjingAccounts = normalizeAccounts(settings.chanjingAccounts);
  settings.chanjingAssetOverrides = normalizeAssetOverrides(settings.chanjingAssetOverrides);
  settings.fontLibrary = normalizeFontLibrary(settings.fontLibrary);
  settings.bgmLibrary = normalizeMediaLibraryForKind('bgm', settings.bgmLibrary);
  settings.sfxLibrary = normalizeMediaLibraryForKind('sfx', settings.sfxLibrary);
  settings.openingVideoLibrary = normalizeMediaLibraryForKind('openingVideo', settings.openingVideoLibrary);
  settings.pipMaterialLibrary = normalizeMediaLibraryForKind('pipMaterial', settings.pipMaterialLibrary);
  settings.fullScreenPipMaterialLibrary = normalizeMediaLibraryForKind('fullScreenPipMaterial', settings.fullScreenPipMaterialLibrary);
  settings.sensitiveReplacementRules = normalizeSensitiveReplacementRules(settings.sensitiveReplacementRules);
  Object.assign(settings, normalizeSilenceTrimSettings(settings));
  Object.assign(settings, normalizeVideoSpeedSettings(settings));
  settings.accountTemplates = migrateLegacyAccountTemplates(settings.accountTemplates, settings.accountAssetTemplates);
  const accountTotal = settings.chanjingAccounts.length;
  const legacySelectionMode = String(settings.assetSelectionMode || '').trim().toLowerCase();
  if ((legacySelectionMode === 'random_all' || legacySelectionMode === 'random') && accountTotal) {
    settings.runRandomAccountIndexes = Array.from({ length: accountTotal }, (_item, index) => index + 1).join(',');
  }
  settings.chanjingAccountIndex = accountTotal
    ? clampNumber(Number(settings.chanjingAccountIndex || 1), 1, accountTotal)
    : 0;
  settings.runChanjingAccountIndex = accountTotal
    ? clampNumber(Number(settings.runChanjingAccountIndex || settings.chanjingAccountIndex || 1), 1, accountTotal)
    : 0;
  settings.runFixedAccountIndex = accountTotal
    ? clampNumber(Number(settings.runFixedAccountIndex || settings.runChanjingAccountIndex || settings.chanjingAccountIndex || 1), 1, accountTotal)
    : 0;
  settings.runRandomAccountIndexes = normalizeAccountIndexList(settings.runRandomAccountIndexes, settings.runChanjingAccountIndex).join(',');
  settings.runRotateAccountIndexes = normalizeAccountIndexList(settings.runRotateAccountIndexes, settings.runRandomAccountIndexes).join(',');
  const templateAccount = firstAccountWithEnabledTemplate();
  if (
    accountTotal
    && templateAccount
    && templateAccount <= accountTotal
    && !selectedTemplate(settings.chanjingAccountIndex)
  ) {
    settings.chanjingAccountIndex = templateAccount;
    settings.runChanjingAccountIndex = templateAccount;
    settings.runFixedAccountIndex = templateAccount;
  }
  settings.assetSelectionMode = normalizeAssetSelectionMode(settings.assetSelectionMode);
  settings.accountAssetTemplates = normalizeTemplateMap(settings.accountAssetTemplates);
  normalizeTitleLineFontSettings(settings);
  normalizeTitleBackgroundSettings(settings);
  if (!defaultTemplateSnapshot) {
    defaultTemplateSnapshot = captureTemplate(settings);
  }
  if (settings.chanjingAccountIndex) {
    const currentTemplate = selectedTemplate(settings.chanjingAccountIndex);
    settings.currentTemplateId = currentTemplate?.id || '';
    if (currentTemplate) {
      settings.chanjingAssetIndex = currentTemplate.assetIndex;
      settings = {
        ...settings,
        ...templateForSelection(settings.chanjingAccountIndex, settings.currentTemplateId)
      };
      normalizeTitleLineFontSettings(settings);
      normalizeTitleBackgroundSettings(settings);
    } else {
      settings.chanjingAssetIndex = 0;
    }
  }
  normalizeTitleLineFontSettings(settings);
  normalizeTitleBackgroundSettings(settings);
  if (!settings.logoFile) {
    settings.logoFile = defaultLogoFilePath(settings.bundlePath);
  }
  settings.previewPipX = settings.previewPipX ?? settings.pipX;
  settings.previewPipY = settings.previewPipY ?? settings.pipY;
  settings.previewPipH = settings.previewPipH ?? settings.pipHeight;
  settings.previewPipW = Math.round(Number(settings.previewPipH || previewDefaults.pip.h) * pipAspectRatio);
  settings.pipRules = normalizePipRules(settings.pipRules);
  settings.textEffectKeywordRules = normalizeTextEffectKeywordRules(settings.textEffectKeywordRules);
  previewVisibleKinds = new Set(previewObjectKinds);
  settings.previewVisibleObjects = [...previewVisibleKinds];
  const selectedTextEffects = Array.isArray(settings.textEffectIds)
    ? settings.textEffectIds.filter((id) => textEffectIds.includes(id))
    : [...textEffectIds];
  const hasOptionalFlags = optionalClipFields.some((field) => Boolean(settings[field]));
  if (hasOptionalFlags) {
    settings.clipPreset = clipPresetFromFlags(settings);
    requiredClipFields.forEach((field) => {
      settings[field] = true;
    });
  } else {
    settings.clipPreset = clipPresetFromSettings(settings);
    applyClipPresetFlags(settings);
  }
  for (const field of fields) {
    const el = $(field);
    if (!el) continue;
    if (el.type === 'checkbox') {
      el.checked = requiredClipFields.has(field) ? true : Boolean(settings[field]);
      if (requiredClipFields.has(field)) {
        el.disabled = true;
      }
    } else {
      el.value = settings[field] ?? '';
    }
  }
  syncSilenceTrimFields();
  syncVideoSpeedFields();
  document.querySelectorAll('[data-text-effect-id]').forEach((el) => {
    el.checked = selectedTextEffects.includes(el.dataset.textEffectId);
  });
  renderPipRules(settings.pipRules);
  renderTextEffectKeywordRules(settings.textEffectKeywordRules);
  renderSensitiveReplacementRules(settings.sensitiveReplacementRules);
  renderFontLibrary();
  syncFontSelectControls();
  renderAllMediaLibraries();
  settings.textEffectIds = selectedTextEffects;
  syncPreviewVisibilityControls();
  syncPreviewStyleControls();
  syncTemplateSelectionUi();
  syncPipFieldsFromPreview(false);
  syncClipConfigUi();
  updateAssetSelectionModeUi();
  updatePreviewFonts();
  updatePreviewLayout();
  renderPreviewDisclaimer();
}

function syncPipFieldsFromPreview(updatePreview = true) {
  const box = getPreviewBox('pip');
  const mapping = {
    pipX: box.x,
    pipY: box.y,
    pipHeight: box.h
  };
  for (const [id, value] of Object.entries(mapping)) {
    const el = $(id);
    if (el) el.value = String(value);
  }
  if (updatePreview) {
    setPreviewBox('pip', box, false);
  }
}

function syncPreviewPipFromStyleFields() {
  setPreviewBox('pip', {
    x: Number($('pipX')?.value || previewDefaults.pip.x),
    y: Number($('pipY')?.value || previewDefaults.pip.y),
    h: Number($('pipHeight')?.value || previewDefaults.pip.h),
  }, false);
}

function numberFromField(id, fallback) {
  const el = $(id);
  const value = Number(el?.value ?? settings[id] ?? fallback);
  return Number.isFinite(value) ? value : fallback;
}

function previewField(kind, suffix) {
  return `${previewDefaults[kind].prefix}${suffix}`;
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function previewFontSizeValue(key, fallback, min, max) {
  const sourceValue = $(key)?.value;
  const raw = sourceValue !== undefined && sourceValue !== '' ? sourceValue : settings[key] ?? fallback;
  const value = Number(raw);
  return clampNumber(Number.isFinite(value) && value > 0 ? value : fallback, min, max);
}

function normalizeSilenceTrimSettings(source = {}) {
  const minSeconds = clampNumber(Number(source.silenceMinSeconds || 0.18), 0.05, 2);
  const keepBuffer = clampNumber(Number(source.silenceKeepBufferSeconds ?? 0.04), 0, 0.5);
  const disabled = Boolean(source.disableSilenceTrim);
  return {
    disableSilenceTrim: disabled,
    trimSilenceEnabled: !disabled && source.trimSilenceEnabled !== false,
    silenceMinSeconds: Number(minSeconds.toFixed(3)),
    silenceKeepBufferSeconds: Number(keepBuffer.toFixed(3)),
    silenceMiddleKeepSeconds: Number((keepBuffer * 2).toFixed(3))
  };
}

function normalizeVideoSpeedSettings(source = {}) {
  const rate = clampNumber(Number(source.videoSpeedRate || 1.15), 0.5, 2);
  return {
    videoSpeedEnabled: Boolean(source.videoSpeedEnabled),
    videoSpeedRate: Number(rate.toFixed(3))
  };
}

function syncSilenceTrimFields() {
  const disabled = Boolean($('disableSilenceTrim')?.checked);
  const enabled = !disabled && Boolean($('trimSilenceEnabled')?.checked);
  const normalized = normalizeSilenceTrimSettings({
    disableSilenceTrim: disabled,
    trimSilenceEnabled: enabled,
    silenceMinSeconds: $('silenceMinSeconds')?.value || settings.silenceMinSeconds,
    silenceKeepBufferSeconds: $('silenceKeepBufferSeconds')?.value || settings.silenceKeepBufferSeconds
  });
  if ($('trimSilenceEnabled')) {
    $('trimSilenceEnabled').checked = normalized.trimSilenceEnabled;
    $('trimSilenceEnabled').disabled = normalized.disableSilenceTrim;
  }
  if ($('silenceMiddleKeepSeconds')) {
    $('silenceMiddleKeepSeconds').value = String(normalized.silenceMiddleKeepSeconds);
  }
  ['silenceMinSeconds', 'silenceKeepBufferSeconds', 'silenceMiddleKeepSeconds'].forEach((id) => {
    const el = $(id);
    if (el) el.disabled = !enabled;
  });
}

function syncVideoSpeedFields() {
  const normalized = normalizeVideoSpeedSettings({
    videoSpeedEnabled: $('videoSpeedEnabled')?.checked,
    videoSpeedRate: $('videoSpeedRate')?.value || settings.videoSpeedRate
  });
  const rateInput = $('videoSpeedRate');
  if (rateInput) {
    rateInput.value = String(normalized.videoSpeedRate);
    rateInput.disabled = !normalized.videoSpeedEnabled;
  }
}

function getPreviewBox(kind) {
  const defaults = previewDefaults[kind];
  const x = numberFromField(previewField(kind, 'X'), defaults.x);
  const y = numberFromField(previewField(kind, 'Y'), defaults.y);
  const h = numberFromField(previewField(kind, 'H'), defaults.h);
  const w = defaults.fixedAspect
    ? Math.round(h * defaults.fixedAspect)
    : numberFromField(previewField(kind, 'W'), defaults.w);
  return normalizePreviewBox(kind, { x, y, w, h });
}

function normalizePreviewBox(kind, box) {
  const defaults = previewDefaults[kind];
  const h = clampNumber(Math.round(Number(box.h) || defaults.h), defaults.minH, previewCanvas.height);
  const w = defaults.fixedAspect
    ? clampNumber(Math.round(h * defaults.fixedAspect), defaults.minW, previewCanvas.width)
    : clampNumber(Math.round(Number(box.w) || defaults.w), defaults.minW, previewCanvas.width);
  const x = clampNumber(Math.round(Number(box.x) || 0), 0, previewCanvas.width - w);
  const y = clampNumber(Math.round(Number(box.y) || 0), 0, previewCanvas.height - h);
  return { x, y, w, h };
}

function setPreviewBox(kind, box, updateControls = true) {
  const normalized = normalizePreviewBox(kind, box);
  for (const [suffix, value] of Object.entries({
    X: normalized.x,
    Y: normalized.y,
    W: normalized.w,
    H: normalized.h
  })) {
    const el = $(previewField(kind, suffix));
    if (el) el.value = String(value);
  }
  applyPreviewBox(kind, normalized);
  if (kind === 'pip') {
    updatePipStyleFieldsFromBox(normalized);
  }
  if (updateControls && $('previewObject')?.value === kind) {
    fillPreviewCurrentControls(kind);
  }
}

function previewCenterOffsetX(box) {
  return Math.round(box.x + box.w / 2 - previewCanvas.width / 2);
}

function syncPreviewStyleControls(targetId = '') {
  document.querySelectorAll('[data-preview-style-target]').forEach((proxy) => {
    if (targetId && proxy.dataset.previewStyleTarget !== targetId) return;
    const source = $(proxy.dataset.previewStyleTarget);
    if (!source) return;
    if (proxy.type === 'checkbox') {
      proxy.checked = Boolean(source.checked);
    } else {
      proxy.value = source.value ?? '';
    }
  });
}

function applyPreviewStyleProxy(proxy) {
  const target = proxy?.dataset?.previewStyleTarget;
  const source = target ? $(target) : null;
  if (!source) return;
  if (proxy.type === 'checkbox') {
    source.checked = Boolean(proxy.checked);
  } else {
    source.value = proxy.value;
  }
  syncPreviewStyleControls(target);
  if (target.toLowerCase().includes('fontpath')) {
    updatePreviewFonts();
  }
  if (target === 'logoFile' || target === 'useLogoFile' || target === 'logoOpacityPercent') {
    updatePreviewLogo();
  }
  applyPreviewTextStyle();
  schedulePreviewLayoutUpdate();
}

function updatePipStyleFieldsFromBox(box) {
  const values = {
    pipX: box.x,
    pipY: box.y,
    pipHeight: box.h,
  };
  for (const [id, value] of Object.entries(values)) {
    const el = $(id);
    if (el) el.value = String(value);
  }
}

function previewScale() {
  const frame = $('previewFrame');
  if (!frame) return 390 / previewCanvas.width;
  const width = frame.getBoundingClientRect().width || frame.offsetWidth || 390;
  return Math.max(0.05, width / previewCanvas.width);
}

function fitPreviewFrameToViewport() {
  const frame = $('previewFrame');
  const card = frame?.closest('.preview-stage-card');
  if (!frame || !card) return;
  const cardRect = card.getBoundingClientRect();
  const cardStyle = window.getComputedStyle(card);
  const paddingX = Number.parseFloat(cardStyle.paddingLeft || '0') + Number.parseFloat(cardStyle.paddingRight || '0');
  const paddingY = Number.parseFloat(cardStyle.paddingTop || '0') + Number.parseFloat(cardStyle.paddingBottom || '0');
  const scrollRect = card.closest('.preview-scroll')?.getBoundingClientRect();
  const viewportBottom = scrollRect ? Math.min(window.innerHeight, scrollRect.bottom) : window.innerHeight;
  const availableWidth = Math.max(96, card.clientWidth - paddingX);
  const availableHeight = Math.max(96, viewportBottom - cardRect.top - paddingY - 12);
  const fittedWidth = Math.floor(Math.min(390, availableWidth, availableHeight * previewCanvas.width / previewCanvas.height));
  frame.style.setProperty('--preview-frame-width', `${Math.max(96, fittedWidth)}px`);
}

function schedulePreviewLayoutUpdate() {
  if (previewLayoutFrame) {
    window.cancelAnimationFrame(previewLayoutFrame);
  }
  previewLayoutFrame = window.requestAnimationFrame(() => {
    previewLayoutFrame = 0;
    updatePreviewLayout();
    window.setTimeout(updatePreviewLayout, 80);
  });
}

function previewTextFont(kind, size) {
  const family = kind === 'title' || kind === 'titleTop'
    ? 'PreviewTitleTopFont, "Microsoft YaHei UI", sans-serif'
    : kind === 'titleMiddle'
      ? 'PreviewTitleMiddleFont, "Microsoft YaHei UI", sans-serif'
      : kind === 'titleBottom'
        ? 'PreviewTitleBottomFont, "Microsoft YaHei UI", sans-serif'
        : kind === 'textEffect'
      ? 'PreviewTextEffectFont, "Microsoft YaHei UI", sans-serif'
      : kind === 'disclaimer'
        ? 'PreviewDisclaimerFont, "Microsoft YaHei UI", sans-serif'
        : 'PreviewCaptionFont, "Microsoft YaHei UI", sans-serif';
  return `900 ${Math.max(1, Math.round(size))}px ${family}`;
}

function previewSpacingValue(key, fallback = 0) {
  const value = Number($(key)?.value ?? settings[key] ?? fallback);
  return Number.isFinite(value) ? value : fallback;
}

function previewBooleanValue(key, fallback = false) {
  const el = $(key);
  if (el?.type === 'checkbox') return Boolean(el.checked);
  return settingBoolean(settings[key], fallback);
}

function previewColorValue(key, fallback = '#000000') {
  return String($(key)?.value || settings[key] || fallback);
}

function previewRgbaColor(hexValue, opacityPercent = 100) {
  let text = String(hexValue || '#000000').trim();
  if (text.startsWith('#')) text = text.slice(1);
  if (/^[0-9a-fA-F]{3}$/.test(text)) {
    text = text.split('').map((ch) => ch + ch).join('');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(text)) text = '000000';
  const opacity = clampNumber(Number(opacityPercent ?? 100), 0, 100) / 100;
  const r = parseInt(text.slice(0, 2), 16);
  const g = parseInt(text.slice(2, 4), 16);
  const b = parseInt(text.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function previewLetterSpacingForKind(kind) {
  if (kind === 'title' || kind === 'titleTop') return previewSpacingValue('titleTopLetterSpacing', 0);
  if (kind === 'titleMiddle') return previewSpacingValue('titleMiddleLetterSpacing', 0);
  if (kind === 'titleBottom') return previewSpacingValue('titleBottomLetterSpacing', 0);
  if (kind === 'caption') return previewSpacingValue('captionLetterSpacing', 0);
  return 0;
}

const previewMeasureCanvas = document.createElement('canvas');
const previewMeasureContext = previewMeasureCanvas.getContext('2d');

function previewTextWidth(text, size, kind) {
  if (!previewMeasureContext) return String(text || '').length * size;
  previewMeasureContext.font = previewTextFont(kind, size);
  const value = String(text || '');
  const spacing = previewLetterSpacingForKind(kind);
  return previewMeasureContext.measureText(value).width + Math.max(0, value.length - 1) * spacing;
}

function fitPreviewAssFontSize(lines, maxSize, minSize, maxWidth, kind) {
  const visible = lines.map((line) => String(line || '').trim()).filter(Boolean);
  if (!visible.length) return maxSize;
  for (let size = Math.round(maxSize); size >= minSize; size -= 2) {
    if (visible.every((line) => previewTextWidth(line, size, kind) <= maxWidth)) {
      return size;
    }
  }
  return minSize;
}

function previewElementLines(el) {
  return String(el?.innerText || el?.textContent || '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function previewOutlineForKind(kind) {
  if (kind === 'title') {
    return Number($('titleTopOutlineSize')?.value || settings.titleTopOutlineSize || 0);
  }
  if (kind === 'disclaimer') {
    return Number($('disclaimerOutlineSize')?.value || settings.disclaimerOutlineSize || 0);
  }
  if (kind === 'textEffect') {
    return Number($('textEffectOutlineSize')?.value || settings.textEffectOutlineSize || settings.captionOutlineSize || 0);
  }
  return Number($('captionOutlineSize')?.value || settings.captionOutlineSize || 0);
}

function fitPreviewBoxFontSize(el, box, maxSize, minSize, kind, lineHeightRatio = 1.16) {
  const visible = previewElementLines(el);
  if (!visible.length) return maxSize;
  const outline = Math.max(0, previewOutlineForKind(kind));
  const usableWidth = Math.max(24, box.w - outline * 2 - 28);
  const usableHeight = Math.max(24, box.h - outline * 2 - 14);
  for (let size = Math.round(maxSize); size >= minSize; size -= 2) {
    const fitsWidth = visible.every((line) => previewTextWidth(line, size, kind) <= usableWidth);
    const fitsHeight = visible.length * size * lineHeightRatio <= usableHeight;
    if (fitsWidth && fitsHeight) return size;
  }
  return minSize;
}

function previewDisplayText(value) {
  return applySensitiveReplacements(
    value,
    $('sensitiveReplacementRules')?.value ?? settings.sensitiveReplacementRules
  );
}

function previewDisplayLine(value) {
  return previewDisplayText(value).replace(/[，,。！？!?；;：:、]/g, '').trim();
}

function applyPreviewBox(kind, box) {
  const el = $(`preview${kind[0].toUpperCase()}${kind.slice(1)}Box`);
  if (!el) return;
  const scale = previewScale();
  el.style.left = `${(box.x / previewCanvas.width) * 100}%`;
  el.style.top = `${(box.y / previewCanvas.height) * 100}%`;
  el.style.width = `${(box.w / previewCanvas.width) * 100}%`;
  el.style.height = `${(box.h / previewCanvas.height) * 100}%`;

  if (kind === 'title') {
    const titleBaseSize = previewFontSizeValue('titleFontSize', box.h * 0.3, 48, 220);
    const titleMinSize = Math.min(previewTitleMinFontSize, titleBaseSize);
    const top = el.querySelector('.preview-title-top');
    const middle = el.querySelector('.preview-title-middle');
    const bottom = el.querySelector('.preview-title-bottom');
    const bottomBaseSize = Math.round(titleBaseSize * 0.92);
    const topSize = fitPreviewAssFontSize([top?.textContent || ''], titleBaseSize, titleMinSize, previewSafeTextWidth, 'titleTop');
    const middleSize = fitPreviewAssFontSize([middle?.textContent || ''], titleBaseSize, titleMinSize, previewSafeTextWidth, 'titleMiddle');
    const bottomSize = fitPreviewAssFontSize([bottom?.textContent || ''], bottomBaseSize, Math.min(titleMinSize, bottomBaseSize), previewSafeTextWidth, 'titleBottom');
    top.style.fontSize = `${topSize * scale}px`;
    middle.style.fontSize = `${middleSize * scale}px`;
    bottom.style.fontSize = `${bottomSize * scale}px`;
    top.dataset.previewFontSize = String(topSize);
    middle.dataset.previewFontSize = String(middleSize);
    bottom.dataset.previewFontSize = String(bottomSize);
    const lineSpacing = clampNumber(previewSpacingValue('titleLineSpacing', Math.round(box.h * 0.33)), 60, 420) * scale;
    const middleY = box.h * 0.49 * scale;
    top.style.top = `${middleY - lineSpacing}px`;
    middle.style.top = `${middleY}px`;
    bottom.style.top = `${middleY + lineSpacing}px`;
  } else if (kind === 'caption') {
    const size = previewFontSizeValue('captionFontSize', box.h * 0.44, 36, 160);
    el.style.fontSize = `${size * scale}px`;
  } else if (kind === 'textEffect') {
    const maxSize = clampNumber(box.h * 0.44, 48, 128);
    const size = fitPreviewBoxFontSize($('previewTextEffectText'), box, maxSize, 18, 'textEffect', 1.12);
    el.style.fontSize = `${size * scale}px`;
  } else if (kind === 'disclaimer') {
    const maxSize = clampNumber(box.h * 0.29, 24, 64);
    const size = fitPreviewBoxFontSize($('previewDisclaimerText'), box, maxSize, 12, 'disclaimer', 1.2);
    el.style.fontSize = `${size * scale}px`;
  }
}

function updatePreviewLayout() {
  fitPreviewFrameToViewport();
  for (const kind of Object.keys(previewDefaults)) {
    setPreviewBox(kind, getPreviewBox(kind), false);
  }
  selectPreviewBox($('previewObject')?.value || 'title');
  applyPreviewTextStyle();
}

function fillPreviewCurrentControls(kind = $('previewObject')?.value || 'title') {
  const box = getPreviewBox(kind);
  const offset = $('previewCurrentCenterOffsetX');
  if (offset) offset.value = String(previewCenterOffsetX(box));
  const width = $('previewCurrentW');
  if (width) width.value = String(box.w);
  const height = $('previewCurrentH');
  if (height) height.value = String(box.h);
  if ($('previewCurrentW')) {
    $('previewCurrentW').disabled = Boolean(previewDefaults[kind]?.fixedAspect);
  }
}

function updateSelectedPreviewBoxFromControls() {
  const kind = $('previewObject')?.value || 'title';
  const current = getPreviewBox(kind);
  const h = Number($('previewCurrentH')?.value || current.h);
  const w = previewDefaults[kind]?.fixedAspect
    ? Math.round(h * previewDefaults[kind].fixedAspect)
    : Number($('previewCurrentW')?.value || current.w);
  const offset = Number($('previewCurrentCenterOffsetX')?.value || 0);
  setPreviewBox(kind, {
    x: Math.round(previewCanvas.width / 2 + offset - w / 2),
    y: current.y,
    w,
    h
  }, false);
  syncFontSizeFromPreviewResize(kind);
  fillPreviewCurrentControls(kind);
}

function selectPreviewBox(kind) {
  if (!$('previewObject')) return;
  if (!previewVisibleKinds.has(kind)) {
    kind = [...previewVisibleKinds][0] || 'title';
  }
  $('previewObject').value = kind;
  Array.from($('previewObject').options).forEach((option) => {
    option.disabled = !previewVisibleKinds.has(option.value);
  });
  document.querySelectorAll('[data-preview-box]').forEach((el) => {
    const visible = previewVisibleKinds.has(el.dataset.previewBox);
    el.hidden = !visible;
    el.classList.toggle('selected', visible && el.dataset.previewBox === kind);
  });
  document.querySelectorAll('[data-preview-style-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.previewStylePanel !== kind;
  });
  fillPreviewCurrentControls(kind);
  updatePreviewLogo();
}

function fileUrl(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return encodeURI(`file:///${text.replaceAll('\\', '/')}`);
}

function updatePreviewFonts() {
  let style = $('previewFontStyle');
  if (!style) {
    style = document.createElement('style');
    style.id = 'previewFontStyle';
    document.head.appendChild(style);
  }
  const fallbackTitleFont = $('titleFontPath')?.value || settings.titleFontPath;
  const titleTopUrl = fileUrl($('titleTopFontPath')?.value || settings.titleTopFontPath || fallbackTitleFont);
  const titleMiddleUrl = fileUrl($('titleMiddleFontPath')?.value || settings.titleMiddleFontPath || fallbackTitleFont);
  const titleBottomUrl = fileUrl($('titleBottomFontPath')?.value || settings.titleBottomFontPath || fallbackTitleFont);
  const captionUrl = fileUrl($('captionFontPath')?.value || settings.captionFontPath);
  const textEffectUrl = fileUrl($('textEffectFontPath')?.value || settings.textEffectFontPath || $('captionFontPath')?.value || settings.captionFontPath);
  const disclaimerUrl = fileUrl($('disclaimerFontPath')?.value || settings.disclaimerFontPath || $('captionFontPath')?.value || settings.captionFontPath);
  style.textContent = `
    ${titleTopUrl ? `@font-face{font-family:PreviewTitleTopFont;src:url("${titleTopUrl}");}` : ''}
    ${titleMiddleUrl ? `@font-face{font-family:PreviewTitleMiddleFont;src:url("${titleMiddleUrl}");}` : ''}
    ${titleBottomUrl ? `@font-face{font-family:PreviewTitleBottomFont;src:url("${titleBottomUrl}");}` : ''}
    ${captionUrl ? `@font-face{font-family:PreviewCaptionFont;src:url("${captionUrl}");}` : ''}
    ${textEffectUrl ? `@font-face{font-family:PreviewTextEffectFont;src:url("${textEffectUrl}");}` : ''}
    ${disclaimerUrl ? `@font-face{font-family:PreviewDisclaimerFont;src:url("${disclaimerUrl}");}` : ''}
    .preview-title-top{font-family:PreviewTitleTopFont,"Microsoft YaHei UI",sans-serif;}
    .preview-title-middle{font-family:PreviewTitleMiddleFont,"Microsoft YaHei UI",sans-serif;}
    .preview-title-bottom{font-family:PreviewTitleBottomFont,"Microsoft YaHei UI",sans-serif;}
    .preview-caption-box{font-family:PreviewCaptionFont,"Microsoft YaHei UI",sans-serif;}
    .preview-text-effect-box{font-family:PreviewTextEffectFont,"Microsoft YaHei UI",sans-serif;}
    .preview-disclaimer-box{font-family:PreviewDisclaimerFont,"Microsoft YaHei UI",sans-serif;}
  `;
  if (document.fonts?.ready) {
    document.fonts.ready.then(schedulePreviewLayoutUpdate).catch(() => {});
  }
}

function previewOutlineShadow(width, color) {
  const scaled = Math.max(0, Number(width || 0) * previewScale());
  if (scaled <= 0) return 'none';
  const outlineColor = color || '#000000';
  const shadows = [];
  const maxRadius = Math.max(1, Math.ceil(scaled));
  const directions = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [0.707, 0.707],
    [-0.707, 0.707],
    [0.707, -0.707],
    [-0.707, -0.707]
  ];
  for (let radius = 1; radius <= maxRadius; radius += 1) {
    const distance = Math.min(radius, scaled);
    directions.forEach(([x, y]) => {
      shadows.push(`${(x * distance).toFixed(2)}px ${(y * distance).toFixed(2)}px 0 ${outlineColor}`);
    });
  }
  return shadows.join(', ');
}

function applyPreviewOutline(el, width, color) {
  el.style.webkitTextStroke = '0 transparent';
  el.style.textShadow = previewOutlineShadow(width, color);
}

function previewTitleKindForLine(line) {
  if (line?.classList?.contains('preview-title-middle')) return 'titleMiddle';
  if (line?.classList?.contains('preview-title-bottom')) return 'titleBottom';
  return 'titleTop';
}

function resetPreviewTitleBackground(line, text, fontSize, scale) {
  const lineHeight = Math.max(1, fontSize * 1.18 * scale);
  line.style.height = `${lineHeight}px`;
  text.style.backgroundColor = 'transparent';
  text.style.borderRadius = '0';
  text.style.padding = '0';
  text.style.width = 'auto';
  text.style.height = 'auto';
  text.style.lineHeight = `${lineHeight}px`;
}

function applyPreviewTitleBackground(line, enabledKey, colorKey, opacityKey) {
  const text = line?.querySelector('.preview-title-text');
  if (!text) return;
  const scale = previewScale();
  const rawFontSize = Number(line.dataset.previewFontSize || 0) || (Number.parseFloat(window.getComputedStyle(line).fontSize || '0') / scale);
  const fontSize = Number.isFinite(rawFontSize) && rawFontSize > 0 ? rawFontSize : 96;
  if (!previewBooleanValue(enabledKey, false)) {
    resetPreviewTitleBackground(line, text, fontSize, scale);
    return;
  }
  const kind = previewTitleKindForLine(line);
  const paddingX = previewSpacingValue('titleBgPaddingX', 36) * scale;
  const paddingY = previewSpacingValue('titleBgPaddingY', 18) * scale;
  const radius = previewSpacingValue('titleBgRadius', 12) * scale;
  const textWidth = previewTextWidth(text.textContent || '', fontSize, kind) * scale;
  const width = Math.max(1, textWidth + paddingX * 2);
  const height = Math.max(1, fontSize * 1.18 * scale + paddingY * 2);
  line.style.height = `${height}px`;
  text.style.backgroundColor = previewRgbaColor(
    previewColorValue(colorKey, '#000000'),
    previewSpacingValue(opacityKey, 85)
  );
  text.style.borderRadius = `${radius}px`;
  text.style.padding = '0';
  text.style.width = `${width}px`;
  text.style.height = `${height}px`;
  text.style.lineHeight = `${fontSize * 1.18 * scale}px`;
}

function applyPreviewTextStyle() {
  const titleTop = $('previewTitleBox')?.querySelector('.preview-title-top');
  const titleMiddle = $('previewTitleBox')?.querySelector('.preview-title-middle');
  const titleBottom = $('previewTitleBox')?.querySelector('.preview-title-bottom');
  const caption = $('previewCaptionBox');
  const textEffect = $('previewTextEffectBox');
  const disclaimer = $('previewDisclaimerBox');
  if (titleTop) {
    titleTop.style.color = $('titleTopColor')?.value || settings.titleTopColor || '#ffffff';
    titleTop.style.letterSpacing = `${previewSpacingValue('titleTopLetterSpacing', 0) * previewScale()}px`;
    applyPreviewOutline(titleTop, $('titleTopOutlineSize')?.value || settings.titleTopOutlineSize, $('titleTopOutlineColor')?.value || settings.titleTopOutlineColor);
    applyPreviewTitleBackground(titleTop, 'titleTopBgEnabled', 'titleTopBgColor', 'titleTopBgOpacityPercent');
  }
  if (titleMiddle) {
    titleMiddle.style.color = $('titleMiddleColor')?.value || settings.titleMiddleColor || '#ffde00';
    titleMiddle.style.letterSpacing = `${previewSpacingValue('titleMiddleLetterSpacing', 0) * previewScale()}px`;
    applyPreviewOutline(titleMiddle, $('titleMiddleOutlineSize')?.value || settings.titleMiddleOutlineSize, $('titleMiddleOutlineColor')?.value || settings.titleMiddleOutlineColor);
    applyPreviewTitleBackground(titleMiddle, 'titleMiddleBgEnabled', 'titleMiddleBgColor', 'titleMiddleBgOpacityPercent');
  }
  if (titleBottom) {
    titleBottom.style.color = $('titleBottomColor')?.value || settings.titleBottomColor || '#ff2a00';
    titleBottom.style.letterSpacing = `${previewSpacingValue('titleBottomLetterSpacing', 0) * previewScale()}px`;
    applyPreviewOutline(titleBottom, $('titleBottomOutlineSize')?.value || settings.titleBottomOutlineSize, $('titleBottomOutlineColor')?.value || settings.titleBottomOutlineColor);
    applyPreviewTitleBackground(titleBottom, 'titleBottomBgEnabled', 'titleBottomBgColor', 'titleBottomBgOpacityPercent');
  }
  if (caption) {
    caption.style.color = $('captionColor')?.value || settings.captionColor || '#ffffff';
    caption.style.letterSpacing = `${previewSpacingValue('captionLetterSpacing', 0) * previewScale()}px`;
    applyPreviewOutline(caption, $('captionOutlineSize')?.value || settings.captionOutlineSize, $('captionOutlineColor')?.value || settings.captionOutlineColor);
  }
  if (textEffect) {
    textEffect.style.color = $('textEffectColor')?.value || settings.textEffectColor || settings.captionColor || '#ffffff';
    applyPreviewOutline(
      textEffect,
      $('textEffectOutlineSize')?.value || settings.textEffectOutlineSize || settings.captionOutlineSize,
      $('textEffectOutlineColor')?.value || settings.textEffectOutlineColor || settings.captionOutlineColor
    );
  }
  if (disclaimer) {
    const opacity = clampNumber(Number($('disclaimerOpacityPercent')?.value || settings.disclaimerOpacityPercent || 50), 0, 100) / 100;
    disclaimer.style.color = $('disclaimerColor')?.value || settings.disclaimerColor || '#ffffff';
    disclaimer.style.opacity = String(opacity);
    applyPreviewOutline(disclaimer, $('disclaimerOutlineSize')?.value || settings.disclaimerOutlineSize, $('disclaimerOutlineColor')?.value || settings.disclaimerOutlineColor);
  }
  updatePreviewLogo();
}

function updatePreviewLogo() {
  const box = $('previewLogoBox');
  const image = $('previewLogoImage');
  const placeholder = $('previewLogoPlaceholder');
  if (!box || !image || !placeholder) return;
  const useSpecified = $('useLogoFile') ? $('useLogoFile').checked : settings.useLogoFile !== false;
  const file = useSpecified ? ($('logoFile')?.value || settings.logoFile || '') : '';
  const opacity = clampNumber(Number($('logoOpacityPercent')?.value || settings.logoOpacityPercent || 100), 0, 100) / 100;
  image.style.opacity = String(opacity);
  placeholder.style.opacity = String(opacity);
  if (file) {
    image.src = fileUrl(file);
    image.hidden = false;
    placeholder.hidden = true;
  } else {
    image.hidden = true;
    image.removeAttribute('src');
    placeholder.hidden = false;
  }
}

function firstPreviewItem() {
  const selected = firstSelectedIndex();
  return currentItemByIndex(selected) || currentSummary?.items?.[0] || null;
}

function generatePreviewTitle() {
  const item = firstPreviewItem();
  const editor = item ? titleEditorForIndex(item.index) : null;
  const titleText = editor?.value || (item?.titleLines?.length ? item.titleLines.join('\n') : '');
  const lines = titleLinesFromText(titleText || '糖尿病血糖高\n胰岛要先看\n今天讲明白');
  const padded = [...lines, '', '', ''];
  const titleBox = $('previewTitleBox');
  if (!titleBox) return;
  titleBox.querySelector('.preview-title-top .preview-title-text').textContent = previewDisplayLine(padded[0]);
  titleBox.querySelector('.preview-title-middle .preview-title-text').textContent = previewDisplayLine(padded[1]);
  titleBox.querySelector('.preview-title-bottom .preview-title-text').textContent = previewDisplayLine(padded[2]);
  schedulePreviewLayoutUpdate();
}

function splitPreviewSentences(text) {
  return String(text || '')
    .split(/(?<=[。！？!?])/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function cleanPreviewCaptionLine(text) {
  return previewDisplayText(text).trim().replace(/[，,。！？!?；;：:、]+$/g, '');
}

function generatePreviewCaption() {
  $('previewCaptionText').textContent = previewCaptionSampleText;
  schedulePreviewLayoutUpdate();
}

function renderPreviewDisclaimer() {
  const text = '所有内容来自官方信息公示\n仅做咨询分享无不良引导\n如有不适请及时就医';
  const target = $('previewDisclaimerText');
  if (target) target.innerHTML = text.split('\n').map(escapeHtml).join('<br />');
  schedulePreviewLayoutUpdate();
}

function clearPreviewBackground() {
  const bg = $('previewVideoBg');
  const image = $('previewBgImage');
  const video = $('previewBgVideo');
  bg?.classList.remove('has-media');
  if (image) {
    image.hidden = true;
    image.onload = null;
    image.onerror = null;
    image.removeAttribute('src');
  }
  if (video) {
    video.hidden = true;
    video.pause();
    video.onloadeddata = null;
    video.onloadedmetadata = null;
    video.onseeked = null;
    video.onerror = null;
    video.removeAttribute('src');
    video.load();
  }
}

function applyPreviewBackground(source) {
  const bg = $('previewVideoBg');
  const image = $('previewBgImage');
  const video = $('previewBgVideo');
  if (!bg || !image || !video || !source?.url) {
    clearPreviewBackground();
    return;
  }

  image.hidden = true;
  video.hidden = true;
  image.removeAttribute('src');
  video.removeAttribute('src');
  bg.classList.add('has-media');

  if (source.kind === 'image') {
    image.onerror = clearPreviewBackground;
    image.src = source.url;
    image.hidden = false;
    return;
  }

  video.onloadedmetadata = () => {
    try {
      video.currentTime = Math.min(0.2, Math.max(0, Number(video.duration || 0) - 0.1));
    } catch (_error) {
      video.pause();
    }
  };
  video.onseeked = () => video.pause();
  video.onerror = clearPreviewBackground;
  video.src = source.url;
  video.hidden = false;
}

async function refreshPreviewBackground() {
  if (!window.huApp?.getPreviewBackground) return;
  try {
    const source = await window.huApp.getPreviewBackground({
      settings: collectSettings(),
      inputJsonPath
    });
    applyPreviewBackground(source);
  } catch (_error) {
    clearPreviewBackground();
  }
}

function selectedChanjingAssetFromList() {
  const index = Number(settings.chanjingAssetIndex || $('chanjingAssetIndex')?.value || 1);
  return chanjingAssets.find((asset) => Number(asset.index) === index && asset.enabled !== false) || null;
}

function assetSortNumber(asset) {
  const text = digitalAssetName(asset);
  const match = text.match(/\d+/);
  if (match) return Number(match[0]);
  const index = Number(asset?.index);
  return Number.isFinite(index) ? index : Number.MAX_SAFE_INTEGER;
}

function sortedChanjingAssets(value = chanjingAssets) {
  const collator = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' });
  return [...(Array.isArray(value) ? value : [])].sort((a, b) => {
    const numberDiff = assetSortNumber(a) - assetSortNumber(b);
    if (numberDiff) return numberDiff;
    const nameDiff = collator.compare(digitalAssetName(a), digitalAssetName(b));
    if (nameDiff) return nameDiff;
    return Number(a?.index || 0) - Number(b?.index || 0);
  });
}

function enabledChanjingAssets() {
  return sortedChanjingAssets(chanjingAssets);
}

function enabledAssetByIndex(index) {
  return enabledChanjingAssets().find((asset) => Number(asset.index) === Number(index)) || null;
}

function digitalAssetName(asset) {
  if (!asset) return '人物模板';
  return String(asset.detailLabel || asset.name || asset.label || `人物模板${asset.index}`).trim() || `人物模板${asset.index}`;
}

function renderTemplateSourceAssetOptions() {
  const select = $('templateSourceAssetIndex');
  if (!select) return;
  const current = String(settings.templateSourceAssetIndex || select.value || settings.chanjingAssetIndex || '1');
  const assets = enabledChanjingAssets();
  select.innerHTML = '';
  if (!assets.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '未找到人物模板';
    select.appendChild(option);
    select.value = '';
    select.disabled = true;
    const addButton = $('btnAssetManagerAddTemplate');
    if (addButton) addButton.disabled = true;
    return;
  }
  assets.forEach((asset) => {
    const option = document.createElement('option');
    option.value = String(asset.index);
    option.textContent = digitalAssetName(asset);
    select.appendChild(option);
  });
  select.value = assets.some((asset) => String(asset.index) === current) ? current : String(assets[0].index);
  select.disabled = false;
  settings.templateSourceAssetIndex = Number(select.value || 0);
}

function renderAssetManagerSourceAssetOptions() {
  const select = $('assetManagerSourceAssetIndex');
  if (!select) return;
  const current = String(select.value || settings.templateSourceAssetIndex || settings.chanjingAssetIndex || '');
  const assets = enabledChanjingAssets();
  select.innerHTML = '';
  if (!assets.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '未找到人物模板';
    select.appendChild(option);
    select.value = '';
    select.disabled = true;
    updateAssetManagerSourcePreview();
    updateAssetManagerAddButtonState();
    return;
  }
  assets.forEach((asset) => {
    const option = document.createElement('option');
    option.value = String(asset.index);
    option.textContent = digitalAssetName(asset);
    select.appendChild(option);
  });
  select.value = assets.some((asset) => String(asset.index) === current)
    ? current
    : String(assets[0].index);
  select.disabled = false;
  updateAssetManagerSourcePreview();
  updateAssetManagerAddButtonState();
}

function selectedAssetManagerSourceAsset() {
  const value = String($('assetManagerSourceAssetIndex')?.value || '');
  const index = Number(value || 0);
  return enabledAssetByIndex(index);
}

function isAssetManagerAllAssetsSelection() {
  return false;
}

function clearAssetManagerSourcePreview() {
  const image = $('assetManagerPreviewImage');
  const video = $('assetManagerPreviewVideo');
  const placeholder = $('assetManagerPreviewPlaceholder');
  if (image) {
    image.hidden = true;
    image.removeAttribute('src');
  }
  if (video) {
    video.hidden = true;
    video.pause();
    video.removeAttribute('src');
    video.load();
  }
  if (placeholder) {
    placeholder.textContent = '选择模板人物形象后预览';
    placeholder.hidden = false;
  }
}

function updateAssetManagerSourcePreview() {
  const asset = selectedAssetManagerSourceAsset();
  const name = $('assetManagerPreviewName');
  const meta = $('assetManagerPreviewMeta');
  const image = $('assetManagerPreviewImage');
  const video = $('assetManagerPreviewVideo');
  const placeholder = $('assetManagerPreviewPlaceholder');
  clearAssetManagerSourcePreview();
  if (name) name.textContent = asset ? digitalAssetName(asset) : '未选择模板人物形象';
  if (meta) {
    meta.textContent = asset
      ? `人物模板${asset.index}${asset.file ? ` · ${asset.file}` : ''}`
      : '先看预览，再确认是否添加为模板。';
  }
  if (!asset) {
    updateAssetManagerAddButtonState();
    return;
  }

  const showPreviewFailure = () => {
    if (image) {
      image.hidden = true;
      image.removeAttribute('src');
    }
    if (video) {
      video.hidden = true;
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    if (placeholder) {
      placeholder.textContent = '预览加载失败，可继续添加模板';
      placeholder.hidden = false;
    }
  };

  const showVideoPreview = () => {
    if (!asset.preview_url || !video) {
      showPreviewFailure();
      return;
    }
    if (placeholder) {
      placeholder.textContent = '正在加载视频预览...';
      placeholder.hidden = false;
    }
    video.onloadeddata = () => {
      if (placeholder) placeholder.hidden = true;
      video.pause();
    };
    video.onloadedmetadata = () => {
      try {
        video.currentTime = Math.min(0.2, Math.max(0, Number(video.duration || 0) - 0.1));
      } catch (_error) {
        video.pause();
      }
    };
    video.onseeked = () => {
      if (placeholder) placeholder.hidden = true;
      video.pause();
    };
    video.onerror = showPreviewFailure;
    video.src = asset.preview_url;
    video.hidden = false;
  };

  if (asset.pic_url && image) {
    if (placeholder) {
      placeholder.textContent = '正在加载封面预览...';
      placeholder.hidden = false;
    }
    image.onload = () => {
      if (placeholder) placeholder.hidden = true;
    };
    image.onerror = () => {
      image.hidden = true;
      image.removeAttribute('src');
      showVideoPreview();
    };
    image.src = asset.pic_url;
    image.hidden = false;
    updateAssetManagerAddButtonState();
    return;
  }
  showVideoPreview();
  updateAssetManagerAddButtonState();
}

function assetManagerHintElement() {
  if ($('assetAddAllModal') && !$('assetAddAllModal').hidden) return $('assetAddAllHint');
  return $('assetAddModal') && !$('assetAddModal').hidden ? $('assetAddHint') : $('assetModalHint');
}

function openAddTemplateModal() {
  if ($('assetModal')) {
    $('assetModal').hidden = true;
  }
  if (settings.currentTemplateId) {
    stashCurrentTemplate();
  }
  templateManagerDraftConfigs = new Map();
  templateManagerDraftAccounts = normalizeAccountManagerEntries(settings.chanjingAccounts);
  templateManagerAccountIndex = settings.chanjingAccountIndex || firstAccountWithEnabledTemplate() || (templateManagerDraftAccounts.length ? 1 : 0);
  renderAssetManager();
  renderAssetManagerSourceAssetOptions();
  renderAssetManagerTemplateAccountOptions('', { preferPlaceholder: true });
  resetAssetManagerTemplateName(true);
  updateAssetManagerSourcePreview();
  const hint = $('assetAddHint');
  if (hint) hint.textContent = '选择模板人物形象和归属账号，确认后会自动保存并返回模板预览。';
  $('assetAddModal').hidden = false;
  updateAssetManagerAddButtonState();
}

function closeAddTemplateModal() {
  clearAssetManagerSourcePreview();
  setAssetManagerNewAccountOpen(false);
  const nameInput = $('assetManagerTemplateName');
  if (nameInput) {
    nameInput.value = '';
    nameInput.dataset.autofilled = 'true';
  }
  $('assetAddModal').hidden = true;
  $('assetAddAllModal').hidden = true;
  templateManagerDraftConfigs = new Map();
  templateManagerDraftAccounts = [];
  updateAssetManagerAddButtonState();
}

function templateOptionsHtml(selectedId, accountIndex = settings.runChanjingAccountIndex || settings.chanjingAccountIndex) {
  const templates = accountTemplateList(accountIndex, false);
  if (!templates.length) {
    return '<option value="">没有可用模板</option>';
  }
  const selected = String(selectedId || settings.currentTemplateId || templates[0].id);
  return templates.map((template) => {
    return `<option value="${escapeHtml(template.id)}"${template.id === selected ? ' selected' : ''}>${escapeHtml(template.name)}</option>`;
  }).join('');
}

function defaultRowTemplateId() {
  const templates = accountTemplateList(settings.runChanjingAccountIndex || settings.chanjingAccountIndex, false);
  if (templates.some((template) => template.id === settings.currentTemplateId)) return settings.currentTemplateId;
  return templates[0]?.id || '';
}

function rowAssetOptionsHtml(selectedId) {
  const choices = allTemplateChoices();
  if (!choices.length) {
    return '<option value="">没有可用模板</option>';
  }
  const fallback = defaultRowTemplateSelection() || templateChoiceValue(choices[0].accountIndex, choices[0].template.id);
  const selected = templateChoiceByValue(selectedId) ? String(selectedId) : fallback;
  return choices.map(({ accountIndex, template }) => {
    const value = templateChoiceValue(accountIndex, template.id);
    const label = `${accountName(accountIndex)}-${template.name}`;
    return `<option value="${escapeHtml(value)}"${value === selected ? ' selected' : ''}>${escapeHtml(label)}</option>`;
  }).join('');
}

function renderTemplateOptions() {
  const select = $('currentTemplateId');
  if (!select) return;
  const templates = accountTemplateList(settings.chanjingAccountIndex, false);
  const current = String(settings.currentTemplateId || select.value || '');
  select.innerHTML = '';
  if (!templates.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '请添加模板';
    select.appendChild(option);
    select.value = '';
    select.disabled = true;
    settings.currentTemplateId = '';
    settings.chanjingAssetIndex = 0;
    const hiddenAsset = $('chanjingAssetIndex');
    if (hiddenAsset) hiddenAsset.value = '';
    return;
  }
  templates.forEach((template) => {
    const option = document.createElement('option');
    option.value = template.id;
    option.textContent = template.name;
    select.appendChild(option);
  });
  select.value = templates.some((template) => template.id === current) ? current : templates[0].id;
  select.disabled = false;
  settings.currentTemplateId = select.value;
  const template = templateById(settings.chanjingAccountIndex, select.value, false);
  settings.chanjingAssetIndex = Number(template?.assetIndex || 0);
  const hiddenAsset = $('chanjingAssetIndex');
  if (hiddenAsset) hiddenAsset.value = settings.chanjingAssetIndex ? String(settings.chanjingAssetIndex) : '';
}

function rowTemplateName(templateId, accountIndex = settings.runChanjingAccountIndex || settings.chanjingAccountIndex) {
  const choice = templateChoiceByValue(templateId);
  if (choice) return `${accountName(choice.accountIndex)}-${choice.template.name}`;
  const template = templateById(accountIndex, templateId, true);
  return template ? `${accountName(accountIndex)}-${template.name}` : '';
}

function defaultRowTemplateSelection() {
  const account = settings.runChanjingAccountIndex || settings.chanjingAccountIndex;
  const template = templateById(account, defaultRowTemplateId(), false);
  if (template) return templateChoiceValue(account, template.id);
  const first = allTemplateChoices()[0];
  return first ? templateChoiceValue(first.accountIndex, first.template.id) : '';
}

function fixedTemplateChoice() {
  if (!accountCount()) return null;
  const accountIndex = clampNumber(
    Number($('runFixedAccountIndex')?.value || settings.runFixedAccountIndex || settings.runChanjingAccountIndex || settings.chanjingAccountIndex || 1),
    1,
    accountCount()
  );
  const templateId = String($('runFixedTemplateId')?.value || settings.runFixedTemplateId || '');
  const template = templateById(accountIndex, templateId, false) || firstEnabledTemplate(accountIndex);
  if (template) return { accountIndex, template };
  return null;
}

function renderRunFixedTemplateOptions() {
  const accountSelect = $('runFixedAccountIndex');
  const templateSelect = $('runFixedTemplateId');
  if (!accountSelect || !templateSelect) return;
  const accounts = normalizeAccounts(settings.chanjingAccounts);
  const fallbackAccount = firstAccountWithEnabledTemplate();
  const requestedAccount = clampNumber(Number(accountSelect.value || settings.runFixedAccountIndex || settings.runChanjingAccountIndex || settings.chanjingAccountIndex || 1), 1, Math.max(1, accounts.length));
  const currentAccount = accountHasEnabledTemplate(requestedAccount) ? requestedAccount : (fallbackAccount || requestedAccount);
  accountSelect.innerHTML = '';
  if (!accounts.length) {
    accountSelect.innerHTML = '<option value="">请添加账号</option>';
    templateSelect.innerHTML = '<option value="">请添加模板</option>';
    accountSelect.disabled = true;
    templateSelect.disabled = true;
    return;
  }
  accounts.forEach((account, index) => {
    const accountIndex = index + 1;
    const hasTemplate = accountHasEnabledTemplate(accountIndex);
    const option = document.createElement('option');
    option.value = String(accountIndex);
    option.textContent = hasTemplate
      ? (account.name || `账号${accountIndex}`)
      : `${account.name || `账号${accountIndex}`}（该账号下没有模板）`;
    option.disabled = !hasTemplate;
    accountSelect.appendChild(option);
  });
  accountSelect.disabled = !fallbackAccount;
  accountSelect.value = String(currentAccount);
  settings.runFixedAccountIndex = currentAccount;

  const templates = accountTemplateList(currentAccount, false);
  const currentTemplate = String(templateSelect.value || settings.runFixedTemplateId || '');
  templateSelect.innerHTML = '';
  if (!templates.length) {
    templateSelect.innerHTML = '<option value="">请添加模板</option>';
    templateSelect.disabled = true;
    settings.runFixedTemplateId = '';
    return;
  }
  templates.forEach((template) => {
    const option = document.createElement('option');
    option.value = template.id;
    option.textContent = template.name;
    templateSelect.appendChild(option);
  });
  templateSelect.value = templates.some((template) => template.id === currentTemplate) ? currentTemplate : templates[0].id;
  templateSelect.disabled = false;
  settings.runFixedTemplateId = templateSelect.value;
}

function legacyAssetOptionHtml(selectedIndex) {
  const enabled = enabledChanjingAssets();
  if (!enabled.length) {
    return '<option value="">没有人物模板</option>';
  }
  const selected = Number(selectedIndex || settings.chanjingAssetIndex || enabled[0].index);
  return enabled.map((asset) => {
    const value = Number(asset.index);
    const label = templateDisplayName(asset, value);
    return `<option value="${value}"${value === selected ? ' selected' : ''}>${escapeHtml(label)}</option>`;
  }).join('');
}

function currentAssetSelectionMode() {
  return normalizeAssetSelectionMode($('assetSelectionMode')?.value || settings.assetSelectionMode);
}

function normalizeAccountIndexList(value, fallback = []) {
  const count = accountCount();
  const raw = Array.isArray(value)
    ? value
    : String(value || '')
      .split(/[,，\s]+/)
      .filter(Boolean);
  const list = raw
    .map((item) => Number(item))
    .filter((index) => Number.isFinite(index) && index >= 1 && index <= count);
  const unique = [...new Set(list)];
  if (unique.length) return unique;
  const fallbackList = (Array.isArray(fallback) ? fallback : [fallback])
    .map((item) => Number(item))
    .filter((index) => Number.isFinite(index) && index >= 1 && index <= count);
  return [...new Set(fallbackList)].length ? [...new Set(fallbackList)] : (count ? [1] : []);
}

function allRunAccountIndexes() {
  return Array.from({ length: accountCount() }, (_item, index) => index + 1)
    .filter((index) => accountHasEnabledTemplate(index));
}

function accountIndexesText(indexes) {
  const names = normalizeAccountIndexList(indexes).map((index) => accountName(index));
  if (!names.length) return '未选择账号';
  return names.length > 2 ? `${names.slice(0, 2).join('、')} 等 ${names.length} 个账号` : names.join('、');
}

function selectedRunAccountIndexes(kind = 'random') {
  const selector = kind === 'rotate' ? '[data-run-rotate-account]:checked' : '[data-run-random-account]:checked';
  const allSelector = kind === 'rotate' ? '[data-run-rotate-account]' : '[data-run-random-account]';
  const allBox = document.querySelector(kind === 'rotate' ? '[data-run-rotate-account-all]' : '[data-run-random-account-all]');
  const allIndexes = allRunAccountIndexes();
  const checked = Array.from(document.querySelectorAll(selector)).map((input) => Number(input.value));
  const field = kind === 'rotate' ? 'runRotateAccountIndexes' : 'runRandomAccountIndexes';
  const fallback = kind === 'rotate'
    ? settings.runRotateAccountIndexes || settings.runRandomAccountIndexes || settings.runChanjingAccountIndex
    : settings.runRandomAccountIndexes || settings.runChanjingAccountIndex;
  let selected = (allBox?.checked ? allIndexes : normalizeAccountIndexList(checked.length ? checked : settings[field], fallback))
    .filter((index) => accountHasEnabledTemplate(index));
  if (!selected.length && allIndexes.length) {
    selected = [allIndexes[0]];
  }
  const boxes = Array.from(document.querySelectorAll(allSelector));
  if (boxes.length && !checked.length && selected.length) {
    boxes.forEach((input) => {
      input.checked = selected.includes(Number(input.value));
    });
  }
  if (allBox) {
    allBox.checked = Boolean(allIndexes.length) && selected.length === allIndexes.length && allIndexes.every((index) => selected.includes(index));
  }
  return selected;
}

function handleRunAccountSelectionChange(kind, event) {
  const allBox = document.querySelector(kind === 'rotate' ? '[data-run-rotate-account-all]' : '[data-run-random-account-all]');
  const boxes = Array.from(document.querySelectorAll(kind === 'rotate' ? '[data-run-rotate-account]' : '[data-run-random-account]'));
  if (event?.target === allBox) {
    if (allBox.checked) {
      boxes.forEach((input) => {
        input.checked = true;
      });
    } else if (boxes.length) {
      boxes.forEach((input, index) => {
        input.checked = index === 0;
      });
    }
  } else if (boxes.includes(event?.target)) {
    const hasChecked = boxes.some((input) => input.checked);
    if (!hasChecked && boxes.length) {
      event.target.checked = true;
    }
    if (allBox) {
      allBox.checked = boxes.length > 0 && boxes.every((input) => input.checked);
    }
  }
}

function syncRunAccountHiddenFields() {
  const randomIndexes = selectedRunAccountIndexes('random');
  const rotateIndexes = selectedRunAccountIndexes('rotate');
  const fixedMode = currentAssetSelectionMode() === 'fixed_template';
  const fixed = fixedMode ? fixedTemplateChoice() : null;
  const fixedAccount = fixedMode
    ? Number($('runFixedAccountIndex')?.value || settings.runFixedAccountIndex || 0)
    : 0;
  const randomField = $('runRandomAccountIndexes');
  const rotateField = $('runRotateAccountIndexes');
  const accountField = $('runChanjingAccountIndex');
  if (randomField) randomField.value = randomIndexes.join(',');
  if (rotateField) rotateField.value = rotateIndexes.join(',');
  if (accountField) accountField.value = String(fixed?.accountIndex || fixedAccount || randomIndexes[0] || rotateIndexes[0] || settings.chanjingAccountIndex || 1);
  settings.runRandomAccountIndexes = randomIndexes.join(',');
  settings.runRotateAccountIndexes = rotateIndexes.join(',');
  settings.runChanjingAccountIndex = Number(accountField?.value || 1);
}

function setTemplateSelectionOpen(open) {
  const menu = $('templateSelectionMenu');
  const button = $('templateSelectionButton');
  if (!menu || !button) return;
  menu.hidden = !open;
  button.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function toggleTemplateSelectionOpen() {
  setTemplateSelectionOpen(Boolean($('templateSelectionMenu')?.hidden));
}

function syncTemplateSelectionUi() {
  const mode = currentAssetSelectionMode();
  const hidden = $('assetSelectionMode');
  if (hidden) hidden.value = mode;
  renderRunFixedTemplateOptions();
  syncRunAccountHiddenFields();
  document.querySelectorAll('[name="templateSelectionMode"]').forEach((input) => {
    input.checked = input.value === mode;
  });
  const randomList = $('runRandomAccountList');
  const rotateList = $('runRotateAccountList');
  const fixedPicker = $('runFixedTemplatePicker');
  if (randomList) randomList.hidden = mode !== 'random_account';
  if (rotateList) rotateList.hidden = mode !== 'rotate_account';
  if (fixedPicker) fixedPicker.hidden = mode !== 'fixed_template';
  const locked = Boolean($('templateSelectionButton')?.disabled);
  document.querySelectorAll('[data-run-random-account]').forEach((input) => {
    input.disabled = locked || mode !== 'random_account' || !accountHasEnabledTemplate(Number(input.value || 0));
  });
  document.querySelectorAll('[data-run-rotate-account]').forEach((input) => {
    input.disabled = locked || mode !== 'rotate_account' || !accountHasEnabledTemplate(Number(input.value || 0));
  });
  document.querySelectorAll('[data-run-random-account-all]').forEach((input) => {
    input.disabled = locked || mode !== 'random_account' || !allRunAccountIndexes().length;
  });
  document.querySelectorAll('[data-run-rotate-account-all]').forEach((input) => {
    input.disabled = locked || mode !== 'rotate_account' || !allRunAccountIndexes().length;
  });
  const fixedChoice = fixedTemplateChoice();
  const fixedAccountInput = $('runFixedAccountIndex');
  const fixedTemplateInput = $('runFixedTemplateId');
  if (fixedAccountInput) {
    fixedAccountInput.disabled = locked || mode !== 'fixed_template' || !firstAccountWithEnabledTemplate();
  }
  if (fixedTemplateInput) {
    fixedTemplateInput.disabled = locked || mode !== 'fixed_template' || !fixedChoice;
  }
  const text = $('templateSelectionText');
  if (text) {
    if (mode === 'random_account') {
      text.textContent = '模板选择方式：指定账号随机模板';
    } else if (mode === 'rotate_account') {
      text.textContent = '模板选择方式：指定账号轮换模板';
    } else if (mode === 'fixed_template') {
      const choice = fixedTemplateChoice();
      text.textContent = choice
        ? `模板选择方式：${accountName(choice.accountIndex)}-${choice.template.name}`
        : '模板选择方式：指定账号指定模板';
    } else {
      text.textContent = '模板选择方式：指定账号随机模板';
    }
  }
}

function templateChoicesForSelectionMode(mode = currentAssetSelectionMode()) {
  if (mode === 'fixed_template') {
    const fixed = fixedTemplateChoice();
    return fixed ? [fixed] : [];
  }
  if (mode === 'random_account' || mode === 'rotate_account') {
    const kind = mode === 'rotate_account' ? 'rotate' : 'random';
    return selectedRunAccountIndexes(kind).flatMap((accountIndex) => (
      accountTemplateList(accountIndex, false).map((template) => ({ accountIndex, template }))
    ));
  }
  return allTemplateChoices();
}

function handleTemplateSelectionModeChange() {
  const checked = document.querySelector('[name="templateSelectionMode"]:checked');
  const mode = normalizeAssetSelectionMode(checked?.value || settings.assetSelectionMode);
  const hidden = $('assetSelectionMode');
  if (hidden) hidden.value = mode;
  settings.assetSelectionMode = mode;
  syncRunAccountHiddenFields();
  syncTemplateSelectionUi();
  applyTemplateModeToRows(mode);
}

function updateAssetSelectionModeUi() {
  document.querySelectorAll('[data-asset-column]').forEach((el) => {
    el.hidden = false;
  });
  document.querySelectorAll('[data-row-template-id]').forEach((select) => {
    select.disabled = rowIsLocked(Number(select.dataset.rowTemplateId || 0));
  });
}

function updatePreviewSetupState() {
  const hasAccounts = accountCount() > 0;
  const hasCurrentAccountTemplate = hasAccounts && accountTemplateList(settings.chanjingAccountIndex, false).length > 0;
  const ready = hasCurrentAccountTemplate;
  const missing = $('previewMissingState');
  const missingText = $('previewMissingText');
  const addButton = $('btnOpenTemplateFromEmpty');
  const scroll = document.querySelector('#section-preview .preview-scroll');
  const footer = document.querySelector('#section-preview .preview-footer');
  if (missing) {
    missing.hidden = ready;
  }
  if (missingText) {
    missingText.textContent = '请添加模板';
  }
  if (addButton) {
    addButton.hidden = false;
  }
  if (scroll) scroll.hidden = !ready;
  if (footer) footer.hidden = !ready;
  if (ready) {
    schedulePreviewLayoutUpdate();
  }
}

function renderRowTemplateControls() {
  const fallback = defaultRowTemplateSelection();
  document.querySelectorAll('[data-row-template-id]').forEach((select) => {
    const previous = String(select.value || select.dataset.selectedAsset || fallback);
    const selected = templateChoiceByValue(previous) ? previous : fallback;
    select.innerHTML = rowAssetOptionsHtml(selected);
    select.value = selected || '';
  });
  updateAssetSelectionModeUi();
  updatePreviewSetupState();
}

function applyTemplateModeToRows(mode = currentAssetSelectionMode()) {
  mode = normalizeAssetSelectionMode(mode);
  const choices = templateChoicesForSelectionMode(mode);
  if (!choices.length) {
    renderRowTemplateControls();
    syncTemplateSelectionUi();
    return;
  }
  const selects = Array.from(document.querySelectorAll('[data-row-template-id]'));
  if (!selects.length) return;
  renderRowTemplateControls();
  const refreshed = Array.from(document.querySelectorAll('[data-row-template-id]'));
  let rotateOffset = 0;
  refreshed.forEach((select) => {
    if (rowIsLocked(Number(select.dataset.rowTemplateId || 0))) return;
    const choice = mode === 'fixed_template'
      ? choices[0]
      : mode === 'rotate_account'
        ? choices[rotateOffset++ % choices.length]
        : choices[Math.floor(Math.random() * choices.length)];
    select.value = templateChoiceValue(choice.accountIndex, choice.template.id);
  });
  updateAssetSelectionModeUi();
  syncTemplateSelectionUi();
}

function updateChanjingAssetHint() {
  const hint = $('chanjingAssetHint');
  if (!hint) return;
  if (!accountCount()) {
    hint.textContent = '请先添加账号。';
    return;
  }
  const templates = accountTemplateList(settings.chanjingAccountIndex, false);
  if (!templates.length) {
    hint.textContent = '请先选择模板人物形象并添加模板。';
    return;
  }
  const template = selectedTemplate(settings.chanjingAccountIndex);
  const asset = enabledAssetByIndex(template?.assetIndex);
  const account = Number($('chanjingAccountIndex')?.value || settings.chanjingAccountIndex || 1);
  hint.textContent = `${accountName(account)} × ${template?.name || '模板'}${asset ? ` · ${digitalAssetName(asset)}` : ''}；当前账号共 ${templates.length} 个模板`;
}

function renderChanjingAccountOptions() {
  const select = $('chanjingAccountIndex');
  if (!select) return;
  const current = String(settings.chanjingAccountIndex || select.value || '1');
  const accounts = normalizeAccounts(settings.chanjingAccounts);
  const fallbackAccount = firstAccountWithEnabledTemplate();
  settings.chanjingAccounts = accounts;
  select.innerHTML = '';
  if (!accounts.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '请添加账号';
    select.appendChild(option);
    select.value = '';
    select.disabled = true;
    settings.chanjingAccountIndex = 0;
    updatePreviewSetupState();
    return;
  }
  select.disabled = !fallbackAccount;
  accounts.forEach((account, index) => {
    const accountIndex = index + 1;
    const hasTemplate = accountHasEnabledTemplate(accountIndex);
    const option = document.createElement('option');
    option.value = String(accountIndex);
    option.textContent = hasTemplate
      ? (account.name || `账号${accountIndex}`)
      : `${account.name || `账号${accountIndex}`}（该账号下没有模板）`;
    option.disabled = !hasTemplate;
    select.appendChild(option);
  });
  const currentAccount = Number(current);
  const nextAccount = currentAccount >= 1 && currentAccount <= accounts.length && accountHasEnabledTemplate(currentAccount)
    ? currentAccount
    : fallbackAccount || 1;
  select.value = String(nextAccount);
  settings.chanjingAccountIndex = Number(select.value || 1);
  updatePreviewSetupState();
}

function renderRunAccountOptions() {
  const randomList = $('runRandomAccountList');
  const rotateList = $('runRotateAccountList');
  const accountField = $('runChanjingAccountIndex');
  const accounts = normalizeAccounts(settings.chanjingAccounts);
  if (!randomList || !rotateList || !accountField) return;
  const availableAccountIndexes = allRunAccountIndexes();
  const fallbackAccount = accountHasEnabledTemplate(Number(settings.runChanjingAccountIndex || 0))
    ? Number(settings.runChanjingAccountIndex)
    : availableAccountIndexes[0] || settings.chanjingAccountIndex || 1;
  const randomSelected = normalizeAccountIndexList(settings.runRandomAccountIndexes, fallbackAccount)
    .filter((index) => accountHasEnabledTemplate(index));
  const rotateSelected = normalizeAccountIndexList(settings.runRotateAccountIndexes, randomSelected.length ? randomSelected : fallbackAccount)
    .filter((index) => accountHasEnabledTemplate(index));
  randomList.innerHTML = '';
  rotateList.innerHTML = '';
  if (!accounts.length) {
    randomList.innerHTML = '<span class="muted">请添加账号</span>';
    rotateList.innerHTML = '<span class="muted">请添加账号</span>';
    renderRunFixedTemplateOptions();
    accountField.value = '';
    settings.runChanjingAccountIndex = 0;
    settings.runRandomAccountIndexes = '';
    settings.runRotateAccountIndexes = '';
    updatePreviewSetupState();
    syncTemplateSelectionUi();
    return;
  }
  const allIndexes = allRunAccountIndexes();
  const randomAllChecked = allIndexes.length > 0 && randomSelected.length === allIndexes.length && allIndexes.every((index) => randomSelected.includes(index));
  const rotateAllChecked = allIndexes.length > 0 && rotateSelected.length === allIndexes.length && allIndexes.every((index) => rotateSelected.includes(index));
  const randomAllLabel = document.createElement('label');
  randomAllLabel.className = 'template-account-all';
  randomAllLabel.innerHTML = `<input data-run-random-account-all type="checkbox" ${randomAllChecked ? 'checked' : ''} /><span>全部账号</span>`;
  const rotateAllLabel = document.createElement('label');
  rotateAllLabel.className = 'template-account-all';
  rotateAllLabel.innerHTML = `<input data-run-rotate-account-all type="checkbox" ${rotateAllChecked ? 'checked' : ''} /><span>全部账号</span>`;
  randomList.appendChild(randomAllLabel);
  rotateList.appendChild(rotateAllLabel);
  accounts.forEach((account, offset) => {
    const accountIndex = offset + 1;
    const name = account.name || `账号${accountIndex}`;
    const hasTemplate = accountHasEnabledTemplate(accountIndex);
    const labelText = hasTemplate ? name : `${name}（无模板）`;
    const randomLabel = document.createElement('label');
    randomLabel.innerHTML = `<input data-run-random-account type="checkbox" value="${accountIndex}" ${randomSelected.includes(accountIndex) ? 'checked' : ''} ${hasTemplate ? '' : 'disabled'} /><span>${escapeHtml(labelText)}</span>`;
    const rotateLabel = document.createElement('label');
    rotateLabel.innerHTML = `<input data-run-rotate-account type="checkbox" value="${accountIndex}" ${rotateSelected.includes(accountIndex) ? 'checked' : ''} ${hasTemplate ? '' : 'disabled'} /><span>${escapeHtml(labelText)}</span>`;
    randomList.appendChild(randomLabel);
    rotateList.appendChild(rotateLabel);
  });
  renderRunFixedTemplateOptions();
  syncRunAccountHiddenFields();
  updatePreviewSetupState();
  syncTemplateSelectionUi();
}

function normalizeAccountManagerEntries(value = settings.chanjingAccounts) {
  const source = Array.isArray(value) ? value : [];
  return source.map((account, index) => {
    const name = typeof account === 'string' ? account : account?.name;
    const hasSourceIndex = account && typeof account === 'object' && Object.prototype.hasOwnProperty.call(account, 'sourceIndex');
    return {
      name: String(name || `账号${index + 1}`).trim() || `账号${index + 1}`,
      sourceIndex: hasSourceIndex ? Number(account.sourceIndex || 0) : index + 1,
      editing: Boolean(account?.editing)
    };
  });
}

function renderAccountManager(accounts = normalizeAccountManagerEntries()) {
  const list = $('accountList');
  if (!list) return;
  const normalizedAccounts = normalizeAccountManagerEntries(accounts);
  list.innerHTML = '';
  if (!normalizedAccounts.length) {
    list.innerHTML = '<p class="empty-account">请添加账号</p>';
    const hint = $('accountModalHint');
    if (hint) hint.textContent = '当前 0 个账号。';
    return;
  }
  normalizedAccounts.forEach((account, index) => {
    const editing = Boolean(account.editing);
    const row = document.createElement('div');
    row.className = 'account-row';
    row.dataset.accountSourceIndex = String(account.sourceIndex || 0);
    const label = document.createElement('span');
    label.textContent = `账号${index + 1}`;

    const nameCell = document.createElement('div');
    nameCell.className = 'rename-name-cell';
    const nameView = document.createElement('span');
    nameView.className = 'rename-name-view';
    nameView.dataset.accountNameView = 'true';
    nameView.textContent = account.name || `账号${index + 1}`;
    const input = document.createElement('input');
    input.dataset.accountName = 'true';
    input.value = account.name || `账号${index + 1}`;
    input.placeholder = '账号名称';
    input.hidden = !editing;
    nameView.hidden = editing;
    nameCell.appendChild(nameView);
    nameCell.appendChild(input);

    const rename = document.createElement('button');
    rename.className = 'button secondary small-button rename-button';
    rename.type = 'button';
    rename.dataset.accountRename = 'true';
    rename.textContent = editing ? '完成' : '重命名';

    const remove = document.createElement('button');
    remove.className = 'icon-button danger';
    remove.type = 'button';
    remove.dataset.accountRemove = String(index);
    remove.title = '删除账号';
    remove.textContent = '×';
    row.appendChild(label);
    row.appendChild(nameCell);
    row.appendChild(rename);
    row.appendChild(remove);
    list.appendChild(row);
  });
  const hint = $('accountModalHint');
  if (hint) hint.textContent = '账号名称会用于模板选择显示。';
}

function setAccountRenameEditing(row, editing) {
  if (!row) return;
  const rows = Array.from(document.querySelectorAll('#accountList .account-row'));
  const index = rows.indexOf(row);
  const fallback = `账号${index + 1 || rows.length + 1}`;
  const input = row.querySelector('[data-account-name]');
  const view = row.querySelector('[data-account-name-view]');
  const button = row.querySelector('[data-account-rename]');
  if (!input || !view || !button) return;
  if (!editing) {
    input.value = String(input.value || '').trim() || fallback;
    view.textContent = input.value;
  }
  input.hidden = !editing;
  view.hidden = editing;
  button.textContent = editing ? '完成' : '重命名';
  if (editing) {
    input.focus();
    input.select();
  }
}

function toggleAccountRename(row) {
  const input = row?.querySelector('[data-account-name]');
  setAccountRenameEditing(row, Boolean(input?.hidden));
}

function accountManagerEntries() {
  return Array.from(document.querySelectorAll('#accountList .account-row'))
    .map((row, index) => {
      const input = row.querySelector('[data-account-name]');
      return {
        name: String(input?.value || '').trim() || `账号${index + 1}`,
        sourceIndex: Number(row.dataset.accountSourceIndex || 0),
        editing: !input?.hidden
      };
    });
}

function accountManagerAccounts() {
  return normalizeAccounts(accountManagerEntries());
}

function openAccountManager() {
  if (accountCount()) {
    stashCurrentTemplate();
  }
  renderAccountManager();
  $('accountModal').hidden = false;
}

function closeAccountManager() {
  $('accountModal').hidden = true;
}

function addAccountRow() {
  const accounts = accountManagerEntries();
  accounts.push({ name: `账号${accounts.length + 1}`, sourceIndex: 0, editing: true });
  renderAccountManager(accounts);
}

function removeAccountRow(index) {
  const accounts = accountManagerEntries();
  accounts.splice(Number(index), 1);
  renderAccountManager(accounts);
}

async function saveAccountManager() {
  const entries = accountManagerEntries();
  const accounts = normalizeAccounts(entries);
  const next = collectSettings();
  const previousTemplates = normalizeAccountTemplates(next.accountTemplates);
  const remappedTemplates = {};
  entries.forEach((entry, index) => {
    const sourceIndex = Number(entry.sourceIndex || 0);
    if (sourceIndex > 0 && previousTemplates[sourceIndex]) {
      remappedTemplates[index + 1] = previousTemplates[sourceIndex];
    }
  });
  next.chanjingAccounts = accounts;
  next.accountTemplates = remappedTemplates;
  next.chanjingAccountIndex = accounts.length
    ? clampNumber(Number(next.chanjingAccountIndex || 1), 1, accounts.length)
    : 0;
  next.runChanjingAccountIndex = accounts.length
    ? clampNumber(Number(next.runChanjingAccountIndex || next.chanjingAccountIndex || 1), 1, accounts.length)
    : 0;
  if (!accounts.length) {
    next.currentTemplateId = '';
    next.chanjingAssetIndex = 0;
  }
  settings = await window.huApp.saveSettings(next);
  fillSettings(settings);
  renderChanjingAccountOptions();
  renderRunAccountOptions();
  await refreshChanjingAssets();
  refreshPreviewBackground();
  updatePreviewSetupState();
  closeAccountManager();
  appendLog(`[账号] 已保存 ${accounts.length} 个账号\n`);
}

function templateManagerAccounts() {
  return normalizeAccountManagerEntries(templateManagerDraftAccounts);
}

function templateManagerAccountName(index) {
  const accountIndex = Math.max(1, Number(index || 1));
  const accounts = templateManagerAccounts();
  return accounts[accountIndex - 1]?.name || `账号${accountIndex}`;
}

function renderTemplateManagerAccountFilter() {
  const filter = $('assetAccountFilter');
  if (!filter) return;
  const accounts = templateManagerAccounts();
  const validIndexes = new Set(accounts.map((_account, index) => index + 1));
  templateManagerFilterAccountIndexes = new Set(
    Array.from(templateManagerFilterAccountIndexes).filter((index) => validIndexes.has(index))
  );
  filter.innerHTML = '';
  filter.hidden = !accounts.length;
  if (!accounts.length) return;

  const allLabel = document.createElement('label');
  allLabel.innerHTML = `<input data-template-account-filter-all type="checkbox" ${templateManagerFilterAccountIndexes.size ? '' : 'checked'} /><span>全部</span>`;
  filter.appendChild(allLabel);
  accounts.forEach((account, index) => {
    const accountIndex = index + 1;
    const label = document.createElement('label');
    const checked = templateManagerFilterAccountIndexes.has(accountIndex) ? 'checked' : '';
    label.innerHTML = `<input data-template-account-filter type="checkbox" value="${accountIndex}" ${checked} /><span>${escapeHtml(account.name || `账号${accountIndex}`)}</span>`;
    filter.appendChild(label);
  });
}

function applyTemplateManagerAccountFilter() {
  const list = $('assetList');
  if (!list) return;
  list.querySelector('.template-filter-empty')?.remove();
  const rows = Array.from(list.querySelectorAll('[data-template-id]'));
  if (!rows.length) return;
  const showAll = templateManagerFilterAccountIndexes.size === 0;
  let visibleCount = 0;
  rows.forEach((row) => {
    const accountIndex = Number(row.dataset.templateAccountIndex || 0);
    const visible = showAll || templateManagerFilterAccountIndexes.has(accountIndex);
    row.style.display = visible ? '' : 'none';
    row.classList.remove('asset-row-odd', 'asset-row-even');
    if (visible) {
      visibleCount += 1;
      row.classList.add(visibleCount % 2 === 0 ? 'asset-row-even' : 'asset-row-odd');
      const label = row.querySelector('[data-template-row-label]');
      if (label) label.textContent = `序号${visibleCount}`;
    }
  });
  if (!visibleCount) {
    const empty = document.createElement('p');
    empty.className = 'empty-account template-filter-empty';
    empty.textContent = '当前筛选没有模板';
    list.appendChild(empty);
  }
  const hint = $('assetModalHint');
  if (hint) {
    hint.textContent = showAll
      ? `当前共 ${rows.length} 个模板。`
      : `当前显示 ${visibleCount} / ${rows.length} 个模板。`;
  }
}

function handleTemplateManagerAccountFilterChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.matches('[data-template-account-filter-all]')) {
    templateManagerFilterAccountIndexes.clear();
    renderTemplateManagerAccountFilter();
    applyTemplateManagerAccountFilter();
    return;
  }
  if (!target.matches('[data-template-account-filter]')) return;
  const accountIndex = Number(target.value || 0);
  if (target.checked) {
    templateManagerFilterAccountIndexes.add(accountIndex);
  } else {
    templateManagerFilterAccountIndexes.delete(accountIndex);
  }
  renderTemplateManagerAccountFilter();
  applyTemplateManagerAccountFilter();
}

function updateAssetManagerAddButtonState() {
  const addButton = $('btnAssetManagerAddTemplate');
  const openAddAllButton = $('btnOpenAddAllTemplates');
  const confirmAddAllButton = $('btnConfirmAddAllTemplates');
  const hasAsset = Boolean(selectedAssetManagerSourceAsset());
  const hasTargetAccount = Number($('assetManagerTemplateAccountIndex')?.value || 0) > 0;
  const hasBulkAccount = Number($('assetAddAllAccountIndex')?.value || 0) > 0;
  const hasAnyAsset = enabledChanjingAssets().length > 0;
  if (addButton) {
    addButton.disabled = !hasAsset || !hasTargetAccount;
    addButton.textContent = '确认添加模板';
  }
  if (openAddAllButton) {
    openAddAllButton.disabled = !hasAnyAsset;
  }
  if (confirmAddAllButton) {
    confirmAddAllButton.disabled = !hasBulkAccount || !hasAnyAsset;
  }
}

function templateRowsForAccountInManager(accountIndex) {
  const account = Math.max(1, Number(accountIndex || 1));
  return Array.from(document.querySelectorAll('#assetList [data-template-id]'))
    .filter((row) => Number(row.dataset.templateAccountIndex || 0) === account);
}

function templateRowName(row) {
  return String(
    row?.querySelector('[data-template-name]')?.value ||
    row?.querySelector('[data-template-name-view]')?.textContent ||
    ''
  ).trim();
}

function nextTemplateNameForAccount(accountIndex) {
  return `模板${templateRowsForAccountInManager(accountIndex).length + 1}`;
}

function uniqueTemplateName(baseName, existingNames = [], fallback = '模板') {
  const base = String(baseName || fallback || '模板').trim() || '模板';
  const used = new Set(existingNames.map((name) => String(name || '').trim()).filter(Boolean));
  if (!used.has(base)) return base;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}-${index}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

function templateNameFromAsset(assetIndex, fallback = '模板') {
  const asset = enabledAssetByIndex(assetIndex);
  return asset ? digitalAssetName(asset) : fallback;
}

function nextTemplateNameForAssetInManager(accountIndex, assetIndex) {
  const rows = templateRowsForAccountInManager(accountIndex);
  return uniqueTemplateName(
    templateNameFromAsset(assetIndex, nextTemplateNameForAccount(accountIndex)),
    rows.map(templateRowName),
    nextTemplateNameForAccount(accountIndex)
  );
}

function nextTemplateNameForAssetInList(assetIndex, list = []) {
  return uniqueTemplateName(
    templateNameFromAsset(assetIndex, `模板${list.length + 1}`),
    list.map((template) => template?.name),
    `模板${list.length + 1}`
  );
}

function resetAssetManagerTemplateName(force = false) {
  const input = $('assetManagerTemplateName');
  if (!input) return;
  const accountIndex = Number($('assetManagerTemplateAccountIndex')?.value || templateManagerAccountIndex || 0);
  if (!accountIndex) {
    input.value = '';
    input.placeholder = '模板名称';
    input.dataset.autofilled = 'true';
    return;
  }
  const assetIndex = Number($('assetManagerSourceAssetIndex')?.value || settings.templateSourceAssetIndex || settings.chanjingAssetIndex || 0);
  const nextName = nextTemplateNameForAssetInManager(accountIndex, assetIndex);
  input.placeholder = nextName;
  if (force || input.dataset.autofilled !== 'false' || !input.value.trim()) {
    input.value = nextName;
    input.dataset.autofilled = 'true';
  }
}

function renderAssetAddAllAccountOptions(preferredValue = '') {
  const select = $('assetAddAllAccountIndex');
  if (!select) return;
  const accounts = templateManagerAccounts();
  const current = String(preferredValue || select.value || templateManagerAccountIndex || '');
  select.innerHTML = '';
  const emptyOption = document.createElement('option');
  emptyOption.value = '';
  emptyOption.textContent = '请选择账号';
  select.appendChild(emptyOption);
  if (!accounts.length) {
    const option = document.createElement('option');
    option.value = '__new__';
    option.textContent = '添加账号';
    select.appendChild(option);
    select.value = '__new__';
    select.disabled = false;
    setAssetAddAllNewAccountOpen(true);
    const hint = $('assetAddAllHint');
    if (hint) hint.textContent = '还没有账号，先在这里新建一个账号，再一键补全所有模板。';
    updateAssetManagerAddButtonState();
    return;
  }
  accounts.forEach((account, index) => {
    const option = document.createElement('option');
    option.value = String(index + 1);
    option.textContent = account.name || `账号${index + 1}`;
    select.appendChild(option);
  });
  const newOption = document.createElement('option');
  newOption.value = '__new__';
  newOption.textContent = '添加账号';
  select.appendChild(newOption);
  select.value = Number(current) >= 1 && Number(current) <= accounts.length ? current : '';
  select.disabled = false;
  setAssetAddAllNewAccountOpen(false);
  const hint = $('assetAddAllHint');
  if (hint) {
    hint.textContent = accounts.length
      ? '先选择账号，再确认补全所有模板。'
      : '请先在添加模板里新建归属账号，或到账号管理中添加账号。';
  }
  updateAssetManagerAddButtonState();
}

function setAssetAddAllNewAccountOpen(open) {
  const panel = $('assetAddAllNewAccountPanel');
  const input = $('assetAddAllNewAccountName');
  if (!panel) return;
  panel.hidden = !open;
  if (open && input) {
    const accounts = templateManagerAccounts();
    input.value = input.value || `账号${accounts.length + 1}`;
    setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  }
}

function openAddAllTemplatesModal() {
  renderAssetAddAllAccountOptions($('assetManagerTemplateAccountIndex')?.value || templateManagerAccountIndex || '');
  $('assetAddModal').hidden = true;
  $('assetAddAllModal').hidden = false;
  updateAssetManagerAddButtonState();
}

function cancelAddAllTemplatesModal() {
  $('assetAddAllModal').hidden = true;
  $('assetAddModal').hidden = false;
  const input = $('assetAddAllNewAccountName');
  if (input) input.value = '';
  setAssetAddAllNewAccountOpen(false);
  const hint = $('assetAddHint');
  if (hint) hint.textContent = '选择模板人物形象和归属账号，确认后会自动保存并返回模板预览。';
  updateAssetManagerAddButtonState();
}

function addAssetAddAllDraftAccount(nameFromPrompt = '') {
  const accounts = templateManagerAccounts();
  const fallback = `账号${accounts.length + 1}`;
  const name = String(nameFromPrompt || '').trim() || fallback;
  accounts.push({ name, sourceIndex: 0 });
  templateManagerDraftAccounts = accounts;
  templateManagerAccountIndex = accounts.length;
  const input = $('assetAddAllNewAccountName');
  if (input) input.value = '';
  setAssetAddAllNewAccountOpen(false);
  renderAssetAddAllAccountOptions(String(templateManagerAccountIndex));
  renderAssetManagerTemplateAccountOptions(String(templateManagerAccountIndex));
  renderAssetManager();
  const hint = $('assetAddAllHint');
  if (hint) hint.textContent = `已新建 ${name}，可以确认一键补全所有模板。`;
}

function confirmAssetAddAllNewAccount() {
  addAssetAddAllDraftAccount($('assetAddAllNewAccountName')?.value || '');
}

function cancelAssetAddAllNewAccount() {
  const input = $('assetAddAllNewAccountName');
  if (input) input.value = '';
  setAssetAddAllNewAccountOpen(false);
  renderAssetAddAllAccountOptions(String(templateManagerAccountIndex || ''));
}

function handleAssetAddAllAccountChange() {
  const select = $('assetAddAllAccountIndex');
  if (!select) return;
  if (select.value !== '__new__') {
    setAssetAddAllNewAccountOpen(false);
    updateAssetManagerAddButtonState();
    return;
  }
  setAssetAddAllNewAccountOpen(true);
  updateAssetManagerAddButtonState();
}

function renderAssetManagerTemplateAccountOptions(preferredValue = '', options = {}) {
  const select = $('assetManagerTemplateAccountIndex');
  if (!select) return;
  const accounts = templateManagerAccounts();
  const current = options.preferPlaceholder ? '' : String(preferredValue || select.value || templateManagerAccountIndex || '');
  select.innerHTML = '';
  const emptyOption = document.createElement('option');
  emptyOption.value = '';
  emptyOption.textContent = '请选择归属账号';
  select.appendChild(emptyOption);
  if (!accounts.length) {
    const option = document.createElement('option');
    option.value = '__new__';
    option.textContent = '添加账号';
    select.appendChild(option);
    select.value = '';
    select.disabled = false;
    setAssetManagerNewAccountOpen(false);
    resetAssetManagerTemplateName(true);
    const hint = assetManagerHintElement();
    if (hint) hint.textContent = '请选择归属账号，或选择“添加账号”新建一个账号。';
    updateAssetManagerAddButtonState();
    return;
  }
  accounts.forEach((account, index) => {
    const option = document.createElement('option');
    option.value = String(index + 1);
    option.textContent = account.name || `账号${index + 1}`;
    select.appendChild(option);
  });
  const newOption = document.createElement('option');
  newOption.value = '__new__';
  newOption.textContent = '添加账号';
  select.appendChild(newOption);
  select.value = Number(current) >= 1 && Number(current) <= accounts.length ? current : '';
  select.disabled = false;
  setAssetManagerNewAccountOpen(false);
  resetAssetManagerTemplateName(true);
  updateAssetManagerAddButtonState();
}

function setAssetManagerNewAccountOpen(open) {
  const panel = $('assetManagerNewAccountPanel');
  const input = $('assetManagerNewAccountName');
  if (!panel) return;
  panel.hidden = !open;
  if (open && input) {
    const accounts = templateManagerAccounts();
    input.value = input.value || `账号${accounts.length + 1}`;
    setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  }
}

function addAssetManagerDraftAccount(nameFromPrompt = '') {
  const accounts = templateManagerAccounts();
  const fallback = `账号${accounts.length + 1}`;
  const name = String(nameFromPrompt || '').trim() || fallback;
  accounts.push({ name, sourceIndex: 0 });
  templateManagerDraftAccounts = accounts;
  templateManagerAccountIndex = accounts.length;
  const input = $('assetManagerNewAccountName');
  if (input) input.value = '';
  setAssetManagerNewAccountOpen(false);
  renderAssetManagerTemplateAccountOptions(String(templateManagerAccountIndex));
  renderAssetManager();
  resetAssetManagerTemplateName(true);
  const hint = assetManagerHintElement();
  if (hint) hint.textContent = `已新建 ${name}，选择模板人物形象后可以添加模板。`;
}

function confirmAssetManagerNewAccount() {
  addAssetManagerDraftAccount($('assetManagerNewAccountName')?.value || '');
}

function cancelAssetManagerNewAccount() {
  const input = $('assetManagerNewAccountName');
  if (input) input.value = '';
  setAssetManagerNewAccountOpen(false);
  renderAssetManagerTemplateAccountOptions(String(templateManagerAccountIndex || ''));
}

function handleAssetManagerTemplateAccountChange() {
  const select = $('assetManagerTemplateAccountIndex');
  if (!select) return;
  if (select.value !== '__new__') {
    setAssetManagerNewAccountOpen(false);
    resetAssetManagerTemplateName(true);
    updateAssetManagerAddButtonState();
    return;
  }
  setAssetManagerNewAccountOpen(true);
  updateAssetManagerAddButtonState();
}

function appendTemplateManagerRow(template, index, accountIndex = templateManagerAccountIndex || settings.chanjingAccountIndex || 1) {
  const list = $('assetList');
  if (!list) return;
  const asset = enabledAssetByIndex(template.assetIndex);
  const config = template.config || newTemplateDefaultConfig();
  const editing = template.isNew === true;
  templateManagerDraftConfigs.set(template.id, cloneTemplateValue(config));
  const row = document.createElement('div');
  row.className = 'asset-row';
  row.dataset.templateId = template.id;
  row.dataset.templateAssetIndex = String(template.assetIndex || 1);
  row.dataset.templateAccountIndex = String(Math.max(1, Number(accountIndex || 1)));

  const label = document.createElement('span');
  label.dataset.templateRowLabel = 'true';
  label.textContent = `序号${index + 1}`;

  const nameCell = document.createElement('div');
  nameCell.className = 'rename-name-cell';
  const displayName = String(template.name || templateNameFromAsset(template.assetIndex, `模板${index + 1}`)).trim() || `模板${index + 1}`;
  const nameView = document.createElement('span');
  nameView.className = 'rename-name-view';
  nameView.dataset.templateNameView = 'true';
  nameView.textContent = displayName;
  const name = document.createElement('input');
  name.dataset.templateName = 'true';
  name.value = displayName;
  name.placeholder = displayName;
  name.hidden = !editing;
  nameView.hidden = editing;
  nameCell.appendChild(nameView);
  nameCell.appendChild(name);

  const rename = document.createElement('button');
  rename.className = 'button secondary small-button rename-button';
  rename.type = 'button';
  rename.dataset.templateRename = template.id;
  rename.textContent = editing ? '完成' : '重命名';

  const assetLabel = document.createElement('span');
  assetLabel.className = 'template-asset-label';
  assetLabel.textContent = `${templateManagerAccountName(accountIndex)} · ${asset ? digitalAssetName(asset) : `人物模板${template.assetIndex}`}`;

  const remove = document.createElement('button');
  remove.className = 'icon-button danger';
  remove.type = 'button';
  remove.dataset.templateRemove = template.id;
  remove.title = '删除模板';
  remove.textContent = '×';

  row.appendChild(label);
  row.appendChild(nameCell);
  row.appendChild(rename);
  row.appendChild(assetLabel);
  row.appendChild(remove);
  list.appendChild(row);
}

function renumberTemplateManagerRows() {
  applyTemplateManagerAccountFilter();
}

function setTemplateRenameEditing(row, editing) {
  if (!row) return;
  const rows = Array.from(document.querySelectorAll('#assetList [data-template-id]'));
  const index = rows.indexOf(row);
  const fallback = uniqueTemplateName(
    templateNameFromAsset(Number(row.dataset.templateAssetIndex || 0), `模板${index + 1 || rows.length + 1}`),
    rows.filter((item) => item !== row).map(templateRowName),
    `模板${index + 1 || rows.length + 1}`
  );
  const input = row.querySelector('[data-template-name]');
  const view = row.querySelector('[data-template-name-view]');
  const button = row.querySelector('[data-template-rename]');
  if (!input || !view || !button) return;
  if (!editing) {
    input.value = String(input.value || '').trim() || fallback;
    view.textContent = input.value;
  }
  input.hidden = !editing;
  view.hidden = editing;
  button.textContent = editing ? '完成' : '重命名';
  if (editing) {
    input.focus();
    input.select();
  }
}

function toggleTemplateRename(row) {
  const input = row?.querySelector('[data-template-name]');
  setTemplateRenameEditing(row, Boolean(input?.hidden));
}

async function addAllTemplateRowsInManager(targetAccount) {
  const list = $('assetList');
  const assets = enabledChanjingAssets();
  const hint = assetManagerHintElement();
  if (!list || !assets.length) {
    if (hint) hint.textContent = '未找到可以添加的数字人形象。';
    return;
  }
  templateManagerAccountIndex = targetAccount;
  list.querySelector('.empty-account')?.remove();
  const rows = Array.from(list.querySelectorAll('[data-template-id]'));
  const targetRows = rows.filter((row) => Number(row.dataset.templateAccountIndex || 0) === targetAccount);
  const existingAssetIndexes = new Set(
    targetRows
      .map((row) => Number(row.dataset.templateAssetIndex || 0))
      .filter((index) => index > 0)
  );
  let totalCount = rows.length;
  let accountCount = targetRows.length;
  const existingNames = targetRows.map(templateRowName);
  let added = 0;
  let skipped = 0;
  assets.forEach((asset) => {
    const assetIndex = Number(asset.index || 0);
    if (!assetIndex) return;
    if (existingAssetIndexes.has(assetIndex)) {
      skipped += 1;
      return;
    }
    const templateName = uniqueTemplateName(digitalAssetName(asset), existingNames, `模板${accountCount + 1}`);
    appendTemplateManagerRow({
      id: newTemplateId(),
      name: templateName,
      assetIndex,
      enabled: true,
      isNew: true,
      config: newTemplateDefaultConfig()
    }, totalCount, targetAccount);
    existingAssetIndexes.add(assetIndex);
    existingNames.push(templateName);
    totalCount += 1;
    accountCount += 1;
    added += 1;
  });
  if (!added) {
    if (hint) hint.textContent = `${templateManagerAccountName(targetAccount)} 已经包含全部数字人形象。`;
    return;
  }
  if (hint) hint.textContent = `已添加 ${added} 个模板到 ${templateManagerAccountName(targetAccount)}，正在刷新...`;
  try {
    await saveAssetManager({ close: false, quiet: true });
    appendLog(`[模板] 已添加并保存 ${added} 个模板到 ${templateManagerAccountName(targetAccount)}${skipped ? `，跳过 ${skipped} 个已有形象` : ''}\n`);
    closeAddTemplateModal();
    closeAssetManager();
  } catch (error) {
    if (hint) hint.textContent = `模板保存失败：${error.message}`;
    appendLog(`[模板保存失败] ${error.message}\n`, true);
  }
}

async function addAllTemplatesFromButton() {
  const targetAccount = Number($('assetAddAllAccountIndex')?.value || 0);
  const hint = assetManagerHintElement();
  if (!targetAccount) {
    if (hint) hint.textContent = '请先选择账号。';
    return;
  }
  await addAllTemplateRowsInManager(targetAccount);
}

async function addTemplateRowInManager() {
  const list = $('assetList');
  const targetAccount = Number($('assetManagerTemplateAccountIndex')?.value || 0);
  const sourceValue = String($('assetManagerSourceAssetIndex')?.value || '');
  const assetIndex = Number(sourceValue || 0);
  if (!targetAccount) {
    const hint = assetManagerHintElement();
    if (hint) hint.textContent = '请先选择归属账号，或在这里新建一个账号。';
    return;
  }
  if (!list || !assetIndex || !enabledAssetByIndex(assetIndex)) {
    const hint = assetManagerHintElement();
    if (hint) hint.textContent = '请先选择模板人物形象。';
    return;
  }
  templateManagerAccountIndex = targetAccount;
  list.querySelector('.empty-account')?.remove();
  const rows = Array.from(list.querySelectorAll('[data-template-id]'));
  const count = rows.length;
  const defaultName = nextTemplateNameForAssetInManager(targetAccount, assetIndex);
  const templateName = String($('assetManagerTemplateName')?.value || '').trim() || defaultName;
  appendTemplateManagerRow({
    id: newTemplateId(),
    name: templateName,
    assetIndex,
    enabled: true,
    isNew: false,
    config: newTemplateDefaultConfig()
  }, count, targetAccount);
  const hint = assetManagerHintElement();
  if (hint) hint.textContent = `已添加 ${templateName} 到 ${templateManagerAccountName(templateManagerAccountIndex)}，正在刷新...`;
  try {
    await saveAssetManager({ close: false, quiet: true });
    appendLog(`[模板] 已添加并保存 ${templateName} 到 ${templateManagerAccountName(templateManagerAccountIndex)}\n`);
    closeAddTemplateModal();
    closeAssetManager();
  } catch (error) {
    if (hint) hint.textContent = `模板保存失败：${error.message}`;
    appendLog(`[模板保存失败] ${error.message}\n`, true);
  }
}

function renderAssetManager() {
  const list = $('assetList');
  if (!list) return;
  const accounts = templateManagerAccounts();
  const templatesByAccount = normalizeAccountTemplates(settings.accountTemplates);
  renderTemplateManagerAccountFilter();
  list.innerHTML = '';
  if (!accounts.length) {
    const hint = $('assetModalHint');
    if (hint) hint.textContent = '请点击“添加模板”，选择模板人物形象，并在归属账号下拉框中新建账号。';
    return;
  }
  let count = 0;
  accounts.forEach((_account, accountOffset) => {
    const accountIndex = accountOffset + 1;
    const templates = templatesByAccount[accountIndex] || [];
    templates.forEach((template) => appendTemplateManagerRow(template, count++, accountIndex));
  });
  if (!count) {
    const hint = $('assetModalHint');
    if (hint) hint.textContent = '还没有模板，请点击“添加模板”。';
    return;
  }
  applyTemplateManagerAccountFilter();
}

function templateManagerTemplatesByAccount() {
  const currentByAccount = normalizeAccountTemplates(settings.accountTemplates);
  const rows = Array.from(document.querySelectorAll('[data-template-id]'));
  const positions = {};
  const grouped = {};
  rows.forEach((row) => {
    const accountIndex = Math.max(1, Number(row.dataset.templateAccountIndex || 1));
    const current = currentByAccount[accountIndex] || [];
    const byId = new Map(current.map((template) => [template.id, template]));
    const id = row.dataset.templateId;
    const original = byId.get(id) || {};
    positions[accountIndex] = (positions[accountIndex] || 0) + 1;
    const template = {
      ...original,
      id,
      enabled: true,
      assetIndex: Number(row.dataset.templateAssetIndex || original.assetIndex || 1),
      config: original.config || templateManagerDraftConfigs.get(id) || newTemplateDefaultConfig()
    };
    template.name = row.querySelector('[data-template-name]')?.value?.trim() ||
      templateNameFromAsset(template.assetIndex, `模板${positions[accountIndex]}`);
    if (!grouped[accountIndex]) grouped[accountIndex] = [];
    grouped[accountIndex].push(template);
  });
  return normalizeAccountTemplates(grouped);
}

function openAssetManager() {
  if (settings.currentTemplateId) {
    stashCurrentTemplate();
  }
  templateManagerDraftConfigs = new Map();
  templateManagerDraftAccounts = normalizeAccountManagerEntries(settings.chanjingAccounts);
  templateManagerAccountIndex = settings.chanjingAccountIndex || firstAccountWithEnabledTemplate() || (templateManagerDraftAccounts.length ? 1 : 0);
  templateManagerFilterAccountIndexes = new Set();
  renderAssetManagerTemplateAccountOptions(String(templateManagerAccountIndex || ''));
  renderAssetManager();
  $('assetModal').hidden = false;
}

function closeAssetManager() {
  templateManagerDraftConfigs = new Map();
  templateManagerDraftAccounts = [];
  $('assetModal').hidden = true;
}

async function saveAssetManager(options = {}) {
  const closeAfterSave = options.close !== false;
  const quiet = options.quiet === true;
  const accounts = normalizeAccounts(templateManagerDraftAccounts);
  const baseSettings = collectSettings();
  const accountTemplates = templateManagerTemplatesByAccount();
  const enabledEntries = [];
  for (const [accountKey, list] of Object.entries(accountTemplates)) {
    const accountIndex = Math.max(1, Number(accountKey || 1));
    list.forEach((template) => {
      if (template.enabled !== false) enabledEntries.push({ accountIndex, template });
    });
  }
  const currentAccount = accounts.length
    ? clampNumber(Number(baseSettings.chanjingAccountIndex || settings.chanjingAccountIndex || 1), 1, accounts.length)
    : 0;
  const currentTemplateStillEnabled = enabledEntries.find((entry) => (
    entry.accountIndex === currentAccount && entry.template.id === settings.currentTemplateId
  ));
  const targetAccount = accounts.length
    ? clampNumber(Number(templateManagerAccountIndex || currentAccount || 1), 1, accounts.length)
    : 0;
  const targetAccountEntry = enabledEntries.find((entry) => entry.accountIndex === targetAccount) || null;
  const currentAccountEntry = enabledEntries.find((entry) => entry.accountIndex === currentAccount) || null;
  const selectedEntry = currentTemplateStillEnabled || targetAccountEntry || currentAccountEntry || null;
  const nextAccount = accounts.length ? (selectedEntry?.accountIndex || currentAccount || 1) : 0;
  const nextId = selectedEntry?.template?.id || '';

  settings = await window.huApp.saveSettings({
    ...baseSettings,
    chanjingAccounts: accounts,
    accountTemplates,
    chanjingAccountIndex: nextAccount,
    runChanjingAccountIndex: accounts.length
      ? clampNumber(Number(baseSettings.runChanjingAccountIndex || nextAccount || 1), 1, accounts.length)
      : 0,
    currentTemplateId: nextId,
    chanjingAssetIndex: selectedEntry?.template?.assetIndex || 0
  });
  fillSettings(settings);
  renderChanjingAccountOptions();
  renderRunAccountOptions();
  await refreshChanjingAssets();

  refreshPreviewBackground();
  updatePreviewSetupState();
  if (closeAfterSave) {
    closeAssetManager();
  }
  if (!quiet) {
    appendLog(`[模板] 已保存 ${enabledEntries.length} 个模板\n`);
  }
}

async function refreshChanjingAssets() {
  if (!window.huApp?.listChanjingAssets) return;
  try {
    chanjingAssets = await window.huApp.listChanjingAssets(collectSettings());
  } catch (_error) {
    chanjingAssets = [];
  }
  renderTemplateSourceAssetOptions();
  renderAssetManagerSourceAssetOptions();
  renderTemplateOptions();
  updateChanjingAssetHint();
  renderRowTemplateControls();
  updatePreviewSetupState();
}

function switchAccountAssetTemplate(nextAccountIndex, nextTemplateId) {
  if (!accountCount()) {
    settings.chanjingAccountIndex = 0;
    settings.runChanjingAccountIndex = 0;
    renderChanjingAccountOptions();
    renderRunAccountOptions();
    renderTemplateOptions();
    updateChanjingAssetHint();
    updatePreviewSetupState();
    return;
  }
  const previousAccount = Number(settings.chanjingAccountIndex || 1);
  const previousTemplateId = settings.currentTemplateId;
  if (previousTemplateId) {
    stashCurrentTemplate(previousAccount, previousTemplateId);
  }

  const account = clampNumber(Number(nextAccountIndex || 1), 1, accountCount());
  if (!accountHasEnabledTemplate(account)) {
    const hint = $('chanjingAssetHint');
    if (hint) hint.textContent = `${accountName(account)} 下没有模板，请先在模板管理里添加模板。`;
    renderChanjingAccountOptions();
    renderTemplateOptions();
    updatePreviewSetupState();
    return;
  }
  const template = templateById(account, nextTemplateId, false) || firstEnabledTemplate(account);
  const nextConfig = template?.config || templateFallback();
  const nextSettings = {
    ...settings,
    ...nextConfig,
    chanjingAccountIndex: account,
    currentTemplateId: template?.id || '',
    chanjingAssetIndex: template?.assetIndex || 0
  };
  fillSettings(nextSettings);
  renderChanjingAccountOptions();
  renderRunAccountOptions();
  renderTemplateOptions();
  updateChanjingAssetHint();
  updatePreviewSetupState();
  refreshPreviewBackground();
}

async function addTemplateFromSelectedAsset() {
  if (!accountCount()) {
    updatePreviewSetupState();
    return;
  }
  const assetIndex = Number($('templateSourceAssetIndex')?.value || settings.templateSourceAssetIndex || 0);
  if (!assetIndex || !enabledAssetByIndex(assetIndex)) {
    const hint = $('chanjingAssetHint');
    if (hint) hint.textContent = '请先选择模板人物形象。';
    return;
  }
  if (settings.currentTemplateId) {
    stashCurrentTemplate(settings.chanjingAccountIndex, settings.currentTemplateId);
  }
  const account = Math.max(1, Number(settings.chanjingAccountIndex || 1));
  const accountTemplates = normalizeAccountTemplates(settings.accountTemplates);
  const list = accountTemplates[account] || [];
  const templateName = nextTemplateNameForAssetInList(assetIndex, list);
  const template = {
    id: newTemplateId(),
    name: templateName,
    assetIndex,
    enabled: true,
    config: newTemplateDefaultConfig()
  };
  list.push(template);
  accountTemplates[account] = list;
  settings = await window.huApp.saveSettings({
    ...collectSettings(),
    accountTemplates,
    currentTemplateId: template.id,
    chanjingAssetIndex: assetIndex,
    templateSourceAssetIndex: assetIndex
  });
  fillSettings(settings);
  renderChanjingAccountOptions();
  renderRunAccountOptions();
  await refreshChanjingAssets();
  refreshPreviewBackground();
  updatePreviewSetupState();
  appendLog(`[模板] 已添加 ${template.name}，绑定 ${digitalAssetName(enabledAssetByIndex(assetIndex))}\n`);
}

async function resetPreviewLayoutToDefaults() {
  for (const [kind, defaults] of Object.entries(previewDefaults)) {
    setPreviewBox(kind, defaults, false);
  }
  const defaultSizes = { titleFontSize: 144, captionFontSize: 96 };
  for (const [id, value] of Object.entries(defaultSizes)) {
    const source = $(id);
    if (source) source.value = String(value);
    syncPreviewStyleControls(id);
  }
  selectPreviewBox($('previewObject')?.value || 'title');
  applyPreviewTextStyle();
  settings = await window.huApp.saveSettings(collectSettings());
  fillSettings(settings);
  appendLog('[预览] 已恢复默认布局\n');
}

function beginPreviewDrag(event) {
  const boxEl = event.currentTarget;
  const kind = boxEl.dataset.previewBox;
  if (!kind) return;
  selectPreviewBox(kind);
  const mode = event.target.classList.contains('preview-resize-handle') ? 'resize' : 'move';
  previewDragState = {
    kind,
    mode,
    startX: event.clientX,
    startY: event.clientY,
    box: getPreviewBox(kind)
  };
  boxEl.setPointerCapture(event.pointerId);
  event.preventDefault();
}

function syncFontSizeFromPreviewResize(kind) {
  const box = getPreviewBox(kind);
  const updates = {};
  if (kind === 'title') {
    updates.titleFontSize = Math.round(clampNumber(box.h * 0.3, 48, 220));
  } else if (kind === 'caption') {
    updates.captionFontSize = Math.round(clampNumber(box.h * 0.44, 36, 160));
  }
  for (const [id, value] of Object.entries(updates)) {
    const source = $(id);
    if (!source) continue;
    source.value = String(value);
    syncPreviewStyleControls(id);
  }
  if (Object.keys(updates).length) {
    schedulePreviewLayoutUpdate();
  }
}

function movePreviewDrag(event) {
  if (!previewDragState) return;
  const scale = previewScale() || 1;
  const dx = (event.clientX - previewDragState.startX) / scale;
  const dy = (event.clientY - previewDragState.startY) / scale;
  const next = { ...previewDragState.box };
  if (previewDragState.mode === 'resize') {
    if (previewDefaults[previewDragState.kind]?.fixedAspect) {
      next.h += dy;
      next.w = next.h * previewDefaults[previewDragState.kind].fixedAspect;
    } else {
      next.w += dx;
      next.h += dy;
    }
  } else {
    next.x += dx;
    next.y += dy;
  }
  setPreviewBox(previewDragState.kind, next);
  if (previewDragState.mode === 'resize') {
    syncFontSizeFromPreviewResize(previewDragState.kind);
  }
}

function endPreviewDrag() {
  previewDragState = null;
}

async function saveSettings() {
  settings = await window.huApp.saveSettings(collectSettings());
  fillSettings(settings);
  renderChanjingAccountOptions();
  renderRunAccountOptions();
  await refreshChanjingAssets();
  refreshPreviewBackground();
  updatePreviewSetupState();
  appendLog('[设置] 已保存\n');
}

async function applyCurrentTemplateLayout(scope = 'account') {
  const current = collectSettings();
  const account = Math.max(1, Number(current.chanjingAccountIndex || settings.chanjingAccountIndex || 1));
  const templateId = String(current.currentTemplateId || settings.currentTemplateId || '');
  const accountTemplates = normalizeAccountTemplates(current.accountTemplates);
  const sourceList = accountTemplates[account] || [];
  const sourceTemplate = sourceList.find((template) => template.id === templateId);
  if (!sourceTemplate) {
    appendLog('[模板] 请先选择一个已保存的模板，再应用布局。\n', true);
    return;
  }

  const targetAccounts = scope === 'all'
    ? Object.keys(accountTemplates).map((key) => Math.max(1, Number(key || 1))).filter((value, index, list) => list.indexOf(value) === index)
    : [account];
  const targetCount = targetAccounts.reduce((total, accountIndex) => total + (accountTemplates[accountIndex] || []).length, 0);
  if (!targetCount) {
    appendLog('[模板] 没有可应用的目标模板。\n', true);
    return;
  }

  const scopeText = scope === 'all' ? '所有账号下的全部模板' : `${accountName(account)} 下的全部模板`;
  const warning = [
    `警告：即将把当前模板「${sourceTemplate.name}」的布局和样式应用到${scopeText}。`,
    `本次会覆盖 ${targetCount} 个模板的标题、字幕、花字、声明、Logo、画中画位置和相关样式配置。`,
    '每个模板原来绑定的数字人形象会保留不变。',
    '此操作不能自动撤回，建议已经提前导出配置备份。',
    '',
    '确认继续应用吗？'
  ].join('\n');
  if (!window.confirm(warning)) return;

  const sourceConfig = cloneTemplateValue(sourceTemplate.config || captureTemplate(current));
  const nextTemplates = normalizeAccountTemplates(accountTemplates);
  targetAccounts.forEach((accountIndex) => {
    nextTemplates[accountIndex] = (nextTemplates[accountIndex] || []).map((template) => ({
      ...template,
      assetIndex: Math.max(1, Number(template.assetIndex || 1)),
      config: cloneTemplateValue(sourceConfig)
    }));
  });

  settings = await window.huApp.saveSettings({
    ...current,
    accountTemplates: nextTemplates,
    chanjingAccountIndex: account,
    currentTemplateId: templateId,
    chanjingAssetIndex: sourceTemplate.assetIndex
  });
  fillSettings(settings);
  renderChanjingAccountOptions();
  renderRunAccountOptions();
  renderTemplateOptions();
  await refreshChanjingAssets();
  refreshPreviewBackground();
  updatePreviewSetupState();
  appendLog(`[模板] 已将「${sourceTemplate.name}」布局应用到${scopeText}，共 ${targetCount} 个模板；数字人形象保持不变。\n`);
}

async function refreshAfterSettingsImport(nextSettings) {
  settings = nextSettings || await window.huApp.loadSettings();
  fillSettings(settings);
  renderChanjingAccountOptions();
  renderRunAccountOptions();
  renderTemplateOptions();
  await refreshChanjingAssets();
  renderRowTemplateControls();
  syncTemplateSelectionUi();
  refreshPreviewBackground();
  updatePreviewSetupState();
  schedulePreviewLayoutUpdate();
}

async function exportSettingsConfig() {
  try {
    const current = collectSettings();
    const result = await window.huApp.exportSettings(current);
    if (!result) return;
    settings = result.settings || await window.huApp.loadSettings();
    fillSettings(settings);
    appendLog(`[配置] 已导出：${result.filePath}\n`);
  } catch (error) {
    appendLog(`[配置导出失败] ${error.message}\n`, true);
    setStatus('配置导出失败', 'error');
  }
}

async function importSettingsConfig() {
  try {
    const result = await window.huApp.importSettings();
    if (!result) return;
    await refreshAfterSettingsImport(result.settings);
    appendLog(`[配置] 已导入：${result.filePath}\n`);
    setStatus('配置已导入');
  } catch (error) {
    appendLog(`[配置导入失败] ${error.message}\n`, true);
    setStatus('配置导入失败', 'error');
  }
}

function renderSummary(summary) {
  currentSummary = summary || null;
  $('summaryName').textContent = summary?.meta?.name || '未命名任务';
  updateSelectedCount();
  const body = $('itemsTable');
  body.innerHTML = '';
  if (!summary || !summary.items.length) {
    body.innerHTML = '<tr><td colspan="9" class="empty">还没有导入任务</td></tr>';
    updateSelectAllState();
    updateAssetSelectionModeUi();
    return;
  }
  for (const item of summary.items) {
    const tr = document.createElement('tr');
    tr.dataset.rowIndex = String(item.index);
    tr.dataset.rowSlug = item.slug;
    const titleText = (item.titleLines?.length ? item.titleLines : [item.title || '']).join('\n');
    const contentText = contentForItem(item);
    tr.innerHTML = `
      <td class="select-col"><input class="row-selector" data-row-select="${item.index}" type="checkbox" checked /></td>
      <td>${item.index}</td>
      <td class="asset-cell" data-asset-column>
        <select class="asset-select" data-row-template-id="${item.index}">
          ${rowAssetOptionsHtml(defaultRowTemplateSelection())}
        </select>
      </td>
      <td>${escapeHtml(String(item.code || item.id || ''))}</td>
      <td>${escapeHtml(item.topic || '')}</td>
      <td class="title-cell">
        <div class="title-view" data-title-view="${item.index}">${titleDisplayHtml(titleText)}</div>
        <textarea class="title-editor" data-title-slug="${escapeHtml(item.slug)}" data-title-index="${item.index}" rows="3" hidden>${escapeHtml(titleText)}</textarea>
        <div class="title-actions">
          <button class="button secondary small-button" data-title-edit="${item.index}" type="button">修改</button>
          <button class="button primary small-button" data-title-save="${item.index}" type="button" hidden>保存</button>
          <button class="button secondary small-button" data-title-cancel="${item.index}" type="button" hidden>取消</button>
        </div>
      </td>
      <td class="content-cell"><button class="button secondary small-button" data-content-edit="${item.index}" type="button">编辑</button></td>
      <td data-row-chars="${item.index}">${contentText.length}</td>
      <td class="time-cell" data-row-time="${item.index}"><span>未开始</span><span class="time-secondary"></span></td>
    `;
    body.appendChild(tr);
  }
  bindRowSelectors();
  bindTitleEditors();
  bindContentEditors();
  renderRowTemplateControls();
  applyTemplateModeToRows(currentAssetSelectionMode());
  updateSelectedCount();
  updateSelectAllState();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function titleLinesFromText(value) {
  return String(value || '')
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function titleDisplayHtml(value) {
  const lines = titleLinesFromText(value);
  return lines.length ? lines.map(escapeHtml).join('<br />') : '<span class="muted">未设置标题</span>';
}

function titleEditorForIndex(index) {
  return document.querySelector(`[data-title-index="${index}"]`);
}

function setTitleEditing(index, editing) {
  const row = rowForIndex(index);
  const editor = titleEditorForIndex(index);
  const view = document.querySelector(`[data-title-view="${index}"]`);
  const edit = document.querySelector(`[data-title-edit="${index}"]`);
  const save = document.querySelector(`[data-title-save="${index}"]`);
  const cancel = document.querySelector(`[data-title-cancel="${index}"]`);
  if (!row || !editor || !view || !edit || !save || !cancel) return;
  if (editing && row.classList.contains('row-locked')) return;
  if (editing) {
    editor.dataset.editOriginal = editor.value;
  }
  editor.hidden = !editing;
  view.hidden = editing;
  edit.hidden = editing;
  save.hidden = !editing;
  cancel.hidden = !editing;
  if (editing) {
    editor.focus();
  }
}

function saveTitleEdit(index) {
  const editor = titleEditorForIndex(index);
  const view = document.querySelector(`[data-title-view="${index}"]`);
  if (!editor || !view || rowIsLocked(index)) return;
  const lines = titleLinesFromText(editor.value);
  if (!lines.length) return;
  editor.value = lines.join('\n');
  view.innerHTML = titleDisplayHtml(editor.value);
  setTitleEditing(index, false);
  if (!running || index > lockedThroughIndex) {
    scheduleTitleOverrideSync();
  }
}

function cancelTitleEdit(index) {
  const editor = titleEditorForIndex(index);
  if (!editor) return;
  if (Object.prototype.hasOwnProperty.call(editor.dataset, 'editOriginal')) {
    editor.value = editor.dataset.editOriginal;
  }
  setTitleEditing(index, false);
}

function currentItemByIndex(index) {
  return currentSummary?.items?.find((item) => Number(item.index) === Number(index)) || null;
}

function overrideKeysForItem(item) {
  if (!item) return [];
  return [
    item.slug,
    String(item.code || ''),
    String(item.id || ''),
    String(item.index || '')
  ].filter(Boolean);
}

function contentForItem(item) {
  for (const key of overrideKeysForItem(item)) {
    if (Object.prototype.hasOwnProperty.call(contentOverrides, key)) {
      return String(contentOverrides[key] || '');
    }
  }
  return String(item?.content || '');
}

function collectContentOverrides() {
  return { ...contentOverrides };
}

function updateContentCharCount() {
  const editor = $('contentEditor');
  if (!editor) return;
  $('contentCharCount').textContent = `${editor.value.length} 字`;
}

function rowIsLocked(index) {
  return rowForIndex(index)?.classList.contains('row-locked') || false;
}

function openContentEditor(index) {
  const item = currentItemByIndex(index);
  if (!item) return;
  editingContentIndex = Number(index);
  const locked = rowIsLocked(index);
  $('contentModalTitle').textContent = `编辑内容：第 ${index} 行`;
  $('contentEditor').value = contentForItem(item);
  $('contentEditor').disabled = locked;
  $('btnSaveContentEdit').disabled = locked;
  $('contentLockedHint').textContent = locked ? '该行已经开始或完成，只能查看' : '';
  updateContentCharCount();
  $('contentModal').hidden = false;
  $('contentEditor').focus();
}

function closeContentEditor() {
  editingContentIndex = 0;
  $('contentModal').hidden = true;
}

function saveContentEditor() {
  const item = currentItemByIndex(editingContentIndex);
  if (!item || rowIsLocked(editingContentIndex)) {
    closeContentEditor();
    return;
  }
  const text = $('contentEditor').value.trim();
  if (!text) {
    $('contentLockedHint').textContent = '内容不能为空';
    return;
  }
  item.content = text;
  item.chars = text.length;
  contentOverrides[item.slug] = text;
  const charsCell = document.querySelector(`[data-row-chars="${editingContentIndex}"]`);
  if (charsCell) charsCell.textContent = String(text.length);
  scheduleContentOverrideSync();
  closeContentEditor();
}

function updateCustomTextCharCount() {
  const editor = $('customTextEditor');
  if (!editor) return;
  $('customTextCharCount').textContent = `${editor.value.length} 字`;
}

function openCustomTextEditor() {
  const hint = $('customTextHint');
  if (hint) hint.textContent = '正文只做标点规范，不改文字内容。';
  updateCustomTextCharCount();
  $('customTextModal').hidden = false;
  $('customTextEditor').focus();
}

function closeCustomTextEditor() {
  if (customTextSaving) return;
  $('customTextModal').hidden = true;
}

async function saveCustomTextEditor() {
  if (customTextSaving) return;
  const editor = $('customTextEditor');
  const text = editor.value.trim();
  const hint = $('customTextHint');
  if (!text) {
    if (hint) hint.textContent = '请先粘贴文案';
    return;
  }
  customTextSaving = true;
  const saveButton = $('btnSaveCustomText');
  const cancelButton = $('btnCancelCustomText');
  saveButton.disabled = true;
  cancelButton.disabled = true;
  saveButton.textContent = '生成中...';
  if (hint) hint.textContent = '正在调用模型整理文案...';
  try {
    const result = await window.huApp.saveCustomText({
      name: '自定义文案',
      text,
      settings: collectSettings()
    });
    inputJsonPath = result.filePath;
    const selectedJsonName = $('selectedJsonName');
    if (selectedJsonName) {
      selectedJsonName.textContent = result.filePath.split(/[\\/]/).pop() || result.filePath;
      selectedJsonName.title = result.filePath;
    }
    contentOverrides = {};
    renderSummary(result.summary);
    resetRunRows();
    generatePreviewTitle();
    generatePreviewCaption();
    refreshPreviewBackground();
    appendLog(`[自定义文案] 已生成 ${result.summary?.count || 0} 条任务\n`);
    $('customTextModal').hidden = true;
  } catch (error) {
    if (hint) hint.textContent = error.message || '模型整理失败';
    appendLog(`[自定义文案失败] ${error.message}\n`, true);
  } finally {
    customTextSaving = false;
    saveButton.disabled = false;
    cancelButton.disabled = false;
    saveButton.textContent = '生成任务';
    updateCustomTextCharCount();
  }
}

function collectTitleOverrides() {
  const overrides = {};
  document.querySelectorAll('[data-title-slug]').forEach((el) => {
    const lines = el.value
      .split(/\r?\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 3);
    if (lines.length) {
      overrides[el.dataset.titleSlug] = lines;
    }
  });
  return overrides;
}

function collectSelectedIndexes() {
  return Array.from(document.querySelectorAll('[data-row-select]:checked'))
    .filter((el) => !el.disabled)
    .map((el) => Number(el.dataset.rowSelect || 0))
    .filter((index) => index > 0)
    .sort((a, b) => a - b);
}

function collectTemplateAssignments(selectedIndexes = collectSelectedIndexes()) {
  const choices = allTemplateChoices();
  const assignments = {};
  if (!choices.length) return assignments;
  const fallback = templateChoiceValue(choices[0].accountIndex, choices[0].template.id);
  for (const index of selectedIndexes) {
    const value = String(document.querySelector(`[data-row-template-id="${index}"]`)?.value || '');
    assignments[index] = templateChoiceByValue(value) ? value : fallback;
  }
  return assignments;
}

function ensureTemplatesForRun(current) {
  current.accountTemplates = normalizeAccountTemplates(settings.accountTemplates);
  return current;
}

function firstSelectedIndex() {
  const selected = collectSelectedIndexes();
  return selected.length ? selected[0] : 0;
}

function updateSelectedCount() {
  const total = currentSummary?.count || 0;
  if (!total) {
    $('summaryCount').textContent = '0';
    return;
  }
  const selectors = document.querySelectorAll('[data-row-select]');
  const selected = selectors.length ? collectSelectedIndexes().length : total;
  $('summaryCount').textContent = `${selected}/${total}`;
}

function updateSelectAllState() {
  const selectAll = $('selectAllRows');
  if (!selectAll) return;
  const selectors = Array.from(document.querySelectorAll('[data-row-select]')).filter((el) => !el.disabled);
  const checked = selectors.filter((el) => el.checked).length;
  selectAll.checked = selectors.length > 0 && checked === selectors.length;
  selectAll.indeterminate = checked > 0 && checked < selectors.length;
  selectAll.disabled = selectors.length === 0;
}

function bindRowSelectors() {
  document.querySelectorAll('[data-row-select]').forEach((el) => {
    el.addEventListener('change', () => {
      updateSelectedCount();
      updateSelectAllState();
    });
  });
}

function bindTitleEditors() {
  document.querySelectorAll('[data-title-slug]').forEach((el) => {
    el.addEventListener('input', () => {});
  });
  document.querySelectorAll('[data-title-edit]').forEach((el) => {
    el.addEventListener('click', () => {
      setTitleEditing(Number(el.dataset.titleEdit || 0), true);
    });
  });
  document.querySelectorAll('[data-title-save]').forEach((el) => {
    el.addEventListener('click', () => {
      saveTitleEdit(Number(el.dataset.titleSave || 0));
    });
  });
  document.querySelectorAll('[data-title-cancel]').forEach((el) => {
    el.addEventListener('click', () => {
      cancelTitleEdit(Number(el.dataset.titleCancel || 0));
    });
  });
}

function bindContentEditors() {
  document.querySelectorAll('[data-content-edit]').forEach((el) => {
    el.addEventListener('click', () => {
      openContentEditor(Number(el.dataset.contentEdit || 0));
    });
  });
}

function rows() {
  return Array.from(document.querySelectorAll('[data-row-index]'));
}

function rowForIndex(index) {
  return document.querySelector(`[data-row-index="${index}"]`);
}

function setRowLocked(row, locked) {
  row.classList.toggle('row-locked', locked);
  const rowIndex = Number(row.dataset.rowIndex || 0);
  if (locked && rowIndex) {
    setTitleEditing(rowIndex, false);
  }
  row.querySelectorAll('[data-title-slug]').forEach((el) => {
    el.disabled = locked;
  });
  row.querySelectorAll('[data-title-edit]').forEach((el) => {
    el.disabled = locked;
    el.textContent = '修改';
  });
  row.querySelectorAll('[data-content-edit]').forEach((el) => {
    el.textContent = locked ? '查看' : '编辑';
  });
  row.querySelectorAll('[data-row-template-id]').forEach((el) => {
    el.disabled = locked;
  });
}

function setSelectorsLocked(locked) {
  document.querySelectorAll('[data-row-select]').forEach((el) => {
    el.disabled = locked;
  });
  const clipButton = $('clipConfigButton');
  if (clipButton) {
    clipButton.disabled = locked;
    if (locked) setClipConfigOpen(false);
  }
  const selectAll = $('selectAllRows');
  if (selectAll) {
    selectAll.disabled = locked || !currentSummary?.count;
  }
  const templateButton = $('templateSelectionButton');
  if (templateButton) {
    templateButton.disabled = locked;
    if (locked) setTemplateSelectionOpen(false);
  }
  const runAccount = $('runChanjingAccountIndex');
  if (runAccount) runAccount.disabled = locked || !accountCount();
  const assetMode = $('assetSelectionMode');
  if (assetMode) assetMode.disabled = locked;
  updateAssetSelectionModeUi();
  syncTemplateSelectionUi();
  updateActiveRunSelectionLocks();
}

function resetRunRows() {
  lockedThroughIndex = 0;
  activeRunIndexes = new Set();
  resetTimingState();
  rows().forEach((row) => {
    row.classList.remove('row-running', 'row-done', 'row-failed', 'row-locked');
    setRowLocked(row, false);
  });
  setSelectorsLocked(false);
  updateSelectAllState();
}

function lockRowsThrough(index) {
  lockedThroughIndex = Math.max(lockedThroughIndex, Number(index) || 0);
  const queuedIndexes = queuedRunIndexes();
  rows().forEach((row) => {
    const rowIndex = Number(row.dataset.rowIndex || 0);
    const shouldLock = queuedIndexes.has(rowIndex) || row.classList.contains('row-done') || row.classList.contains('row-failed');
    setRowLocked(row, shouldLock);
  });
  updateActiveRunSelectionLocks();
}

function setRunningRow(index) {
  lockRowsThrough(index);
  rows().forEach((row) => row.classList.remove('row-running'));
  const row = rowForIndex(index);
  if (row && !row.classList.contains('row-done')) {
    row.classList.add('row-running');
  }
}

function markDoneRow(index) {
  lockRowsThrough(index);
  const row = rowForIndex(index);
  if (row) {
    row.classList.remove('row-running');
    row.classList.add('row-done');
    setRowLocked(row, true);
  }
}

function markFailedRow(index) {
  lockRowsThrough(index);
  const row = rowForIndex(index);
  if (row) {
    row.classList.remove('row-running');
    row.classList.add('row-failed');
    setRowLocked(row, true);
  }
}

function scheduleTitleOverrideSync() {
  clearTimeout(titleUpdateTimer);
  titleUpdateTimer = setTimeout(syncTitleOverrides, 250);
}

function scheduleContentOverrideSync() {
  clearTimeout(contentUpdateTimer);
  contentUpdateTimer = setTimeout(syncContentOverrides, 250);
}

async function syncTitleOverrides() {
  clearTimeout(titleUpdateTimer);
  titleUpdateTimer = null;
  if (!running || !activeQueueMatchesCurrentInput()) return;
  try {
    await window.huApp.updateTitleOverrides(collectTitleOverrides());
  } catch (error) {
    appendLog(`[标题同步失败] ${error.message}\n`, true);
  }
}

async function syncContentOverrides() {
  clearTimeout(contentUpdateTimer);
  contentUpdateTimer = null;
  if (!running || !activeQueueMatchesCurrentInput()) return;
  try {
    await window.huApp.updateContentOverrides(collectContentOverrides());
  } catch (error) {
    appendLog(`[内容同步失败] ${error.message}\n`, true);
  }
}

function handleRunEvent(event) {
  const updateCurrentRows = activeQueueMatchesCurrentInput();
  if (event.event === 'item_start') {
    const index = Number(event.index);
    const startedAt = eventTimeMs(event, 'started_at');
    if (!updateCurrentRows) return;
    rowTimings.set(index, { startedAt, doneAt: null });
    setRowTime(index, '进行中 0:00', `开始 ${formatTimestamp(startedAt)}`);
    startRowClock();
    setRunningRow(index);
  } else if (event.event === 'item_done') {
    const index = Number(event.index);
    const doneAt = eventTimeMs(event, 'completed_at');
    const existing = rowTimings.get(index) || {};
    const startedAt = existing.startedAt || eventTimeMs(event, 'started_at', doneAt);
    const elapsedMs = Number.isFinite(Number(event.elapsed_seconds))
      ? Number(event.elapsed_seconds) * 1000
      : Math.max(0, doneAt - startedAt);
    if (updateCurrentRows) {
      rowTimings.set(index, { startedAt, doneAt, elapsedMs });
      markDoneRow(index);
      setRowTime(index, `完成 ${formatDuration(elapsedMs)}`, `完成 ${formatTimestamp(doneAt)}`);
      stopRowClockIfIdle();
    }
    appendLog(`[成功 ${formatTimestamp(doneAt)}] 第 ${index} 行，用时 ${formatDuration(elapsedMs)}，输出：${event.output || ''}\n`);
  } else if (event.event === 'item_failed') {
    const index = Number(event.index);
    const failedAt = eventTimeMs(event, 'failed_at');
    const existing = rowTimings.get(index) || {};
    const startedAt = existing.startedAt || eventTimeMs(event, 'started_at', failedAt);
    const elapsedMs = Number.isFinite(Number(event.elapsed_seconds))
      ? Number(event.elapsed_seconds) * 1000
      : Math.max(0, failedAt - startedAt);
    currentRunFailures += 1;
    if (updateCurrentRows) {
      rowTimings.set(index, { startedAt, doneAt: failedAt, elapsedMs, failed: true });
      markFailedRow(index);
      setRowTime(index, `失败 ${formatDuration(elapsedMs)}`, `失败 ${formatTimestamp(failedAt)}`);
      stopRowClockIfIdle();
    }
    appendLog(`[失败 ${formatTimestamp(failedAt)}] 第 ${index} 行，用时 ${formatDuration(elapsedMs)}：${event.error || '未知错误'}\n`, true);
  } else if (event.event === 'job_done') {
    if (updateCurrentRows) {
      rows().forEach((row) => {
        if (row.classList.contains('row-done')) {
          setRowLocked(row, true);
        }
      });
    }
    if (Number(event.failed || 0) > 0) {
      appendLog(`[完成] 成功 ${event.succeeded || 0} 条，失败 ${event.failed || 0} 条\n`);
    }
  }
}

function parseRunLog(text) {
  stdoutBuffer += text;
  const lines = stdoutBuffer.split(/\r?\n/);
  stdoutBuffer = lines.pop() || '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      handleRunEvent(JSON.parse(trimmed));
    } catch {
      // 普通日志不需要处理。
    }
  }
}

function validateBeforeRun() {
  const current = collectSettings();
  const required = [
    ['bundlePath', '素材包目录'],
    ['outputDir', '输出目录'],
    ['chanjingAppId', '蝉镜 AK / App ID'],
    ['chanjingSecretKey', '蝉镜 SK / Secret Key'],
    ['modelBaseUrl', '模型接口 URL'],
    ['modelApiKey', '模型 API Key'],
    ['modelName', '模型名'],
    ['titleTopFontPath', '标题上行字体文件'],
    ['titleMiddleFontPath', '标题中行字体文件'],
    ['titleBottomFontPath', '标题下行字体文件'],
    ['captionFontPath', '字幕字体文件'],
    ['textEffectFontPath', '花字字体文件'],
    ['disclaimerFontPath', '底部声明字体文件']
  ];
  if (current.clipBgm && !normalizeMediaLibrary(current.bgmLibrary, mediaLibraryConfigs.bgm.extensions).length) {
    required.push(['bgmFile', 'BGM 文件']);
  }
  for (const [key, label] of required) {
    if (!current[key]) {
      throw new Error(`请先填写：${label}`);
    }
  }
  if (!normalizeAccounts(current.chanjingAccounts).length) {
    throw new Error('请先添加账号');
  }
  if (!allTemplateChoices().length) {
    throw new Error('请至少添加一个模板');
  }
  if (current.clipTitleMotion) {
    if (current.useOpeningVideoFile && !current.openingVideoFile) {
      throw new Error('请先选择：指定开头视频文件');
    }
    if (
      !current.useOpeningVideoFile
      && !current.openingVideoFolder
      && !normalizeMediaLibrary(current.openingVideoLibrary, mediaLibraryConfigs.openingVideo.extensions).length
    ) {
      throw new Error('请先填写：开头视频文件夹');
    }
  }
  if (current.clipPip) {
    const pipRows = normalizePipRules(current.pipRules);
    const pipRuleSourceReady = (rule) => rule.useVideoFile ? Boolean(rule.videoFile) : Boolean(rule.videoFolder);
    const hasPartialPipRow = pipRows.some((rule) => !rule.keywords || !pipRuleSourceReady(rule));
    const hasCompletePipRow = pipRows.some((rule) => rule.keywords && pipRuleSourceReady(rule));
    if (hasPartialPipRow) {
      throw new Error('自定义画中画每一行都要填写关键词，并按“使用指定”状态填写素材文件或素材文件夹');
    }
    if (current.usePipMaterialFile && !current.pipMaterialFile) {
      throw new Error('请先选择：指定画中画素材文件');
    }
    if (
      !hasCompletePipRow
      && !current.usePipMaterialFile
      && !current.pipFolder
      && !normalizeMediaLibrary(current.pipMaterialLibrary, mediaLibraryConfigs.pipMaterial.extensions).length
    ) {
      throw new Error('请先填写：画中画文件夹');
    }
    if (!hasCompletePipRow && !String(current.pipKeywords || '').trim()) {
      throw new Error('请先填写：画中画触发关键词');
    }
  }
  if (current.clipFullScreenPip) {
    if (current.useFullScreenPipMaterialFile && !current.fullScreenPipMaterialFile) {
      throw new Error('请先选择：指定全屏画中画素材文件');
    }
    if (
      !current.useFullScreenPipMaterialFile
      && !current.fullScreenPipFolder
      && !normalizeMediaLibrary(current.fullScreenPipMaterialLibrary, mediaLibraryConfigs.fullScreenPipMaterial.extensions).length
    ) {
      throw new Error('请先填写：全屏画中画素材文件夹');
    }
    if (!String(current.fullScreenPipKeywords || '').trim()) {
      throw new Error('请先填写：全屏画中画触发关键词');
    }
  }
  if (current.clipTextEffects && !current.textEffectIds.length) {
    throw new Error('请至少勾选一种花字效果');
  }
  if (current.clipLogo && current.useLogoFile && !current.logoFile) {
    throw new Error('请先选择：指定 Logo 图片');
  }
  if (current.clipLogo && !current.useLogoFile && !current.logoFolder) {
    throw new Error('请先填写：Logo 文件夹');
  }
  if (current.clipTextEffects && current.useSfxFile && !current.sfxFile) {
    throw new Error('请先选择：指定音效文件');
  }
  if (
    current.clipTextEffects
    && !current.useSfxFile
    && !current.sfxFolder
    && !normalizeMediaLibrary(current.sfxLibrary, mediaLibraryConfigs.sfx.extensions).length
  ) {
    throw new Error('请先填写：音效文件夹');
  }
  if (current.useSfxFile && !current.sfxFile) {
    throw new Error('请先选择：指定音效文件');
  }
  if (!inputJsonPath) {
    throw new Error('请先选择生成文案或自定义文案');
  }
  if (!collectSelectedIndexes().length) {
    throw new Error('请至少勾选一行出片');
  }
  if (currentAssetSelectionMode() === 'fixed_template' && !fixedTemplateChoice()) {
    throw new Error('请先选择指定账号下的可用模板');
  }
  const missing = collectSelectedIndexes().find((index) => {
    const value = String(document.querySelector(`[data-row-template-id="${index}"]`)?.value || '');
    return !templateChoiceByValue(value);
  });
  if (missing) {
    throw new Error(`第 ${missing} 行还没有选择可用账号模板`);
  }
  return current;
}

async function startRun() {
  if (!running && !activeQueueItem) {
    queueStopRequested = false;
  }
  let current;
  try {
    current = validateBeforeRun();
  } catch (error) {
    appendLog(`[检查失败] ${error.message}\n`, true);
    setStatus('配置不完整', 'error');
    return;
  }
  const selectedIndexes = collectSelectedIndexes();
  const templateAssignments = collectTemplateAssignments(selectedIndexes);
  current = ensureTemplatesForRun(current, templateAssignments);
  try {
    settings = await window.huApp.saveSettings(current);
  } catch (error) {
    setStatus('保存配置失败', 'error');
    appendLog(`[保存配置失败] ${error.message}\n`, true);
    return;
  }

  const queueId = ++queueSeq;
  const createdAt = Date.now();
  const batchOutputName = `任务${compactTimestamp(createdAt)}第${String(queueId).padStart(3, '0')}批`;
  const item = {
    id: queueId,
    name: currentSummary?.meta?.name || '未命名任务',
    status: 'pending',
    selectedIndexes: [...selectedIndexes],
    createdAt,
    batchOutputName,
    startedAt: 0,
    completedAt: 0,
    failures: 0,
    exitCode: null,
    error: '',
    payload: {
      settings: cloneForQueue(settings),
      inputJsonPath,
      selectedIndexes: [...selectedIndexes],
      batchOutputName,
      assetAssignments: cloneForQueue(templateAssignments),
      templateAssignments: cloneForQueue(templateAssignments),
      titleOverrides: cloneForQueue(collectTitleOverrides()),
      contentOverrides: cloneForQueue(collectContentOverrides())
    }
  };
  runQueue.push(item);
  lockPendingQueueRows();
  clearSelectedRows();
  renderQueue();
  appendLog(`[队列] 已加入第 ${item.id} 批：第 ${queueRowsText(selectedIndexes)} 行\n`);
  setStatus(running ? '已加入队列，等待执行' : '已加入队列', running ? 'running' : '');
  startNextQueueBatch();
}

async function startNextQueueBatch() {
  if (running || activeQueueItem) return;
  if (queueStopRequested) {
    $('btnCancel').disabled = true;
    renderQueue();
    setStatus('队列已停止');
    return;
  }
  const item = runQueue.find((entry) => entry.status === 'pending');
  if (!item) {
    $('btnCancel').disabled = true;
    renderQueue();
    setStatus('空闲');
    return;
  }

  activeQueueItem = item;
  item.status = 'running';
  item.startedAt = Date.now();
  item.completedAt = 0;
  item.failures = 0;
  item.exitCode = null;
  item.error = '';
  running = true;
  stdoutBuffer = '';
  stdoutTail = '';
  stderrTail = '';
  currentRunFailures = 0;
  resetRowsForQueueItem(item);
  activeRunIndexes = new Set(item.selectedIndexes || []);
  lockActiveQueueRows();
  if (activeQueueMatchesCurrentInput()) {
    setRunningRow(item.selectedIndexes[0]);
  }
  $('btnRun').disabled = false;
  $('btnCancel').disabled = false;
  setStatus(`队列运行中：第 ${item.id} 批`, 'running');
  renderQueue();

  try {
    await window.huApp.startRun(item.payload);
  } catch (error) {
    running = false;
    item.status = 'failed';
    item.completedAt = Date.now();
    item.failures = currentRunFailures || 1;
    item.error = error.message || '启动失败';
    markUnfinishedActiveRowsFailed();
    activeQueueItem = null;
    activeRunIndexes = new Set();
    updateActiveRunSelectionLocks();
    $('btnCancel').disabled = true;
    setStatus('启动失败', 'error');
    appendLog(`[启动失败] ${error.message}\n`, true);
    renderQueue();
    if (!queueStopRequested && runQueue.some((entry) => entry.status === 'pending')) {
      setTimeout(startNextQueueBatch, 0);
    }
  }
}

async function cancelRun() {
  queueStopRequested = true;
  const stoppedAt = Date.now();
  let stoppedPending = 0;
  runQueue.forEach((item) => {
    if (item.status !== 'pending') return;
    item.status = 'stopped';
    item.completedAt = stoppedAt;
    item.error = '已停止';
    stoppedPending += 1;
  });
  refreshQueueRowLocks();
  renderQueue();
  if (running || activeQueueItem) {
    await window.huApp.cancelRun();
    setStatus('正在停止整个队列', 'error');
    appendLog(`[停止] 已请求停止整个队列${stoppedPending ? `，已停止等待任务 ${stoppedPending} 批` : ''}\n`);
  } else {
    queueStopRequested = false;
    $('btnCancel').disabled = true;
    setStatus('队列已停止');
    appendLog(`[停止] 队列已停止${stoppedPending ? `，已停止等待任务 ${stoppedPending} 批` : ''}\n`);
  }
}

function switchSection(name) {
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.section === name);
  });
  document.querySelectorAll('.panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `section-${name}`);
  });
  if (name === 'preview') {
    updatePreviewSetupState();
    schedulePreviewLayoutUpdate();
  }
}

async function init() {
  fillSettings(await window.huApp.loadSettings());
  $('outputDir').value = settings.outputDir || '';
  renderChanjingAccountOptions();
  renderRunAccountOptions();
  await refreshChanjingAssets();
  refreshPreviewBackground();
  updatePreviewSetupState();
  renderQueue();

  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => switchSection(btn.dataset.section));
  });

  $('clipConfigButton')?.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!$('clipConfigButton').disabled) toggleClipConfigOpen();
  });
  $('clipConfigMenu')?.addEventListener('click', (event) => {
    event.stopPropagation();
  });
  $('previewVisibilityButton')?.addEventListener('click', (event) => {
    event.stopPropagation();
    togglePreviewVisibilityOpen();
  });
  $('previewVisibilityMenu')?.addEventListener('click', (event) => {
    event.stopPropagation();
  });
  document.querySelectorAll('[data-preview-visibility]').forEach((input) => {
    input.addEventListener('change', () => {
      const checked = document.querySelectorAll('[data-preview-visibility]:checked');
      if (!checked.length) {
        input.checked = true;
      }
      updatePreviewVisibilityFromInputs();
    });
  });
  optionalClipFields.forEach((field) => {
    $(field)?.addEventListener('change', syncClipConfigUi);
  });
  document.querySelectorAll('[data-text-effect-id]').forEach((el) => {
    el.addEventListener('change', () => {
      settings.textEffectIds = Array.from(document.querySelectorAll('[data-text-effect-id]:checked'))
        .map((input) => input.dataset.textEffectId)
        .filter((id) => textEffectIds.includes(id));
    });
  });
  document.addEventListener('click', () => {
    setClipConfigOpen(false);
    setPreviewVisibilityOpen(false);
  });
  $('btnAddPipRule')?.addEventListener('click', () => addPipRuleRow());
  $('btnAddTextEffectKeywordRule')?.addEventListener('click', () => addTextEffectKeywordRuleRow());
  $('btnImportFonts')?.addEventListener('click', importFontsToLibrary);
  $('fontLibraryList')?.addEventListener('click', (event) => {
    const remove = event.target.closest('[data-font-library-remove]');
    if (!remove) return;
    remove.closest('[data-font-library-path]')?.remove();
    settings.fontLibrary = collectFontLibraryFromUi();
    renderFontLibrary();
    syncFontSelectControls();
  });
  $('fontLibraryList')?.addEventListener('input', (event) => {
    if (!event.target.closest('[data-font-library-name]')) return;
    settings.fontLibrary = collectFontLibraryFromUi();
    syncFontSelectControls();
  });
  Object.entries(mediaLibraryConfigs).forEach(([kind, config]) => {
    $(config.importButtonId)?.addEventListener('click', () => importMediaLibrary(kind));
    $(config.importFolderButtonId)?.addEventListener('click', () => importMediaLibraryFolder(kind));
    $(config.listId)?.addEventListener('click', (event) => {
      const remove = event.target.closest('[data-media-library-remove]');
      if (!remove) return;
      remove.closest('[data-media-library-path]')?.remove();
      settings[config.settingKey] = collectMediaLibraryFromUi(kind);
      renderMediaLibrary(kind);
    });
    $(config.listId)?.addEventListener('input', (event) => {
      if (!event.target.closest('[data-media-library-name]')) return;
      settings[config.settingKey] = collectMediaLibraryFromUi(kind);
      renderMediaLibrarySelect(kind);
    });
    $(config.selectId)?.addEventListener('change', () => {
      const target = $(config.fileFieldId);
      if (target) target.value = $(config.selectId).value;
      settings[config.fileFieldId] = $(config.selectId).value;
    });
    $(config.fileFieldId)?.addEventListener('input', () => {
      renderMediaLibrarySelect(kind);
    });
  });
  $('pipRuleList')?.addEventListener('click', async (event) => {
    const removeButton = event.target.closest('[data-pip-rule-remove]');
    if (removeButton) {
      removeButton.closest('[data-pip-rule-row]')?.remove();
      return;
    }
    const pickFolderButton = event.target.closest('[data-pip-rule-pick-folder]');
    if (pickFolderButton) {
      const selected = await window.huApp.chooseDirectory();
      if (!selected) return;
      const row = pickFolderButton.closest('[data-pip-rule-row]');
      const input = row?.querySelector('[data-pip-rule-folder]');
      if (input) input.value = selected;
      return;
    }
    const pickButton = event.target.closest('[data-pip-rule-pick]');
    if (!pickButton) return;
    const selected = await window.huApp.chooseFile({
      filters: [{ name: 'Media', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v', 'png', 'jpg', 'jpeg', 'webp'] }]
    });
    if (!selected) return;
    const row = pickButton.closest('[data-pip-rule-row]');
    const input = row?.querySelector('[data-pip-rule-video]');
    if (input) input.value = selected;
    const useSpecified = row?.querySelector('[data-pip-rule-use-video]');
    if (useSpecified) useSpecified.checked = true;
  });
  $('textEffectKeywordRuleList')?.addEventListener('click', (event) => {
    const removeButton = event.target.closest('[data-text-effect-keyword-rule-remove]');
    if (removeButton) {
      removeButton.closest('[data-text-effect-keyword-rule-row]')?.remove();
    }
  });

  document.querySelectorAll('[data-preview-box]').forEach((box) => {
    box.addEventListener('pointerdown', beginPreviewDrag);
    box.addEventListener('pointermove', movePreviewDrag);
    box.addEventListener('pointerup', endPreviewDrag);
    box.addEventListener('pointercancel', endPreviewDrag);
  });

  $('previewObject').addEventListener('change', () => {
    selectPreviewBox($('previewObject').value);
  });
  ['previewCurrentCenterOffsetX', 'previewCurrentW', 'previewCurrentH'].forEach((id) => {
    $(id).addEventListener('input', updateSelectedPreviewBoxFromControls);
  });
  $('btnCenterPreviewObject')?.addEventListener('click', () => {
    const offset = $('previewCurrentCenterOffsetX');
    if (offset) offset.value = '0';
    updateSelectedPreviewBoxFromControls();
  });
  ['pipX', 'pipY', 'pipHeight'].forEach((id) => {
    $(id)?.addEventListener('input', () => {
      syncPreviewPipFromStyleFields();
      if ($('previewObject')?.value === 'pip') {
        fillPreviewCurrentControls('pip');
      }
    });
  });
  $('btnManageAccounts')?.addEventListener('click', openAccountManager);
  $('btnManageAssets')?.addEventListener('click', openAssetManager);
  $('btnOpenAddTemplate')?.addEventListener('click', openAddTemplateModal);
  $('btnOpenTemplateFromEmpty')?.addEventListener('click', openAddTemplateModal);
  $('btnResetPreviewLayout').addEventListener('click', resetPreviewLayoutToDefaults);
  $('btnSavePreviewSettings').addEventListener('click', saveSettings);
  $('btnApplyTemplateLayoutToAccount')?.addEventListener('click', () => applyCurrentTemplateLayout('account'));
  $('btnApplyTemplateLayoutToAll')?.addEventListener('click', () => applyCurrentTemplateLayout('all'));
  $('templateSelectionButton')?.addEventListener('click', toggleTemplateSelectionOpen);
  document.addEventListener('click', (event) => {
    const dropdown = $('templateSelectionDropdown');
    if (dropdown && !dropdown.contains(event.target)) {
      setTemplateSelectionOpen(false);
    }
  });
  document.querySelectorAll('[name="templateSelectionMode"]').forEach((input) => {
    input.addEventListener('change', handleTemplateSelectionModeChange);
  });
  ['runRandomAccountList', 'runRotateAccountList'].forEach((id) => {
    $(id)?.addEventListener('change', (event) => {
      handleRunAccountSelectionChange(id === 'runRotateAccountList' ? 'rotate' : 'random', event);
      syncRunAccountHiddenFields();
      const mode = currentAssetSelectionMode();
      if (
        (mode === 'random_account' && id === 'runRandomAccountList')
        || (mode === 'rotate_account' && id === 'runRotateAccountList')
      ) {
        applyTemplateModeToRows(mode);
      } else {
        syncTemplateSelectionUi();
      }
      updatePreviewSetupState();
    });
  });
  $('runFixedAccountIndex')?.addEventListener('change', () => {
    settings.runFixedAccountIndex = Number($('runFixedAccountIndex').value || 0);
    settings.runFixedTemplateId = '';
    renderRunFixedTemplateOptions();
    if (currentAssetSelectionMode() === 'fixed_template') {
      applyTemplateModeToRows('fixed_template');
    } else {
      syncTemplateSelectionUi();
    }
    updatePreviewSetupState();
  });
  $('runFixedTemplateId')?.addEventListener('change', () => {
    settings.runFixedTemplateId = $('runFixedTemplateId').value || '';
    if (currentAssetSelectionMode() === 'fixed_template') {
      applyTemplateModeToRows('fixed_template');
    } else {
      syncTemplateSelectionUi();
    }
    updatePreviewSetupState();
  });
  $('chanjingAccountIndex')?.addEventListener('change', () => {
    switchAccountAssetTemplate($('chanjingAccountIndex').value, $('currentTemplateId')?.value || settings.currentTemplateId);
  });
  $('currentTemplateId')?.addEventListener('change', () => {
    switchAccountAssetTemplate($('chanjingAccountIndex')?.value || settings.chanjingAccountIndex || 1, $('currentTemplateId').value);
  });
  $('templateSourceAssetIndex')?.addEventListener('change', () => {
    settings.templateSourceAssetIndex = Number($('templateSourceAssetIndex').value || 0);
  });
  $('btnAddTemplateFromAsset')?.addEventListener('click', addTemplateFromSelectedAsset);
  document.querySelector('#section-preview .preview-scroll')?.addEventListener('scroll', schedulePreviewLayoutUpdate);
  document.querySelectorAll('#section-preview details').forEach((details) => {
    details.addEventListener('toggle', schedulePreviewLayoutUpdate);
  });
  window.addEventListener('resize', schedulePreviewLayoutUpdate);

  [
    'titleTopColor',
    'titleTopOutlineColor',
    'titleTopOutlineSize',
    'titleMiddleColor',
    'titleMiddleOutlineColor',
    'titleMiddleOutlineSize',
    'titleBottomColor',
    'titleBottomOutlineColor',
    'titleBottomOutlineSize',
    'captionColor',
    'captionOutlineColor',
    'captionOutlineSize',
    'textEffectColor',
    'textEffectOutlineColor',
    'textEffectOutlineSize',
    'disclaimerColor',
    'disclaimerOutlineColor',
    'disclaimerOutlineSize',
    'disclaimerOpacityPercent',
    'logoOpacityPercent'
  ].forEach((id) => {
    $(id)?.addEventListener('input', () => {
      syncPreviewStyleControls(id);
      applyPreviewTextStyle();
      schedulePreviewLayoutUpdate();
    });
  });

  ['disableSilenceTrim', 'trimSilenceEnabled', 'silenceMinSeconds', 'silenceKeepBufferSeconds'].forEach((id) => {
    const eventName = id === 'silenceMinSeconds' || id === 'silenceKeepBufferSeconds' ? 'input' : 'change';
    $(id)?.addEventListener(eventName, syncSilenceTrimFields);
  });

  ['videoSpeedEnabled', 'videoSpeedRate'].forEach((id) => {
    $(id)?.addEventListener('change', syncVideoSpeedFields);
  });

  $('sensitiveReplacementRuleList')?.addEventListener('input', (event) => {
    if (event.target.matches('[data-sensitive-from], [data-sensitive-to]')) {
      syncSensitiveReplacementRulesFromUi(true);
    }
  });
  $('sensitiveReplacementRuleList')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-sensitive-remove]');
    if (!button) return;
    const row = button.closest('.sensitive-replacement-row');
    row?.remove();
    const list = $('sensitiveReplacementRuleList');
    if (list && !list.querySelector('.sensitive-replacement-row')) {
      list.appendChild(sensitiveReplacementRowElement());
    }
    syncSensitiveReplacementRulesFromUi(true);
  });
  $('btnAddSensitiveReplacementRule')?.addEventListener('click', () => {
    const list = $('sensitiveReplacementRuleList');
    if (!list) return;
    list.appendChild(sensitiveReplacementRowElement());
    syncSensitiveReplacementRulesFromUi(false);
    const lastInput = list.querySelector('.sensitive-replacement-row:last-child [data-sensitive-from]');
    lastInput?.focus();
  });

  [
    'titleFontPath',
    'titleTopFontPath',
    'titleMiddleFontPath',
    'titleBottomFontPath',
    'captionFontPath',
    'textEffectFontPath',
    'disclaimerFontPath',
    'logoFolder',
    'logoFile',
    'useLogoFile'
  ].forEach((id) => {
    $(id)?.addEventListener('input', () => {
      syncPreviewStyleControls(id);
      if (id === 'logoFolder' || id === 'logoFile' || id === 'useLogoFile') {
        updatePreviewLogo();
      } else {
        updatePreviewFonts();
      }
      schedulePreviewLayoutUpdate();
    });
  });

  document.querySelectorAll('[data-preview-font-select]').forEach((select) => {
    select.addEventListener('change', () => {
      const target = select.dataset.previewFontSelect;
      const source = $(target);
      if (!source) return;
      source.value = select.value;
      syncPreviewStyleControls(target);
      updatePreviewFonts();
      schedulePreviewLayoutUpdate();
    });
  });

  document.querySelectorAll('[data-preview-style-target]').forEach((input) => {
    input.addEventListener('input', () => applyPreviewStyleProxy(input));
    input.addEventListener('change', () => applyPreviewStyleProxy(input));
  });

  document.querySelectorAll('[data-preview-pick-font]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const selected = await window.huApp.chooseFile({
        filters: [{ name: 'Fonts', extensions: ['ttf', 'otf', 'ttc'] }]
      });
      if (!selected) return;
      const target = btn.dataset.previewPickFont;
      const source = $(target);
      if (source) source.value = selected;
      syncPreviewStyleControls(target);
      updatePreviewFonts();
      schedulePreviewLayoutUpdate();
    });
  });

  document.querySelectorAll('[data-preview-pick-dir]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const selected = await window.huApp.chooseDirectory();
      if (!selected) return;
      const target = btn.dataset.previewPickDir;
      const source = $(target);
      if (source) source.value = selected;
      syncPreviewStyleControls(target);
      updatePreviewLogo();
      schedulePreviewLayoutUpdate();
    });
  });

  document.querySelectorAll('[data-pick-dir]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const target = btn.dataset.pickDir;
      const selected = await window.huApp.chooseDirectory();
      if (selected) {
        $(target).value = selected;
        syncPreviewStyleControls(target);
        if (target === 'logoFolder') updatePreviewLogo();
      }
    });
  });

  document.querySelectorAll('[data-pick-font]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const selected = await window.huApp.chooseFile({
        filters: [{ name: 'Fonts', extensions: ['ttf', 'otf', 'ttc'] }]
      });
      if (selected) {
        $(btn.dataset.pickFont).value = selected;
        syncPreviewStyleControls(btn.dataset.pickFont);
        updatePreviewFonts();
      }
    });
  });

  document.querySelectorAll('[data-pick-audio]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const selected = await window.huApp.chooseFile({
        filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg'] }]
      });
      if (selected) {
        $(btn.dataset.pickAudio).value = selected;
        if (btn.dataset.pickAudio === 'bgmFile') {
          renderMediaLibrarySelect('bgm');
        }
        if (btn.dataset.pickAudio === 'sfxFile' && $('useSfxFile')) {
          $('useSfxFile').checked = true;
          renderMediaLibrarySelect('sfx');
        }
      }
    });
  });

  document.querySelectorAll('[data-pick-video]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const selected = await window.huApp.chooseFile({
        filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v'] }]
      });
      if (selected) {
        $(btn.dataset.pickVideo).value = selected;
        if (btn.dataset.pickVideo === 'openingVideoFile' && $('useOpeningVideoFile')) {
          $('useOpeningVideoFile').checked = true;
          renderMediaLibrarySelect('openingVideo');
        }
      }
    });
  });

  document.querySelectorAll('[data-pick-media]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const selected = await window.huApp.chooseFile({
        filters: [
          { name: 'Media', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'pdf'] }
        ]
      });
      if (selected) {
        $(btn.dataset.pickMedia).value = selected;
        if (btn.dataset.pickMedia === 'pipMaterialFile') {
          if ($('usePipMaterialFile')) $('usePipMaterialFile').checked = true;
          renderMediaLibrarySelect('pipMaterial');
        }
        if (btn.dataset.pickMedia === 'fullScreenPipMaterialFile') {
          if ($('useFullScreenPipMaterialFile')) $('useFullScreenPipMaterialFile').checked = true;
          renderMediaLibrarySelect('fullScreenPipMaterial');
        }
      }
    });
  });

  document.querySelectorAll('[data-pick-image], [data-preview-pick-image]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const selected = await window.huApp.chooseFile({
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
      });
      if (!selected) return;
      const target = btn.dataset.pickImage || btn.dataset.previewPickImage;
      const source = $(target);
      if (source) source.value = selected;
      if (target === 'logoFile' && $('useLogoFile')) {
        $('useLogoFile').checked = true;
      }
      syncPreviewStyleControls(target);
      syncPreviewStyleControls('useLogoFile');
      updatePreviewLogo();
      schedulePreviewLayoutUpdate();
    });
  });

  $('btnLoadJson').addEventListener('click', async () => {
    const selected = await window.huApp.chooseFile({
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (!selected) return;
    inputJsonPath = selected;
    const selectedJsonName = $('selectedJsonName');
    if (selectedJsonName) {
      selectedJsonName.textContent = selected.split(/[\\/]/).pop() || selected;
      selectedJsonName.title = selected;
    }
    try {
      contentOverrides = {};
      renderSummary(await window.huApp.readJsonSummary(selected));
      generatePreviewTitle();
      generatePreviewCaption();
      refreshPreviewBackground();
      appendLog(`[导入] ${selected}\n`);
    } catch (error) {
      appendLog(`[JSON 错误] ${error.message}\n`, true);
      renderSummary(null);
      refreshPreviewBackground();
    }
  });
  $('btnCustomText')?.addEventListener('click', openCustomTextEditor);

  $('btnSaveSettings').addEventListener('click', saveSettings);
  $('btnExportSettings')?.addEventListener('click', exportSettingsConfig);
  $('btnImportSettings')?.addEventListener('click', importSettingsConfig);
  $('btnSaveStyleSettings').addEventListener('click', saveSettings);
  $('btnRun').addEventListener('click', startRun);
  $('btnCancel').addEventListener('click', cancelRun);
  $('queueList')?.addEventListener('click', (event) => {
    const remove = event.target.closest('[data-queue-remove]');
    if (!remove) return;
    removeQueueItem(remove.dataset.queueRemove);
  });
  $('selectAllRows').addEventListener('change', () => {
    const checked = $('selectAllRows').checked;
    document.querySelectorAll('[data-row-select]').forEach((el) => {
      if (!el.disabled) el.checked = checked;
    });
    updateSelectedCount();
    updateSelectAllState();
  });
  $('btnClearLog').addEventListener('click', () => {
    $('logBox').textContent = '';
  });
  $('contentEditor').addEventListener('input', updateContentCharCount);
  $('btnCloseContentModal').addEventListener('click', closeContentEditor);
  $('btnCancelContentEdit').addEventListener('click', closeContentEditor);
  $('btnSaveContentEdit').addEventListener('click', saveContentEditor);
  $('customTextEditor')?.addEventListener('input', updateCustomTextCharCount);
  $('btnCloseCustomTextModal')?.addEventListener('click', closeCustomTextEditor);
  $('btnCancelCustomText')?.addEventListener('click', closeCustomTextEditor);
  $('btnSaveCustomText')?.addEventListener('click', saveCustomTextEditor);
  $('btnCloseAccountModal')?.addEventListener('click', closeAccountManager);
  $('btnCancelAccountEdit')?.addEventListener('click', closeAccountManager);
  $('btnAddAccount')?.addEventListener('click', addAccountRow);
  $('btnSaveAccountEdit')?.addEventListener('click', saveAccountManager);
  $('accountList')?.addEventListener('click', (event) => {
    const rename = event.target.closest('[data-account-rename]');
    if (rename) {
      toggleAccountRename(rename.closest('.account-row'));
      return;
    }
    const remove = event.target.closest('[data-account-remove]');
    if (!remove) return;
    removeAccountRow(Number(remove.dataset.accountRemove || 0));
  });
  $('btnCloseAssetModal')?.addEventListener('click', closeAssetManager);
  $('btnCancelAssetEdit')?.addEventListener('click', closeAssetManager);
  $('btnSaveAssetEdit')?.addEventListener('click', saveAssetManager);
  $('assetAccountFilter')?.addEventListener('change', handleTemplateManagerAccountFilterChange);
  $('btnCloseAssetAddModal')?.addEventListener('click', closeAddTemplateModal);
  $('btnCancelAssetManagerAdd')?.addEventListener('click', closeAddTemplateModal);
  $('assetManagerSourceAssetIndex')?.addEventListener('change', () => {
    resetAssetManagerTemplateName(false);
    updateAssetManagerSourcePreview();
    updateAssetManagerAddButtonState();
  });
  $('btnOpenAddAllTemplates')?.addEventListener('click', openAddAllTemplatesModal);
  $('btnCloseAssetAddAllModal')?.addEventListener('click', cancelAddAllTemplatesModal);
  $('btnCancelAddAllTemplates')?.addEventListener('click', cancelAddAllTemplatesModal);
  $('btnConfirmAddAllTemplates')?.addEventListener('click', addAllTemplatesFromButton);
  $('assetAddAllAccountIndex')?.addEventListener('change', handleAssetAddAllAccountChange);
  $('btnAssetAddAllAddAccount')?.addEventListener('click', confirmAssetAddAllNewAccount);
  $('btnAssetAddAllCancelAccount')?.addEventListener('click', cancelAssetAddAllNewAccount);
  $('assetAddAllNewAccountName')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      confirmAssetAddAllNewAccount();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelAssetAddAllNewAccount();
    }
  });
  $('assetManagerTemplateAccountIndex')?.addEventListener('change', handleAssetManagerTemplateAccountChange);
  $('assetManagerTemplateName')?.addEventListener('input', () => {
    const input = $('assetManagerTemplateName');
    if (input) input.dataset.autofilled = 'false';
  });
  $('btnAssetManagerAddAccount')?.addEventListener('click', confirmAssetManagerNewAccount);
  $('btnAssetManagerCancelAccount')?.addEventListener('click', cancelAssetManagerNewAccount);
  $('assetManagerNewAccountName')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      confirmAssetManagerNewAccount();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelAssetManagerNewAccount();
    }
  });
  $('btnAssetManagerAddTemplate')?.addEventListener('click', addTemplateRowInManager);
  $('assetList')?.addEventListener('click', (event) => {
    const rename = event.target.closest('[data-template-rename]');
    if (rename) {
      toggleTemplateRename(rename.closest('[data-template-id]'));
      return;
    }
    const remove = event.target.closest('[data-template-remove]');
    if (!remove) return;
    templateManagerDraftConfigs.delete(remove.dataset.templateRemove || '');
    remove.closest('[data-template-id]')?.remove();
    renumberTemplateManagerRows();
    if (!$('assetList')?.querySelector('[data-template-id]')) {
      $('assetList').innerHTML = '';
    }
    const hint = $('assetModalHint');
    if (hint) hint.textContent = '模板已从列表移除，点击保存模板后生效。';
  });
  generatePreviewTitle();
  generatePreviewCaption();

  window.huApp.onLog((data) => {
    if (data.stream === 'stdout') {
      stdoutTail = appendTail(stdoutTail, data.text);
      parseRunLog(data.text);
    } else {
      stderrTail = appendTail(stderrTail, data.text);
    }
  });
  window.huApp.onDone((data) => {
    running = false;
    const finishedQueueItem = activeQueueItem;
    const stopRequested = queueStopRequested;
    if (rowClockTimer) {
      clearInterval(rowClockTimer);
      rowClockTimer = null;
    }
    clearTimeout(contentUpdateTimer);
    contentUpdateTimer = null;
    syncTitleOverrides();
    syncContentOverrides();
    setSelectorsLocked(false);
    updateSelectAllState();
    $('btnRun').disabled = false;
    $('btnCancel').disabled = true;
    if (stopRequested) {
      setStatus('队列已停止');
      appendLog('[停止] 队列已停止\n');
    } else if (data.code === 0) {
      setStatus(currentRunFailures ? `完成，失败 ${currentRunFailures} 条` : '完成', currentRunFailures ? 'error' : '');
      if (!currentRunFailures) {
        appendLog('[完成] 全部成功\n');
      }
    } else {
      setStatus('失败', 'error');
      appendLog(`[失败] 退出码 ${data.code}${data.error ? ` ${data.error}` : ''}\n`, true);
      if (stderrTail.trim()) {
        appendLog(`[错误详情]\n${stderrTail.trim()}\n`, true);
      }
      if (stdoutTail.trim()) {
        appendLog(`[运行尾部]\n${stdoutTail.trim()}\n`, true);
      }
    }
    if (finishedQueueItem) {
      const failed = !stopRequested && (data.code !== 0 || currentRunFailures > 0);
      if (failed) {
        markUnfinishedActiveRowsFailed();
      } else if (stopRequested) {
        markUnfinishedActiveRowsFailed();
      }
      finishedQueueItem.status = stopRequested ? 'stopped' : (failed ? 'failed' : 'done');
      finishedQueueItem.completedAt = Date.now();
      finishedQueueItem.failures = currentRunFailures;
      finishedQueueItem.exitCode = data.code;
      finishedQueueItem.error = stopRequested ? '已停止' : (data.error || '');
      activeQueueItem = null;
      activeRunIndexes = new Set();
      updateActiveRunSelectionLocks();
      renderQueue();
      if (stopRequested) {
        queueStopRequested = false;
        setStatus('队列已停止');
      } else if (runQueue.some((item) => item.status === 'pending')) {
        setTimeout(startNextQueueBatch, 0);
      }
    } else {
      renderQueue();
    }
  });
}

init();
