const fields = [
  'pythonPath',
  'bundlePath',
  'outputDir',
  'chanjingBaseUrl',
  'chanjingAppId',
  'chanjingSecretKey',
  'modelBaseUrl',
  'modelApiKey',
  'modelName',
  'titleFontPath',
  'captionFontPath',
  'textEffectFontPath',
  'disclaimerFontPath',
  'bgmFile',
  'bgmVolumePercent',
  'clipPreset',
  'clipTitle',
  'clipCaption',
  'clipBgm',
  'clipTitleMotion',
  'clipTextEffects',
  'clipPatent',
  'clipIntro',
  'clipPip',
  'bgmStartMode',
  'sfxMode',
  'sfxFolder',
  'sfxFile',
  'sfxVolumePercent',
  'useSfxFile',
  'keywordSfxEnabled',
  'keywordSfxKeywords',
  'openingVideoFolder',
  'openingVideoFile',
  'useOpeningVideoFile',
  'titleMotionPriority',
  'pipFolder',
  'pipKeywords',
  'pipRules',
  'pipPriority',
  'pipX',
  'pipY',
  'pipWidth',
  'pipHeight',
  'pipDurationSeconds',
  'pipCloseAtSentenceEnd',
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
  'disclaimerColor',
  'disclaimerOutlineColor',
  'disclaimerOutlineSize',
  'disclaimerOpacityPercent',
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
  'maxItems',
  'pollIntervalSeconds',
  'timeoutMinutes'
];

let settings = {};
let inputJsonPath = '';
let running = false;
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
let previewDragState = null;

const requiredClipFields = new Set(['clipTitle', 'clipCaption', 'clipBgm']);
const optionalClipFields = ['clipTitleMotion', 'clipIntro', 'clipPatent', 'clipPip', 'clipTextEffects'];
const textEffectIds = ['kinetic', 'slide-reveal', 'word-bounce', 'spring-up', 'bubble'];
const clipFieldLabels = {
  clipTitle: '标题',
  clipCaption: '字幕',
  clipBgm: 'BGM',
  clipTitleMotion: '标题动画',
  clipIntro: '身份背书',
  clipPatent: '专利',
  clipPip: '画中画',
  clipTextEffects: '花字'
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
const previewCanvas = { width: 1080, height: 1920 };
const previewSafeTextWidth = 980;
const previewTitleMinFontSize = 72;
const pipAspectRatio = 16 / 9;
const previewDefaults = {
  title: { prefix: 'previewTitle', x: 80, y: 980, w: 920, h: 500, minW: 260, minH: 170 },
  caption: { prefix: 'previewCaption', x: 100, y: 1385, w: 880, h: 220, minW: 280, minH: 90 },
  textEffect: { prefix: 'previewTextEffect', x: 100, y: 1385, w: 880, h: 220, minW: 280, minH: 90 },
  pip: { prefix: 'previewPip', x: 156, y: 910, w: 768, h: 432, minW: 142, minH: 80, fixedAspect: pipAspectRatio },
  disclaimer: { prefix: 'previewDisclaimer', x: 90, y: 1735, w: 900, h: 150, minW: 280, minH: 70 }
};

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
      videoFile: String(rule?.videoFile || '').trim(),
      priority: Number.isFinite(Number(rule?.priority)) ? Number(rule.priority) : ''
    }))
    .filter((rule) => rule.keywords || rule.videoFile || rule.priority !== '');
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
      videoFile: row.querySelector('[data-pip-rule-video]')?.value.trim() || '',
      priority: row.querySelector('[data-pip-rule-priority]')?.value === ''
        ? ''
        : Number(row.querySelector('[data-pip-rule-priority]')?.value)
    }))
    .filter((rule) => rule.keywords || rule.videoFile || rule.priority !== '');
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
      <input data-pip-rule-video value="${escapeHtml(rule.videoFile || '')}" placeholder="选择这一行使用的画中画视频" />
      <button class="icon-button" type="button" data-pip-rule-pick title="选择视频">...</button>
      <button class="icon-button danger" type="button" data-pip-rule-remove title="删除">×</button>
    </div>
  `;
  const priorityRow = document.createElement('label');
  priorityRow.className = 'pip-rule-priority';
  priorityRow.innerHTML = `
    <span>特效优先级（0-10，数字越小越优先）</span>
    <input data-pip-rule-priority type="number" min="0" max="10" step="1" value="${escapeHtml(rule.priority === '' || rule.priority === undefined ? '' : rule.priority)}" placeholder="跟随画中画" />
  `;
  row.appendChild(priorityRow);
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

function collectSettings() {
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
  requiredClipFields.forEach((field) => {
    next[field] = true;
  });
  next.pipX = Number(next.previewPipX || next.pipX || previewDefaults.pip.x);
  next.pipY = Number(next.previewPipY || next.pipY || previewDefaults.pip.y);
  next.pipHeight = Number(next.previewPipH || next.pipHeight || previewDefaults.pip.h);
  next.pipWidth = Math.round(next.pipHeight * pipAspectRatio);
  next.textEffectIds = Array.from(document.querySelectorAll('[data-text-effect-id]:checked'))
    .map((el) => el.dataset.textEffectId)
    .filter((id) => textEffectIds.includes(id));
  next.pipRules = collectPipRules();
  next.textEffectKeywordRules = collectTextEffectKeywordRules();
  next.clipPreset = clipPresetFromFlags(next);
  next.sfxMode = next.useSfxFile ? 'fixed' : 'random';
  return next;
}

function fillSettings(value) {
  settings = { ...(value || {}) };
  settings.previewPipX = settings.previewPipX ?? settings.pipX;
  settings.previewPipY = settings.previewPipY ?? settings.pipY;
  settings.previewPipH = settings.previewPipH ?? settings.pipHeight;
  settings.previewPipW = Math.round(Number(settings.previewPipH || previewDefaults.pip.h) * pipAspectRatio);
  settings.pipRules = normalizePipRules(settings.pipRules);
  settings.textEffectKeywordRules = normalizeTextEffectKeywordRules(settings.textEffectKeywordRules);
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
  document.querySelectorAll('[data-text-effect-id]').forEach((el) => {
    el.checked = selectedTextEffects.includes(el.dataset.textEffectId);
  });
  renderPipRules(settings.pipRules);
  renderTextEffectKeywordRules(settings.textEffectKeywordRules);
  settings.textEffectIds = selectedTextEffects;
  syncPipFieldsFromPreview(false);
  syncClipConfigUi();
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

function schedulePreviewLayoutUpdate() {
  window.requestAnimationFrame(() => {
    updatePreviewLayout();
  });
}

function previewTextFont(kind, size) {
  const family = kind === 'title'
    ? 'PreviewTitleFont, "Microsoft YaHei UI", sans-serif'
    : 'PreviewCaptionFont, "Microsoft YaHei UI", sans-serif';
  return `900 ${Math.max(1, Math.round(size))}px ${family}`;
}

const previewMeasureCanvas = document.createElement('canvas');
const previewMeasureContext = previewMeasureCanvas.getContext('2d');

function previewTextWidth(text, size, kind) {
  if (!previewMeasureContext) return String(text || '').length * size;
  previewMeasureContext.font = previewTextFont(kind, size);
  return previewMeasureContext.measureText(String(text || '')).width;
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

function previewDisplayText(value) {
  return String(value || '')
    .replaceAll('医', '醫')
    .replaceAll('药', '藥')
    .replaceAll('病', '疒');
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
    const titleBaseSize = clampNumber(box.h * 0.3, 72, 180);
    const top = el.querySelector('.preview-title-top');
    const middle = el.querySelector('.preview-title-middle');
    const bottom = el.querySelector('.preview-title-bottom');
    const topSize = fitPreviewAssFontSize([top?.textContent || ''], titleBaseSize, previewTitleMinFontSize, previewSafeTextWidth, 'title');
    const middleSize = fitPreviewAssFontSize([middle?.textContent || ''], titleBaseSize, previewTitleMinFontSize, previewSafeTextWidth, 'title');
    const bottomSize = fitPreviewAssFontSize([bottom?.textContent || ''], Math.round(titleBaseSize * 0.92), previewTitleMinFontSize, previewSafeTextWidth, 'title');
    top.style.fontSize = `${topSize * scale}px`;
    middle.style.fontSize = `${middleSize * scale}px`;
    bottom.style.fontSize = `${bottomSize * scale}px`;
  } else if (kind === 'caption') {
    el.style.fontSize = `${clampNumber(box.h * 0.44, 48, 128) * scale}px`;
  } else if (kind === 'textEffect') {
    el.style.fontSize = `${clampNumber(box.h * 0.44, 48, 128) * scale}px`;
  } else if (kind === 'disclaimer') {
    el.style.fontSize = `${clampNumber(box.h * 0.29, 24, 64) * scale}px`;
  }
}

function updatePreviewLayout() {
  for (const kind of Object.keys(previewDefaults)) {
    setPreviewBox(kind, getPreviewBox(kind), false);
  }
  selectPreviewBox($('previewObject')?.value || 'title');
  applyPreviewTextStyle();
}

function fillPreviewCurrentControls(kind = $('previewObject')?.value || 'title') {
  const box = getPreviewBox(kind);
  const mapping = { X: 'previewCurrentX', Y: 'previewCurrentY', W: 'previewCurrentW', H: 'previewCurrentH' };
  for (const [suffix, id] of Object.entries(mapping)) {
    const el = $(id);
    if (el) el.value = String(box[suffix.toLowerCase()]);
  }
  if ($('previewCurrentW')) {
    $('previewCurrentW').disabled = Boolean(previewDefaults[kind]?.fixedAspect);
  }
}

function updateSelectedPreviewBoxFromControls() {
  const kind = $('previewObject')?.value || 'title';
  setPreviewBox(kind, {
    x: Number($('previewCurrentX')?.value || 0),
    y: Number($('previewCurrentY')?.value || 0),
    w: Number($('previewCurrentW')?.value || 0),
    h: Number($('previewCurrentH')?.value || 0)
  }, false);
}

function selectPreviewBox(kind) {
  if (!$('previewObject')) return;
  $('previewObject').value = kind;
  document.querySelectorAll('[data-preview-box]').forEach((el) => {
    el.classList.toggle('selected', el.dataset.previewBox === kind);
  });
  fillPreviewCurrentControls(kind);
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
  const titleUrl = fileUrl($('titleFontPath')?.value || settings.titleFontPath);
  const captionUrl = fileUrl($('captionFontPath')?.value || settings.captionFontPath);
  const textEffectUrl = fileUrl($('textEffectFontPath')?.value || settings.textEffectFontPath || $('captionFontPath')?.value || settings.captionFontPath);
  const disclaimerUrl = fileUrl($('disclaimerFontPath')?.value || settings.disclaimerFontPath || $('captionFontPath')?.value || settings.captionFontPath);
  style.textContent = `
    ${titleUrl ? `@font-face{font-family:PreviewTitleFont;src:url("${titleUrl}");}` : ''}
    ${captionUrl ? `@font-face{font-family:PreviewCaptionFont;src:url("${captionUrl}");}` : ''}
    ${textEffectUrl ? `@font-face{font-family:PreviewTextEffectFont;src:url("${textEffectUrl}");}` : ''}
    ${disclaimerUrl ? `@font-face{font-family:PreviewDisclaimerFont;src:url("${disclaimerUrl}");}` : ''}
    .preview-title-box{font-family:PreviewTitleFont,"Microsoft YaHei UI",sans-serif;}
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

function applyPreviewTextStyle() {
  const titleTop = $('previewTitleBox')?.querySelector('.preview-title-top');
  const titleMiddle = $('previewTitleBox')?.querySelector('.preview-title-middle');
  const titleBottom = $('previewTitleBox')?.querySelector('.preview-title-bottom');
  const caption = $('previewCaptionBox');
  const textEffect = $('previewTextEffectBox');
  const disclaimer = $('previewDisclaimerBox');
  if (titleTop) {
    titleTop.style.color = $('titleTopColor')?.value || settings.titleTopColor || '#ffffff';
    applyPreviewOutline(titleTop, $('titleTopOutlineSize')?.value || settings.titleTopOutlineSize, $('titleTopOutlineColor')?.value || settings.titleTopOutlineColor);
  }
  if (titleMiddle) {
    titleMiddle.style.color = $('titleMiddleColor')?.value || settings.titleMiddleColor || '#ffde00';
    applyPreviewOutline(titleMiddle, $('titleMiddleOutlineSize')?.value || settings.titleMiddleOutlineSize, $('titleMiddleOutlineColor')?.value || settings.titleMiddleOutlineColor);
  }
  if (titleBottom) {
    titleBottom.style.color = $('titleBottomColor')?.value || settings.titleBottomColor || '#ff2a00';
    applyPreviewOutline(titleBottom, $('titleBottomOutlineSize')?.value || settings.titleBottomOutlineSize, $('titleBottomOutlineColor')?.value || settings.titleBottomOutlineColor);
  }
  if (caption) {
    caption.style.color = $('captionColor')?.value || settings.captionColor || '#ffffff';
    applyPreviewOutline(caption, $('captionOutlineSize')?.value || settings.captionOutlineSize, $('captionOutlineColor')?.value || settings.captionOutlineColor);
  }
  if (textEffect) {
    textEffect.style.color = $('captionColor')?.value || settings.captionColor || '#ffffff';
    applyPreviewOutline(textEffect, $('captionOutlineSize')?.value || settings.captionOutlineSize, $('captionOutlineColor')?.value || settings.captionOutlineColor);
  }
  if (disclaimer) {
    const opacity = clampNumber(Number($('disclaimerOpacityPercent')?.value || settings.disclaimerOpacityPercent || 50), 0, 100) / 100;
    disclaimer.style.color = $('disclaimerColor')?.value || settings.disclaimerColor || '#ffffff';
    disclaimer.style.opacity = String(opacity);
    applyPreviewOutline(disclaimer, $('disclaimerOutlineSize')?.value || settings.disclaimerOutlineSize, $('disclaimerOutlineColor')?.value || settings.disclaimerOutlineColor);
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
  const lines = titleLinesFromText(titleText || '糖尿病花钱多\n药也越来越多\n先看原因');
  const padded = [...lines, '', '', ''];
  const titleBox = $('previewTitleBox');
  if (!titleBox) return;
  titleBox.querySelector('.preview-title-top').textContent = previewDisplayLine(padded[0]);
  titleBox.querySelector('.preview-title-middle').textContent = previewDisplayLine(padded[1]);
  titleBox.querySelector('.preview-title-bottom').textContent = previewDisplayLine(padded[2]);
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
  const item = firstPreviewItem();
  const content = contentForItem(item) || '很多糖友嘴上不说，其实最担心的是花钱多。';
  const sentences = splitPreviewSentences(content);
  const sentence = sentences[3] || sentences[0] || content;
  const parts = sentence
    .split(/[，,。！？!?；;：:、]+/)
    .map(cleanPreviewCaptionLine)
    .filter(Boolean);
  const lines = parts.length >= 2 ? parts.slice(0, 2) : [cleanPreviewCaptionLine(sentence)];
  $('previewCaptionText').innerHTML = lines.map(escapeHtml).join('<br />');
  schedulePreviewLayoutUpdate();
}

function renderPreviewDisclaimer() {
  const text = '所有内容来自官方信息公示\n仅做咨询分享无不良引导\n如有不适请及时就医';
  const target = $('previewDisclaimerText');
  if (target) target.innerHTML = text.split('\n').map(escapeHtml).join('<br />');
  schedulePreviewLayoutUpdate();
}

async function resetPreviewLayoutToDefaults() {
  for (const [kind, defaults] of Object.entries(previewDefaults)) {
    setPreviewBox(kind, defaults, false);
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
}

function endPreviewDrag() {
  previewDragState = null;
}

async function saveSettings() {
  settings = await window.huApp.saveSettings(collectSettings());
  fillSettings(settings);
  appendLog('[设置] 已保存\n');
}

function renderSummary(summary) {
  currentSummary = summary || null;
  $('summaryName').textContent = summary?.meta?.name || '未命名任务';
  updateSelectedCount();
  const body = $('itemsTable');
  body.innerHTML = '';
  if (!summary || !summary.items.length) {
    body.innerHTML = '<tr><td colspan="8" class="empty">还没有导入任务</td></tr>';
    updateSelectAllState();
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
    .map((el) => Number(el.dataset.rowSelect || 0))
    .filter((index) => index > 0)
    .sort((a, b) => a - b);
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
  const selectors = Array.from(document.querySelectorAll('[data-row-select]'));
  const checked = selectors.filter((el) => el.checked).length;
  selectAll.checked = selectors.length > 0 && checked === selectors.length;
  selectAll.indeterminate = checked > 0 && checked < selectors.length;
  selectAll.disabled = running || selectors.length === 0;
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
}

function resetRunRows() {
  lockedThroughIndex = 0;
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
  rows().forEach((row) => {
    const rowIndex = Number(row.dataset.rowIndex || 0);
    const selected = row.querySelector('[data-row-select]')?.checked;
    setRowLocked(row, selected && rowIndex <= lockedThroughIndex);
  });
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
  if (!running) return;
  try {
    await window.huApp.updateTitleOverrides(collectTitleOverrides());
  } catch (error) {
    appendLog(`[标题同步失败] ${error.message}\n`, true);
  }
}

async function syncContentOverrides() {
  clearTimeout(contentUpdateTimer);
  contentUpdateTimer = null;
  if (!running) return;
  try {
    await window.huApp.updateContentOverrides(collectContentOverrides());
  } catch (error) {
    appendLog(`[内容同步失败] ${error.message}\n`, true);
  }
}

function handleRunEvent(event) {
  if (event.event === 'item_start') {
    const index = Number(event.index);
    const startedAt = eventTimeMs(event, 'started_at');
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
    rowTimings.set(index, { startedAt, doneAt, elapsedMs });
    markDoneRow(index);
    setRowTime(index, `完成 ${formatDuration(elapsedMs)}`, `完成 ${formatTimestamp(doneAt)}`);
    stopRowClockIfIdle();
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
    rowTimings.set(index, { startedAt, doneAt: failedAt, elapsedMs, failed: true });
    markFailedRow(index);
    setRowTime(index, `失败 ${formatDuration(elapsedMs)}`, `失败 ${formatTimestamp(failedAt)}`);
    stopRowClockIfIdle();
    appendLog(`[失败 ${formatTimestamp(failedAt)}] 第 ${index} 行，用时 ${formatDuration(elapsedMs)}：${event.error || '未知错误'}\n`, true);
  } else if (event.event === 'job_done') {
    rows().forEach((row) => {
      if (row.classList.contains('row-done')) {
        setRowLocked(row, true);
      }
    });
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
    ['titleFontPath', '标题字体文件'],
    ['captionFontPath', '字幕字体文件'],
    ['textEffectFontPath', '花字字体文件'],
    ['disclaimerFontPath', '底部声明字体文件']
  ];
  if (current.clipBgm) {
    required.push(['bgmFile', 'BGM 文件']);
  }
  for (const [key, label] of required) {
    if (!current[key]) {
      throw new Error(`请先填写：${label}`);
    }
  }
  if (current.clipTitleMotion) {
    if (current.useOpeningVideoFile && !current.openingVideoFile) {
      throw new Error('请先选择：指定开头视频文件');
    }
    if (!current.useOpeningVideoFile && !current.openingVideoFolder) {
      throw new Error('请先填写：开头视频文件夹');
    }
  }
  if (current.clipPip) {
    const pipRows = normalizePipRules(current.pipRules);
    const hasPartialPipRow = pipRows.some((rule) => !rule.keywords || !rule.videoFile);
    const hasCompletePipRow = pipRows.some((rule) => rule.keywords && rule.videoFile);
    if (hasPartialPipRow) {
      throw new Error('自定义画中画每一行都要同时填写关键词和视频文件');
    }
    if (!hasCompletePipRow && !current.pipFolder) {
      throw new Error('请先填写：画中画文件夹');
    }
    if (!hasCompletePipRow && !String(current.pipKeywords || '').trim()) {
      throw new Error('请先填写：画中画触发关键词');
    }
  }
  if (current.clipTextEffects && !current.textEffectIds.length) {
    throw new Error('请至少勾选一种花字效果');
  }
  if (current.clipTextEffects && current.useSfxFile && !current.sfxFile) {
    throw new Error('请先选择：指定音效文件');
  }
  if (current.clipTextEffects && !current.useSfxFile && !current.sfxFolder) {
    throw new Error('请先填写：音效文件夹');
  }
  if (current.useSfxFile && !current.sfxFile) {
    throw new Error('请先选择：指定音效文件');
  }
  if (!inputJsonPath) {
    throw new Error('请先选择 JSON 文件');
  }
  if (!collectSelectedIndexes().length) {
    throw new Error('请至少勾选一行出片');
  }
  return current;
}

async function startRun() {
  if (running) return;
  let current;
  try {
    current = validateBeforeRun();
  } catch (error) {
    appendLog(`[检查失败] ${error.message}\n`, true);
    setStatus('配置不完整', 'error');
    return;
  }
  settings = await window.huApp.saveSettings(current);
  const selectedIndexes = collectSelectedIndexes();
  running = true;
  stdoutBuffer = '';
  stdoutTail = '';
  stderrTail = '';
  currentRunFailures = 0;
  resetRunRows();
  setSelectorsLocked(true);
  setRunningRow(selectedIndexes[0]);
  $('btnRun').disabled = true;
  $('btnCancel').disabled = false;
  setStatus('运行中', 'running');
  try {
    await window.huApp.startRun({
      settings,
      inputJsonPath,
      selectedIndexes,
      titleOverrides: collectTitleOverrides(),
      contentOverrides: collectContentOverrides()
    });
  } catch (error) {
    running = false;
    resetRunRows();
    $('btnRun').disabled = false;
    $('btnCancel').disabled = true;
    setStatus('启动失败', 'error');
    appendLog(`[启动失败] ${error.message}\n`, true);
  }
}

async function cancelRun() {
  await window.huApp.cancelRun();
  appendLog('[停止] 已请求停止当前任务\n');
}

function switchSection(name) {
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.section === name);
  });
  document.querySelectorAll('.panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `section-${name}`);
  });
  if (name === 'preview') {
    schedulePreviewLayoutUpdate();
  }
}

async function init() {
  fillSettings(await window.huApp.loadSettings());
  $('outputDir').value = settings.outputDir || '';

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
  document.addEventListener('click', () => setClipConfigOpen(false));
  $('btnAddPipRule')?.addEventListener('click', () => addPipRuleRow());
  $('btnAddTextEffectKeywordRule')?.addEventListener('click', () => addTextEffectKeywordRuleRow());
  $('pipRuleList')?.addEventListener('click', async (event) => {
    const removeButton = event.target.closest('[data-pip-rule-remove]');
    if (removeButton) {
      removeButton.closest('[data-pip-rule-row]')?.remove();
      return;
    }
    const pickButton = event.target.closest('[data-pip-rule-pick]');
    if (!pickButton) return;
    const selected = await window.huApp.chooseFile({
      filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v'] }]
    });
    if (!selected) return;
    const row = pickButton.closest('[data-pip-rule-row]');
    const input = row?.querySelector('[data-pip-rule-video]');
    if (input) input.value = selected;
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
  ['previewCurrentX', 'previewCurrentY', 'previewCurrentW', 'previewCurrentH'].forEach((id) => {
    $(id).addEventListener('input', updateSelectedPreviewBoxFromControls);
  });
  ['pipX', 'pipY', 'pipHeight'].forEach((id) => {
    $(id)?.addEventListener('input', () => {
      syncPreviewPipFromStyleFields();
      if ($('previewObject')?.value === 'pip') {
        fillPreviewCurrentControls('pip');
      }
    });
  });
  $('btnPreviewTitle').addEventListener('click', generatePreviewTitle);
  $('btnPreviewCaption').addEventListener('click', generatePreviewCaption);
  $('btnResetPreviewLayout').addEventListener('click', resetPreviewLayoutToDefaults);
  $('btnSavePreviewSettings').addEventListener('click', saveSettings);
  window.addEventListener('resize', updatePreviewLayout);

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
    'disclaimerColor',
    'disclaimerOutlineColor',
    'disclaimerOutlineSize',
    'disclaimerOpacityPercent'
  ].forEach((id) => {
    $(id)?.addEventListener('input', applyPreviewTextStyle);
  });

  document.querySelectorAll('[data-pick-dir]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const target = btn.dataset.pickDir;
      const selected = await window.huApp.chooseDirectory();
      if (selected) $(target).value = selected;
    });
  });

  document.querySelectorAll('[data-pick-font]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const selected = await window.huApp.chooseFile({
        filters: [{ name: 'Fonts', extensions: ['ttf', 'otf', 'ttc'] }]
      });
      if (selected) {
        $(btn.dataset.pickFont).value = selected;
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
        if (btn.dataset.pickAudio === 'sfxFile' && $('useSfxFile')) {
          $('useSfxFile').checked = true;
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
      if (selected) $(btn.dataset.pickMedia).value = selected;
    });
  });

  $('btnLoadJson').addEventListener('click', async () => {
    const selected = await window.huApp.chooseFile({
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (!selected) return;
    inputJsonPath = selected;
    $('inputJsonPath').value = selected;
    try {
      contentOverrides = {};
      renderSummary(await window.huApp.readJsonSummary(selected));
      generatePreviewTitle();
      generatePreviewCaption();
      appendLog(`[导入] ${selected}\n`);
    } catch (error) {
      appendLog(`[JSON 错误] ${error.message}\n`, true);
      renderSummary(null);
    }
  });

  $('btnSaveSettings').addEventListener('click', saveSettings);
  $('btnSaveStyleSettings').addEventListener('click', saveSettings);
  $('btnRun').addEventListener('click', startRun);
  $('btnCancel').addEventListener('click', cancelRun);
  $('selectAllRows').addEventListener('change', () => {
    const checked = $('selectAllRows').checked;
    document.querySelectorAll('[data-row-select]').forEach((el) => {
      el.checked = checked;
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
  $('contentModal').addEventListener('click', (event) => {
    if (event.target === $('contentModal')) closeContentEditor();
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
    if (data.code === 0) {
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
  });
}

init();
