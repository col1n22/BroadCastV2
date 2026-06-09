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
  'bgmFile',
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

function collectSettings() {
  const next = {};
  for (const field of fields) {
    const el = $(field);
    if (!el) continue;
    if (el.type === 'number') {
      next[field] = Number(el.value || 0);
    } else {
      next[field] = el.value.trim();
    }
  }
  return next;
}

function fillSettings(value) {
  settings = value || {};
  for (const field of fields) {
    const el = $(field);
    if (!el) continue;
    el.value = settings[field] ?? '';
  }
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
    ['bgmFile', 'BGM 文件']
  ];
  for (const [key, label] of required) {
    if (!current[key]) {
      throw new Error(`请先填写：${label}`);
    }
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
}

async function init() {
  fillSettings(await window.huApp.loadSettings());
  $('outputDir').value = settings.outputDir || '';

  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => switchSection(btn.dataset.section));
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
      if (selected) $(btn.dataset.pickFont).value = selected;
    });
  });

  document.querySelectorAll('[data-pick-audio]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const selected = await window.huApp.chooseFile({
        filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg'] }]
      });
      if (selected) $(btn.dataset.pickAudio).value = selected;
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
