// ============================================================
// 通勤助手 — Popup 主逻辑 v2.3
// ============================================================

import {
  getApiKey, setApiKey, getAllGroups, saveGroup, deleteGroup,
  togglePin, updateGroupResult, updateGroupMode, updateGroupTimes,
  updateGroupShift, getSortedGroups, exportData, importData, confirmImportKey,
  getGroupScheduleSlots, addGroupSlot, removeGroupSlot,
  toggleGroupSlot, updateGroupSlotTime,
  getLastWeather, saveLastWeather, getGlobalSettings, saveGlobalSettings,
  getShiftCalendar, setShiftDate, getTodayShiftType,
  addHistoryRecord, getHistoryRecords, getHistoryInRange,
  getHistoryLimit, setHistoryLimit,
  getWeatherCity, setWeatherCity,
  getLocationPresets, saveLocationPreset, deleteLocationPreset,
  incrementApiCount, getApiCount, getApiLimit, setApiLimit,
} from '../lib/storage.js';
import { getCommuteTime, testApiKey, getWeatherInfo, getWeatherIcon, geocode, getDistrictTree, setApiCounter, MODE_LABELS, TRAFFIC_LABELS, TRAFFIC_ICONS } from '../lib/amap.js';
import { getDateInfo } from '../lib/calendar.js';

// ==================== DOM 引用 ====================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// Pages
const setupPage  = $('#setupPage');
const mainPage   = $('#mainPage');

// Setup
const apiKeyInput  = $('#apiKeyInput');
const toggleKeyVis = $('#toggleKeyVisibility');
const testKeyBtn   = $('#testKeyBtn');
const setupMsg     = $('#setupMsg');

// Main
const searchInput = $('#searchInput');
const groupList   = $('#groupList');
const emptyState  = $('#emptyState');
const weatherBtn  = $('#weatherBtn');
const settingsBtn = $('#settingsBtn');
const addGroupBtn = $('#addGroupBtn');
// v2.2: 导入导出移至设置弹窗
const exportBtn   = $('#exportBtn');
const importBtn   = $('#importBtn');
const importFile  = $('#importFileInput');

// v2.1: 节假日状态栏
const holidayBar  = $('#holidayBar');
const holidayIcon = $('#holidayIcon');
const holidayText = $('#holidayText');
const holidaySub  = $('#holidaySub');

// Edit Modal
const editModal    = $('#editModal');
const modalTitle   = $('#modalTitle');
const groupName    = $('#groupName');
const presetSelect = $('#presetSelect');
const originAddr   = $('#originAddr');
const destAddr     = $('#destAddr');
const arriveBy     = $('#arriveBy');
const homeBy       = $('#homeBy');
const modeSelect   = $('#modeSelect');
const shiftSelect  = $('#shiftSelect');
const cancelEditBtn = $('#cancelEditBtn');
const saveGroupBtn  = $('#saveGroupBtn');

// Schedule Modal
const scheduleModal     = $('#scheduleModal');
const scheduleGroupName = $('#scheduleGroupName');
const scheduleSlotList  = $('#scheduleSlotList');
const newSlotTime       = $('#newSlotTime');
const addScheduleSlotBtn = $('#addScheduleSlotBtn');
const scheduleMsg       = $('#scheduleMsg');
const closeScheduleBtn   = $('#closeScheduleBtn');

// Result Modal
const resultModal   = $('#resultModal');
const resultBody    = $('#resultBody');
const closeResultBtn = $('#closeResultBtn');

// Settings Modal
const settingsModal  = $('#settingsModal');
const settingsApiKey = $('#settingsApiKey');
const toggleSetKey   = $('#toggleSettingsKey');
const settingsMsg    = $('#settingsMsg');
const cancelSetBtn   = $('#cancelSettingsBtn');
const saveSetBtn     = $('#saveSettingsBtn');

// v2.2: 全局班次时间设置
const dayStartTime   = $('#dayStartTime');
const dayEndTime     = $('#dayEndTime');
const nightStartTime = $('#nightStartTime');
const nightEndTime   = $('#nightEndTime');
const adjustAmStart  = $('#adjustAmStart');
const adjustAmEnd    = $('#adjustAmEnd');
const adjustPmStart  = $('#adjustPmStart');
const adjustPmEnd    = $('#adjustPmEnd');
const saveShiftTimesBtn = $('#saveShiftTimesBtn');

// v2.5: 天气城市
const weatherProvince = $('#weatherProvince');
const weatherCitySel  = $('#weatherCity');
const weatherDistrict = $('#weatherDistrict');
const weatherCityMsg  = $('#weatherCityMsg');
let districtTree = [];

// v2.3: 日历
const calendarContainer = $('#calendarContainer');
let calYear, calMonth; // 当前日历显示的年份/月份

// v2.4: 历史记录
const historyModal    = $('#historyModal');
const historyGroupName = $('#historyGroupName');
const historyListElem  = $('#historyList');
const historyEmpty     = $('#historyEmpty');
const closeHistoryBtn  = $('#closeHistoryBtn');
const trendBtn         = $('#trendBtn');
const trendRange       = $('#trendRange');
const trendCanvas      = $('#trendCanvas');

// v2.4: 多方式对比
const compareModal     = $('#compareModal');
const compareGroupName = $('#compareGroupName');
const compareBody      = $('#compareBody');
const closeCompareBtn  = $('#closeCompareBtn');
const comparePicker    = $('#comparePicker');
const startCompareBtn  = $('#startCompareBtn');
let compareGroupId = null;

// ==================== 状态 ====================
let editingGroupId = null;
let currentScheduleGroupId = null;
let allGroups = [];

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', init);

async function init() {
  setApiCounter(() => incrementApiCount(1));
  const key = await getApiKey();
  if (key) {
    showMainPage();
    await loadWeatherIcon();
    await loadHolidayStatus();
    await loadGroups();
  } else {
    showSetupPage();
  }
}

function showSetupPage() {
  setupPage.classList.remove('hidden');
  mainPage.classList.add('hidden');
}
function showMainPage() {
  setupPage.classList.add('hidden');
  mainPage.classList.remove('hidden');
}

// v2.2: 加载天气图标
async function loadWeatherIcon() {
  const lastWeather = await getLastWeather();
  if (lastWeather && lastWeather.icon) {
    weatherBtn.textContent = lastWeather.icon;
    weatherBtn.title = `${lastWeather.city || ''} ${lastWeather.weather || ''} ${lastWeather.temperature || ''}℃ — 点击刷新`;
  } else {
    weatherBtn.textContent = '☀️';
    weatherBtn.title = '点击查询天气';
  }
}

async function refreshWeather() {
  weatherBtn.textContent = '⏳';
  weatherBtn.disabled = true;
  weatherBtn.title = '正在查询天气...';

  try {
    const apiKey = await getApiKey();
    if (!apiKey) {
      weatherBtn.textContent = '☀️';
      weatherBtn.title = '请先配置 API Key';
      return;
    }

    // v2.5: 只使用手动设置的城市
    const city = await getWeatherCity();
    if (!city || !city.adcode) {
      weatherBtn.textContent = '☀️';
      weatherBtn.title = '请先在设置中设置所在城市';
      return;
    }

    const weather = await getWeatherInfo(city.adcode, apiKey);
    if (!weather) {
      weatherBtn.textContent = '☀️';
      weatherBtn.title = '天气查询失败，点击重试';
      return;
    }

    const icon = getWeatherIcon(weather.weather);
    weatherBtn.textContent = icon;
    weatherBtn.title = `${weather.city} ${weather.weather} ${weather.temperature}℃ — 点击刷新`;

    await saveLastWeather({
      city: weather.city,
      adcode: city.adcode,
      weather: weather.weather,
      temperature: weather.temperature,
      icon,
      reporttime: weather.reporttime,
      updateTime: Date.now(),
    });
  } catch (e) {
    weatherBtn.textContent = '☀️';
    weatherBtn.title = '天气查询失败，点击重试';
  } finally {
    weatherBtn.disabled = false;
  }
}

// v2.1/v2.3: 加载今日状态（优先班次日历，其次节假日 API）
async function loadHolidayStatus() {
  try {
    holidayBar.classList.remove('hidden');
    const today = new Date();
    const ds = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

    // 先查班次日历
    const cal = await getShiftCalendar();
    const shiftEntry = cal[ds];

    if (shiftEntry) {
      // 班次日历有记录 → 显示班次信息
      const { type, sub } = shiftEntry;
      if (type === 'day') {
        holidayIcon.textContent = '☀️';
        holidayText.textContent = '白班';
        holidayBar.className = 'holiday-bar holiday-workday';
      } else if (type === 'night') {
        holidayIcon.textContent = '🌙';
        holidayText.textContent = '夜班';
        holidayBar.className = 'holiday-bar holiday-night';
      } else if (type === 'rest') {
        holidayIcon.textContent = '🏖️';
        holidayText.textContent = '休息';
        holidayBar.className = 'holiday-bar holiday-rest';
      } else if (type === 'adjust') {
        holidayIcon.textContent = '🔄';
        holidayText.textContent = sub === 'am' ? '上午调休' : '下午调休';
        holidayBar.className = 'holiday-bar holiday-adjusted';
      }
    } else {
      // 无日历记录 → 降级到节假日 API
      const info = await getDateInfo();
      if (info.isHoliday || !info.isWorkday) {
        holidayIcon.textContent = '🏖️';
        holidayText.textContent = info.name;
        holidayBar.className = 'holiday-bar holiday-rest';
      } else if (info.type === 'adjusted_workday') {
        holidayIcon.textContent = '📅';
        holidayText.textContent = info.name;
        holidayBar.className = 'holiday-bar holiday-adjusted';
      } else {
        holidayIcon.textContent = '📅';
        holidayText.textContent = '工作日';
        holidayBar.className = 'holiday-bar holiday-workday';
      }
    }
    holidaySub.textContent = today.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' });
  } catch (e) {
    console.warn('[通勤助手] 状态加载失败:', e.message);
  }
}

// ==================== 设置页面事件 ====================
toggleKeyVis.addEventListener('click', () => {
  apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password';
  toggleKeyVis.textContent = apiKeyInput.type === 'password' ? '👁️' : '🙈';
});

testKeyBtn.addEventListener('click', async () => {
  const key = apiKeyInput.value.trim();
  if (!key) { showMessage(setupMsg, '请输入 API Key', 'error'); return; }

  testKeyBtn.disabled = true;
  testKeyBtn.textContent = '⏳ 正在测试...';
  showMessage(setupMsg, '', '');

  try {
    await testApiKey(key);
    await setApiKey(key);
    showMessage(setupMsg, '✅ API Key 验证成功！', 'success');
    setTimeout(() => { showMainPage(); loadGroups(); apiKeyInput.value = ''; }, 800);
  } catch (e) {
    showMessage(setupMsg, '❌ ' + (e.message || '验证失败'), 'error');
  } finally {
    testKeyBtn.disabled = false;
    testKeyBtn.textContent = '🧪 测试并保存';
  }
});

// ==================== 地点组列表 ====================
async function loadGroups() {
  allGroups = await getSortedGroups();
  await renderGroupList(allGroups);
}

async function renderGroupList(groups) {
  groupList.innerHTML = '';

  if (groups.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');

  // v2.3: 按当天班次排序（匹配班次的组优先）
  const sorted = await sortByTodayShift(groups);

  sorted.forEach(g => {
    const card = createGroupCard(g);
    groupList.appendChild(card);
  });

  // v2.6: 根据当前时间更新卡片方向
  for (const g of sorted) {
    const dir = await getCurrentDirection(g);
    if (dir === 'reversed') {
      const card = groupList.querySelector(`[data-id="${g.id}"]`);
      if (card) {
        const route = card.querySelector('.card-route');
        if (route) route.innerHTML = `<span>${escHtml(g.destination)}</span><span class='arrow'>←</span><span>${escHtml(g.origin)}</span>`;
      }
    }
  }
}

/**
 * v2.3: 根据当天班次日历排序
 * - 置顶优先
 * - 当天班次匹配的组优先（如今天是白班，则白班组排在前面）
 * - 再按更新时间倒序
 */
async function sortByTodayShift(groups) {
  const todayType = await getTodayShiftType(); // 'day' | 'night' | 'rest' | 'adjust' | ''
  return [...groups].sort((a, b) => {
    // 置顶始终第一
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    // 当天班次匹配的组优先
    const aMatch = a.shiftType === todayType ? 0 : 1;
    const bMatch = b.shiftType === todayType ? 0 : 1;
    if (aMatch !== bMatch) return aMatch - bMatch;
    // 最后按更新时间倒序
    return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
  });
}

// v2.6: 根据班次日历+班次时间判断当前展示方向
async function getCurrentDirection(group) {
  const cal = await getShiftCalendar();
  const today = new Date();
  const ds = `${today.getFullYear()}-${pad(today.getMonth()+1)}-${pad(today.getDate())}`;
  const entry = cal[ds];
  if (!entry) return 'normal'; // 无日历记录，保持起点→终点

  const settings = await getGlobalSettings();
  const nowMin = today.getHours() * 60 + today.getMinutes();
  let workStart, workEnd;

  if (entry.type === 'day') {
    workStart = parseTime(settings.dayShiftStart);
    workEnd = parseTime(settings.dayShiftEnd);
  } else if (entry.type === 'night') {
    workStart = parseTime(settings.nightShiftStart);
    workEnd = parseTime(settings.nightShiftEnd);
  } else if (entry.type === 'adjust' && entry.sub === 'am') {
    workStart = parseTime(settings.adjustAmStart);
    workEnd = parseTime(settings.adjustAmEnd);
  } else if (entry.type === 'adjust' && entry.sub === 'pm') {
    workStart = parseTime(settings.adjustPmStart);
    workEnd = parseTime(settings.adjustPmEnd);
  } else {
    return 'normal'; // 休息日
  }

  // 夜班跨午夜处理
  if (workEnd < workStart) workEnd += 24 * 60;
  const checkMin = (entry.type === 'night' && nowMin < workStart) ? nowMin + 24 * 60 : nowMin;

  return (checkMin >= workStart && checkMin < workEnd) ? 'reversed' : 'normal';
}

function parseTime(t) {
  const [h, m] = (t || '00:00').split(':').map(Number);
  return h * 60 + m;
}

function createGroupCard(group) {
  const card = document.createElement('div');
  card.className = `group-card${group.pinned ? ' pinned' : ''}`;
  card.dataset.id = group.id;

  const modeLabel = MODE_LABELS[group.mode] || '驾车';
  const createdAt = formatDate(group.createdAt);
  const hasSchedule = group.scheduleSlots && group.scheduleSlots.some(s => s.enabled);
  const enabledSlots = (group.scheduleSlots || []).filter(s => s.enabled);
  const scheduleText = enabledSlots.length > 0
    ? enabledSlots.map(s => `${pad(s.hour)}:${pad(s.minute)}`).join(' ')
    : '';

  // 到岗/到家时间
  const arriveText = group.arriveBy || '';
  const homeText = group.homeBy || '';
  const targetsHtml = (arriveText || homeText) ? `
    <div class="card-targets">
      <span>🏢 到岗 <span class="time-val">${arriveText || '--:--'}</span></span>
      <span>🏠 到家 <span class="time-val">${homeText || '--:--'}</span></span>
    </div>` : `
    <div class="card-targets">
      <span class="no-time">🏢 未设到岗时间</span>
      <span class="no-time">🏠 未设到家时间</span>
    </div>`;

  // 定时时段
  const scheduleHtml = `
    <div class="card-schedule">
      <span class="schedule-tag ${hasSchedule ? '' : 'schedule-off'}">
        ⏰ ${hasSchedule ? scheduleText : '未设定时'}
      </span>
      <button class="btn-schedule-edit" data-action="editSchedule" data-id="${group.id}">✎ 设置</button>
    </div>`;

  // v2.1: 班次类型标签
  const shiftLabel = { day: '🟢 白班', night: '🟣 晚班', none: '⚪ 关闭' };
  const shiftHtml = `<span class="shift-tag shift-${group.shiftType || 'day'}">${shiftLabel[group.shiftType] || shiftLabel.day}</span>`;

  // 最近结果
  let lastResultHtml = '';
  if (group.lastResult) {
    const r = group.lastResult;
    const hours = Math.floor(r.duration / 60);
    const mins = r.duration % 60;
    const timeStr = hours > 0 ? `${hours}小时${mins}分钟` : `${mins}分钟`;
    const lastQuery = group.lastQueryTime ? formatDate(group.lastQueryTime) : '';
    // v2.1: 路况信息
    let trafficInfo = '';
    if (r.trafficStatus && r.trafficStatus.level >= 1) {
      const icon = TRAFFIC_ICONS[r.trafficStatus.level] || '';
      trafficInfo = ` <span class="traffic-label traffic-${r.trafficStatus.level}">${icon} ${r.trafficStatus.label}</span>`;
    }
    lastResultHtml = `
      <div class="card-last-result">
        最近: <strong>${timeStr}</strong>（${r.distance ? r.distance + '公里' : ''}）${trafficInfo}
        <br><span style="font-size:10px;color:#9e9e9e">${lastQuery}</span>
      </div>`;
  }

  card.innerHTML = `
    <div class="card-top">
      <span class="card-name">${escHtml(group.name)}</span>
      <div class="card-badges">
        ${shiftHtml}
        ${group.pinned ? '<span class="badge badge-pin">📌 置顶</span>' : ''}
        ${hasSchedule ? `<span class="badge badge-time">⏰ 定时</span>` : ''}
      </div>
    </div>
    ${targetsHtml}
    <div class="card-route">
      <span>${escHtml(group.origin)}</span>
      <span class="arrow">→</span>
      <span>${escHtml(group.destination)}</span>
    </div>
    <div class="card-meta">
      <span class="mode-tag">${modeLabel}</span>
      <span>${createdAt}</span>
    </div>
    ${lastResultHtml}
    ${scheduleHtml}
    <div class="card-actions">
      <div class="query-row">
        <button class="btn btn-query" data-action="query" data-id="${group.id}">🔍 查询</button>
        <select class="mode-switch" data-action="changeMode" data-id="${group.id}">
          <option value="driving" ${group.mode === 'driving' ? 'selected' : ''}>驾车</option>
          <option value="transit" ${group.mode === 'transit' ? 'selected' : ''}>公交</option>
          <option value="bicycling" ${group.mode === 'bicycling' ? 'selected' : ''}>骑行</option>
          <option value="walking" ${group.mode === 'walking' ? 'selected' : ''}>步行</option>
        </select>
      </div>
      <button class="btn btn-compare" data-action="compare" data-id="${group.id}">📊 对比</button>
      <button class="btn btn-history" data-action="history" data-id="${group.id}">📋 历史</button>
      <button class="btn btn-pin" data-action="pin" data-id="${group.id}">${group.pinned ? '📌 取消置顶' : '📌 置顶'}</button>
      <button class="btn btn-delete" data-action="delete" data-id="${group.id}">🗑 删除</button>
    </div>
  `;

  // 点击卡片空白区域编辑
  card.addEventListener('click', (e) => {
    if (e.target.closest('button') || e.target.closest('select')) return;
    openEditModal(group);
  });

  // 按钮事件（click）
  card.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const id = btn.dataset.id;

      switch (action) {
        case 'query': await handleQuery(id, btn); break;
        case 'compare': openComparePicker(id, btn); break;
        case 'history': await openHistoryModal(id); break;
        case 'pin': await handlePin(id); break;
        case 'delete': await handleDelete(id); break;
        case 'editSchedule': openScheduleModal(id); break;
      }
    });
  });

  // 下拉框事件（change，避免点击下拉框时误触发 loadGroups）
  card.querySelectorAll('select').forEach(sel => {
    sel.addEventListener('change', async (e) => {
      e.stopPropagation();
      const action = sel.dataset.action;
      const id = sel.dataset.id;
      if (action === 'changeMode') await handleChangeMode(id, sel.value);
    });
  });

  return card;
}

// ==================== 搜索 ====================
searchInput.addEventListener('input', async () => {
  const kw = searchInput.value.trim().toLowerCase();
  if (!kw) { await renderGroupList(allGroups); return; }
  const filtered = allGroups.filter(g =>
    g.name.toLowerCase().includes(kw) ||
    g.origin.toLowerCase().includes(kw) ||
    g.destination.toLowerCase().includes(kw)
  );
  await renderGroupList(filtered);
});

// ==================== 查询通勤 ====================
async function handleQuery(id, btn) {
  const group = allGroups.find(g => g.id === id);
  if (!group) return;

  const apiKey = await getApiKey();
  if (!apiKey) { alert('请先配置 API Key'); return; }

  // v2.6: 上班时间查回家路线
  const dir = await getCurrentDirection(group);
  const origin = dir === 'reversed' ? group.destination : group.origin;
  const destination = dir === 'reversed' ? group.origin : group.destination;

  const origText = btn.textContent;
  btn.textContent = '⏳ 查询中...';
  btn.disabled = true;
  btn.classList.add('loading');

  try {
    const result = await getCommuteTime(origin, destination, group.mode, apiKey);
    await updateGroupResult(id, result);
    // v2.4: 手动查询保存历史记录
    await addHistoryRecord(id, {
      origin: group.origin,
      destination: group.destination,
      mode: result.mode,
      duration: result.duration,
      distance: result.distance,
      trafficStatus: result.trafficStatus || null,
      summary: result.summary || '',
    });
    await loadGroups();
    showResultModal(group, result);
  } catch (e) {
    alert('查询失败: ' + e.message);
  } finally {
    btn.textContent = origText;
    btn.disabled = false;
    btn.classList.remove('loading');
  }
}

async function handlePin(id) { await togglePin(id); await loadGroups(); }
async function handleChangeMode(id, mode) { await updateGroupMode(id, mode); await loadGroups(); }

async function handleDelete(id) {
  const group = allGroups.find(g => g.id === id);
  if (!group) return;
  if (!confirm(`确定删除「${group.name}」？此操作不可恢复。`)) return;
  await deleteGroup(id);
  await loadGroups();
  browser.runtime.sendMessage({ action: 'updateSchedule' });
}

// ==================== 编辑弹窗 ====================
addGroupBtn.addEventListener('click', () => openEditModal(null));

function openEditModal(group = null) {
  editingGroupId = group?.id || null;
  loadPresetOptions();

  if (group) {
    modalTitle.textContent = '编辑地点组';
    groupName.value = group.name;
    originAddr.value = group.origin;
    destAddr.value = group.destination;
    arriveBy.value = group.arriveBy || '';
    homeBy.value = group.homeBy || '';
    modeSelect.value = group.mode || 'driving';
    shiftSelect.value = group.shiftType || 'day';
  } else {
    modalTitle.textContent = '新建地点组';
    groupName.value = '';
    originAddr.value = '';
    destAddr.value = '';
    arriveBy.value = '';
    homeBy.value = '';
    modeSelect.value = 'driving';
    shiftSelect.value = 'day';
  }

  // v2.2: 根据班次类型自动填入默认时间
  autoFillShiftTimes();

  editModal.classList.remove('hidden');
}

// v2.2: 班次切换时自动填入默认到岗/到家时间
shiftSelect.addEventListener('change', () => autoFillShiftTimes());

async function autoFillShiftTimes() {
  // 仅在新建组（editingGroupId 为 null）时自动填入，编辑时不覆盖用户已设定的值
  if (editingGroupId) return;
  const settings = await getGlobalSettings();
  const shift = shiftSelect.value;
  if (shift === 'day') {
    if (!arriveBy.value) arriveBy.value = settings.dayShiftStart || '08:00';
    if (!homeBy.value) homeBy.value = settings.dayShiftEnd || '17:00';
  } else if (shift === 'night') {
    if (!arriveBy.value) arriveBy.value = settings.nightShiftStart || '20:00';
    if (!homeBy.value) homeBy.value = settings.nightShiftEnd || '08:00';
  }
}

cancelEditBtn.addEventListener('click', () => editModal.classList.add('hidden'));
editModal.querySelector('.modal-overlay').addEventListener('click', () => editModal.classList.add('hidden'));

saveGroupBtn.addEventListener('click', async () => {
  const name = groupName.value.trim();
  const origin = originAddr.value.trim();
  const destination = destAddr.value.trim();
  const mode = modeSelect.value;
  const arrBy = arriveBy.value;
  const hmBy = homeBy.value;

  if (!name || !origin || !destination) {
    alert('请填写完整的组名称、起点和终点地址');
    return;
  }

  const groupData = { name, origin, destination, mode, arriveBy: arrBy, homeBy: hmBy, shiftType: shiftSelect.value };
  if (editingGroupId) groupData.id = editingGroupId;

  await saveGroup(groupData);
  editModal.classList.add('hidden');
  await loadGroups();
  browser.runtime.sendMessage({ action: 'updateSchedule' });
});

// ==================== 定时设置弹窗（组级） ====================
function openScheduleModal(groupId) {
  currentScheduleGroupId = groupId;
  const group = allGroups.find(g => g.id === groupId);
  scheduleGroupName.textContent = group ? `「${group.name}」的定时查询时段` : '';
  scheduleMsg.classList.add('hidden');
  scheduleModal.classList.remove('hidden');
  loadScheduleSlotsUI();
}

async function loadScheduleSlotsUI() {
  const slots = await getGroupScheduleSlots(currentScheduleGroupId);
  scheduleSlotList.innerHTML = '';

  if (slots.length === 0) {
    scheduleSlotList.innerHTML = '<div style="text-align:center;color:#bdbdbd;padding:12px;font-size:12px;">暂无定时时段，用下方时间选择器添加</div>';
    return;
  }

  slots.forEach(slot => {
    const item = document.createElement('div');
    item.className = 'slot-item';
    const hh = pad(slot.hour);
    const mm = pad(slot.minute);

    item.innerHTML = `
      <input type="time" class="slot-time-input" value="${hh}:${mm}" data-id="${slot.id}">
      <button class="slot-toggle ${slot.enabled ? 'on' : ''}" data-action="toggleSlot" data-id="${slot.id}">
        ${slot.enabled ? '开启' : '关闭'}
      </button>
      <button class="slot-delete" data-action="deleteSlot" data-id="${slot.id}">✕</button>
    `;

    item.querySelector('.slot-time-input').addEventListener('change', async (e) => {
      const [h, m] = e.target.value.split(':').map(Number);
      await updateGroupSlotTime(currentScheduleGroupId, slot.id, h, m);
      browser.runtime.sendMessage({ action: 'updateSchedule' });
      loadScheduleSlotsUI();
    });

    item.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        if (action === 'toggleSlot') {
          await toggleGroupSlot(currentScheduleGroupId, slot.id);
          browser.runtime.sendMessage({ action: 'updateSchedule' });
          loadScheduleSlotsUI();
          loadGroups(); // 刷新卡片上的定时显示
        } else if (action === 'deleteSlot') {
          await removeGroupSlot(currentScheduleGroupId, slot.id);
          browser.runtime.sendMessage({ action: 'updateSchedule' });
          loadScheduleSlotsUI();
          loadGroups();
        }
      });
    });

    scheduleSlotList.appendChild(item);
  });
}

addScheduleSlotBtn.addEventListener('click', async () => {
  const timeVal = newSlotTime.value;
  if (!timeVal) {
    showMessage(scheduleMsg, '请先选择一个时间', 'error');
    return;
  }
  const [h, m] = timeVal.split(':').map(Number);
  await addGroupSlot(currentScheduleGroupId, h, m);
  browser.runtime.sendMessage({ action: 'updateSchedule' });
  loadScheduleSlotsUI();
  loadGroups();
  showMessage(scheduleMsg, '✅ 时段已添加', 'success');
  setTimeout(() => scheduleMsg.classList.add('hidden'), 1500);
});

closeScheduleBtn.addEventListener('click', () => scheduleModal.classList.add('hidden'));
scheduleModal.querySelector('.modal-overlay').addEventListener('click', () => scheduleModal.classList.add('hidden'));

// ==================== 结果弹窗 ====================
function showResultModal(group, result) {
  let html = `<p style="margin-bottom:6px;color:#757575;font-size:12px;">
    <strong>${escHtml(group.name)}</strong>：
    ${escHtml(group.origin)} → ${escHtml(group.destination)}</p>`;

  html += `<div class="result-item">
    <div class="mode-label">${MODE_LABELS[result.mode] || result.mode}</div>`;

  if (result.duration !== undefined) {
    const hours = Math.floor(result.duration / 60);
    const mins = result.duration % 60;
    html += `<div>⏱ 预计耗时：<strong>${hours > 0 ? hours + '小时' : ''}${mins}分钟</strong></div>`;
  }
  if (result.distance) html += `<div>📏 距离：${result.distance}公里</div>`;
  if (result.summary) html += `<div>🚌 方案：${result.summary}</div>`;
  if (result.traffic_lights) html += `<div>🚦 红绿灯：${result.traffic_lights}个</div>`;
  if (result.trafficStatus && result.trafficStatus.level >= 1) {
    const icon = TRAFFIC_ICONS[result.trafficStatus.level] || '';
    html += `<div>🚗 路况：<span class="traffic-label traffic-${result.trafficStatus.level}">${icon} ${result.trafficStatus.label}</span></div>`;
  }
  html += `</div>`;

  // v2.5: 高德地图链接
  const o = result.originCoord;
  const d = result.destCoord;
  if (o && d) {
    const navUrl = `https://uri.amap.com/navigation?from=${o.lng},${o.lat},${encodeURIComponent(result.origin)}&to=${d.lng},${d.lat},${encodeURIComponent(result.destination)}&mode=${result.mode}`;
    html += `<a class="result-nav-link" href="${navUrl}" target="_blank">去高德地图查看完整路线 →</a>`;
  }

  resultBody.innerHTML = html;
  resultModal.classList.remove('hidden');
}

closeResultBtn.addEventListener('click', () => resultModal.classList.add('hidden'));
resultModal.querySelector('.modal-overlay').addEventListener('click', () => resultModal.classList.add('hidden'));

// ==================== 导入/导出 ====================
exportBtn.addEventListener('click', async () => {
  try { await exportData(); } catch (e) { alert('导出失败: ' + e.message); }
});

importBtn.addEventListener('click', () => {
  importFile.value = '';
  importFile.click();
});

// v2.4: 导入合并
importFile.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const result = await importData(text, true);
    let msg = `✅ 导入成功！共 ${result.groupCount} 个地点组`;
    if (result.needsKeyConfirm && data.apiKey) {
      const replace = confirm(`导入文件中包含不同的 API Key，是否替换？\n\n「确定」替换，「取消」保留当前 Key`);
      if (replace) await confirmImportKey(data.apiKey);
    }
    alert(msg);
    await loadGroups();
    browser.runtime.sendMessage({ action: 'updateSchedule' });
  } catch (err) {
    alert('❌ 导入失败: ' + err.message);
  } finally {
    e.target.value = '';
  }
});

// ==================== API Key 设置弹窗 ====================
settingsBtn.addEventListener('click', async () => {
  const key = await getApiKey();
  settingsApiKey.value = key;
  settingsMsg.classList.add('hidden');
  // v2.2: 加载全局班次时间
  const settings = await getGlobalSettings();
  dayStartTime.value = settings.dayShiftStart || '08:00';
  dayEndTime.value = settings.dayShiftEnd || '17:00';
  nightStartTime.value = settings.nightShiftStart || '20:00';
  nightEndTime.value = settings.nightShiftEnd || '08:00';
  adjustAmStart.value = settings.adjustAmStart || '08:00';
  adjustAmEnd.value = settings.adjustAmEnd || '12:00';
  adjustPmStart.value = settings.adjustPmStart || '12:00';
  adjustPmEnd.value = settings.adjustPmEnd || '17:00';
  // v2.5: 加载行政区下拉
  if (key && districtTree.length === 0) {
    try { districtTree = await getDistrictTree(key); } catch { /* 静默 */ }
    rebuildProvinceOptions();
  }
  const city = await getWeatherCity();
  if (city && city.adcode) {
    await selectCityByAdcode(city.adcode);
  }
  weatherCityMsg.classList.add('hidden');
  settingsModal.classList.remove('hidden');
  // v2.3: 渲染日历
  const now = new Date();
  calYear = now.getFullYear();
  calMonth = now.getMonth() + 1;
  renderCalendar();
  // v2.6: 加载地点库
  await loadPresetList();
  // v2.6: 加载配额监控
  await loadQuotaMonitor();
  // v2.4: 加载历史限制按钮状态
  const limit = await getHistoryLimit();
  document.querySelectorAll('.history-limit-btn').forEach(b => {
    const isActive = parseInt(b.dataset.limit) === limit;
    b.classList.toggle('btn-primary', isActive);
    b.classList.toggle('btn-secondary', !isActive);
  });
});

// v2.2: 天气按钮
weatherBtn.addEventListener('click', () => refreshWeather());

toggleSetKey.addEventListener('click', () => {
  settingsApiKey.type = settingsApiKey.type === 'password' ? 'text' : 'password';
  toggleSetKey.textContent = settingsApiKey.type === 'password' ? '👁️' : '🙈';
});

cancelSetBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));
settingsModal.querySelector('.modal-overlay').addEventListener('click', () => settingsModal.classList.add('hidden'));

saveSetBtn.addEventListener('click', async () => {
  const key = settingsApiKey.value.trim();
  if (!key) { showMessage(settingsMsg, '请输入 API Key', 'error'); return; }

  saveSetBtn.disabled = true;
  saveSetBtn.textContent = '⏳ 测试中...';
  showMessage(settingsMsg, '', '');

  try {
    await testApiKey(key);
    await setApiKey(key);
    showMessage(settingsMsg, '✅ 保存成功！', 'success');
  } catch (e) {
    showMessage(settingsMsg, '❌ ' + (e.message || '验证失败'), 'error');
  } finally {
    saveSetBtn.disabled = false;
    saveSetBtn.textContent = '🧪 测试并保存';
  }
});

// v2.2: 保存全局班次时间
saveShiftTimesBtn.addEventListener('click', async () => {
  await saveGlobalSettings({
    dayShiftStart: dayStartTime.value || '08:00',
    dayShiftEnd: dayEndTime.value || '17:00',
    nightShiftStart: nightStartTime.value || '20:00',
    nightShiftEnd: nightEndTime.value || '08:00',
    adjustAmStart: adjustAmStart.value || '08:00',
    adjustAmEnd: adjustAmEnd.value || '12:00',
    adjustPmStart: adjustPmStart.value || '12:00',
    adjustPmEnd: adjustPmEnd.value || '17:00',
  });
  saveShiftTimesBtn.textContent = '✅ 已保存';
  saveShiftTimesBtn.classList.add('btn-primary');
  saveShiftTimesBtn.classList.remove('btn-secondary');
  setTimeout(() => {
    saveShiftTimesBtn.textContent = '💾 保存班次时间';
    saveShiftTimesBtn.classList.remove('btn-primary');
    saveShiftTimesBtn.classList.add('btn-secondary');
  }, 1500);
});

// v2.5: 天气城市联动下拉
function rebuildProvinceOptions() {
  weatherProvince.innerHTML = '<option value="">-- 选择省 --</option>';
  districtTree.forEach(p => {
    weatherProvince.innerHTML += `<option value="${p.adcode}">${p.name}</option>`;
  });
}

function rebuildCityOptions(provinceAdcode) {
  weatherCitySel.innerHTML = '<option value="">-- 选择市 --</option>';
  weatherDistrict.innerHTML = '<option value="">-- 选择区县 --</option>';
  if (!provinceAdcode) return;
  const province = districtTree.find(p => p.adcode === provinceAdcode);
  if (!province || !province.districts) return;
  province.districts.forEach(c => {
    weatherCitySel.innerHTML += `<option value="${c.adcode}">${c.name}</option>`;
  });
}

function rebuildDistrictOptions(cityAdcode) {
  weatherDistrict.innerHTML = '<option value="">-- 选择区县 --</option>';
  if (!cityAdcode) return;
  const provinceAdcode = weatherProvince.value;
  const province = districtTree.find(p => p.adcode === provinceAdcode);
  if (!province || !province.districts) return;
  const city = province.districts.find(c => c.adcode === cityAdcode);
  if (!city || !city.districts) return;
  city.districts.forEach(d => {
    weatherDistrict.innerHTML += `<option value="${d.adcode}">${d.name}</option>`;
  });
}

weatherProvince.addEventListener('change', () => {
  rebuildCityOptions(weatherProvince.value);
  saveDistrict();
});

weatherCitySel.addEventListener('change', () => {
  rebuildDistrictOptions(weatherCitySel.value);
  saveDistrict();
});

weatherDistrict.addEventListener('change', () => saveDistrict());

// 选择区县后自动保存
async function saveDistrict() {
  const district = weatherDistrict.value;
  if (!district) return;
  const name = weatherDistrict.selectedOptions[0]?.textContent || '';
  if (!name || name.startsWith('--')) return;
  await setWeatherCity({ name, adcode: district });
  showMessage(weatherCityMsg, `✅ 已保存：${name}`, 'success');
  setTimeout(() => weatherCityMsg.classList.add('hidden'), 2000);
  await refreshWeather();
}

// 根据已保存的 adcode 回填下拉框
async function selectCityByAdcode(adcode) {
  if (districtTree.length === 0) return;

  // 在树中找到对应的省/市/区
  for (const p of districtTree) {
    // 检查是否是省直辖
    if (p.adcode === adcode) {
      weatherProvince.value = p.adcode;
      rebuildCityOptions(p.adcode);
      return;
    }
    if (!p.districts) continue;
    for (const c of p.districts) {
      if (c.adcode === adcode) {
        weatherProvince.value = p.adcode;
        rebuildCityOptions(p.adcode);
        weatherCitySel.value = c.adcode;
        rebuildDistrictOptions(c.adcode);
        return;
      }
      if (!c.districts) continue;
      for (const d of c.districts) {
        if (d.adcode === adcode) {
          weatherProvince.value = p.adcode;
          rebuildCityOptions(p.adcode);
          weatherCitySel.value = c.adcode;
          rebuildDistrictOptions(c.adcode);
          weatherDistrict.value = d.adcode;
          return;
        }
      }
    }
  }
}

// v2.5: 反馈按钮 → 跳转 GitHub Issues
const feedbackBtn = $('#feedbackBtn');
if (feedbackBtn) {
  feedbackBtn.addEventListener('click', () => {
    browser.tabs.create({ url: 'https://github.com/ozh3272674/commute-helper-firefox/issues' });
  });
}

// ==================== v2.6 地点库管理 ====================

const presetList = $('#presetList');
const presetNameI = $('#presetName');
const presetOriginI = $('#presetOrigin');
const presetDestI = $('#presetDest');
const addPresetBtn = $('#addPresetBtn');

async function loadPresetList() {
  const presets = await getLocationPresets();
  if (presets.length === 0) {
    presetList.innerHTML = '<div style="text-align:center;color:#aeaeb2;padding:8px;font-size:12px;">暂无地点，用下方表单添加</div>';
  } else {
    presetList.innerHTML = presets.map(p => `
      <div class="preset-item">
        <div class="preset-top">
          <span class="preset-name">📍 ${escHtml(p.name)}</span>
          <button class="preset-del" data-id="${p.id}">✕</button>
        </div>
        <div class="preset-route-row">
          <span class="preset-origin">${escHtml(p.origin)}</span>
          <span class="preset-arrow">↔</span>
          <span class="preset-dest">${escHtml(p.destination)}</span>
        </div>
      </div>
    `).join('');
  }
}

addPresetBtn.addEventListener('click', async () => {
  const n = presetNameI.value.trim();
  const o = presetOriginI.value.trim();
  const d = presetDestI.value.trim();
  if (!n || !o || !d) { alert('请填写名称、起点和终点'); return; }
  await saveLocationPreset({ name: n, origin: o, destination: d });
  presetNameI.value = ''; presetOriginI.value = ''; presetDestI.value = '';
  await loadPresetList();
});

presetList.addEventListener('click', async (e) => {
  const btn = e.target.closest('.preset-del');
  if (!btn) return;
  if (!confirm('确定删除这个地点？')) return;
  await deleteLocationPreset(btn.dataset.id);
  await loadPresetList();
});

async function loadPresetOptions() {
  const presets = await getLocationPresets();
  presetSelect.innerHTML = '<option value="">-- 自定义地址 --</option>' +
    presets.map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('');
}

presetSelect.addEventListener('change', () => {
  const id = presetSelect.value;
  if (!id) return;
  getLocationPresets().then(presets => {
    const p = presets.find(p => p.id === id);
    if (p) { originAddr.value = p.origin; destAddr.value = p.destination; }
  });
});

// ==================== v2.6 API 配额监控 ====================

async function loadQuotaMonitor() {
  const limit = await getApiLimit();
  const count = await getApiCount();
  $('#quotaLimit').value = limit;
  drawQuotaPie(count.count, limit);
  $('#quotaInfo').innerHTML = `今日已用 <strong>${count.count}</strong> / ${limit} 次`;

  const btn = $('#saveQuotaBtn');
  if (!btn._bound) {
    btn._bound = true;
    btn.addEventListener('click', async () => {
      await setApiLimit(parseInt($('#quotaLimit').value) || 5000);
      await loadQuotaMonitor();
    });
  }
}

function drawQuotaPie(used, total) {
  const canvas = $('#quotaCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const cx = 70, cy = 70, r = 50;
  ctx.clearRect(0, 0, 200, 140);

  const pct = Math.min(used / total, 1);
  const remain = total - used;

  ctx.beginPath(); ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, r, -Math.PI/2, -Math.PI/2 + pct * Math.PI*2);
  ctx.fillStyle = '#007AFF'; ctx.fill();

  ctx.beginPath(); ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, r, -Math.PI/2 + pct * Math.PI*2, -Math.PI/2);
  ctx.fillStyle = '#e5e5ea'; ctx.fill();

  ctx.fillStyle = '#1d1d1f'; ctx.font = 'bold 13px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(Math.round(pct*100) + '%', cx, cy-4);
  ctx.font = '10px -apple-system, sans-serif'; ctx.fillStyle = '#86868b';
  ctx.fillText('已用', cx, cy+12);

  ctx.fillStyle = '#007AFF'; ctx.fillRect(140, 30, 10, 10);
  ctx.fillStyle = '#1d1d1f'; ctx.font = '10px -apple-system, sans-serif';
  ctx.textAlign = 'left'; ctx.fillText('已用 '+used, 154, 39);

  ctx.fillStyle = '#e5e5ea'; ctx.fillRect(140, 50, 10, 10);
  ctx.fillText('剩余 '+remain, 154, 59);
}

// ==================== v2.4 历史记录弹窗 ====================

async function openHistoryModal(groupId) {
  const group = allGroups.find(g => g.id === groupId);
  if (!group) return;
  historyGroupName.textContent = group.name + ' 的历史记录';
  historyModal.classList.remove('hidden');
  trendCanvas.classList.add('hidden');
  trendRange.classList.add('hidden');
  await renderHistoryList(groupId);
}

closeHistoryBtn.addEventListener('click', () => historyModal.classList.add('hidden'));
historyModal.querySelector('.modal-overlay').addEventListener('click', () => historyModal.classList.add('hidden'));

async function renderHistoryList(groupId) {
  const records = await getHistoryRecords(groupId);
  historyListElem.innerHTML = '';
  if (records.length === 0) {
    historyEmpty.classList.remove('hidden');
    historyListElem.classList.add('hidden');
  } else {
    historyEmpty.classList.add('hidden');
    historyListElem.classList.remove('hidden');
    records.forEach(r => {
      const hours = Math.floor(r.duration / 60);
      const mins = r.duration % 60;
      const t = new Date(r.timestamp);
      const dt = `${t.getMonth()+1}/${t.getDate()} ${pad(t.getHours())}:${pad(t.getMinutes())}`;
      const trafficHtml = r.trafficStatus && r.trafficStatus.level >= 1
        ? `<span class="traffic-label traffic-${r.trafficStatus.level}">${TRAFFIC_ICONS[r.trafficStatus.level]||''} ${r.trafficStatus.label}</span>` : '';
      const item = document.createElement('div');
      item.className = 'history-item';
      item.innerHTML = `
        <div class="history-item-top">
          <span class="history-date">${dt}</span>
          <span class="history-mode">${MODE_LABELS[r.mode]||r.mode}</span>
          ${trafficHtml}
        </div>
        <div class="history-item-main">
          ⏱ ${hours>0?hours+'小时':''}${mins}分钟 · 📏 ${r.distance||'?'}公里
        </div>`;
      historyListElem.appendChild(item);
    });
  }
}

// ==================== v2.4 趋势图 (Canvas 折线图) ====================

trendBtn.addEventListener('click', async () => {
  const isTrend = trendCanvas.classList.contains('hidden');
  trendCanvas.classList.toggle('hidden', !isTrend);
  trendRange.classList.toggle('hidden', !isTrend);
  if (isTrend) await drawTrendChart();
});

trendRange.addEventListener('change', () => drawTrendChart());

async function drawTrendChart() {
  const groupId = allGroups.find(g => g.name === historyGroupName.textContent.replace(' 的历史记录', ''))?.id;
  if (!groupId) return;
  const days = parseInt(trendRange.value) || 14;
  const records = await getHistoryInRange(groupId, days);
  const canvas = trendCanvas;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const pad = { top: 20, right: 16, bottom: 28, left: 40 };
  const pw = W - pad.left - pad.right;
  const ph = H - pad.top - pad.bottom;

  ctx.clearRect(0, 0, W, H);

  // 背景
  ctx.fillStyle = '#f9f9fb';
  ctx.fillRect(0, 0, W, H);

  if (records.length < 2) {
    ctx.fillStyle = '#aeaeb2';
    ctx.font = '13px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('数据不足，需要至少2条记录', W/2, H/2);
    return;
  }

  // 反转使最早的在左边
  const data = [...records].reverse();
  const durations = data.map(r => r.duration);
  const minD = Math.max(0, Math.min(...durations) - 5);
  const maxD = Math.max(...durations) + 5;
  const range = maxD - minD || 1;

  // Y轴网格和标签
  ctx.strokeStyle = '#e5e5ea';
  ctx.lineWidth = 0.5;
  ctx.fillStyle = '#aeaeb2';
  ctx.font = '10px -apple-system, sans-serif';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (ph * i / 4);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(W - pad.right, y);
    ctx.stroke();
    const val = Math.round(maxD - (range * i / 4));
    ctx.fillText(val + 'min', pad.left - 6, y + 4);
  }

  // X轴标签
  ctx.textAlign = 'center';
  ctx.fillStyle = '#aeaeb2';
  const maxLabels = Math.min(data.length, 7);
  const step = Math.max(1, Math.floor(data.length / maxLabels));
  for (let i = 0; i < data.length; i += step) {
    const x = pad.left + (pw * i / (data.length - 1 || 1));
    const d = new Date(data[i].timestamp);
    ctx.fillText(`${d.getMonth()+1}/${d.getDate()}`, x, H - pad.bottom + 14);
  }

  // 折线
  ctx.strokeStyle = '#007AFF';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  data.forEach((r, i) => {
    const x = pad.left + (pw * i / (data.length - 1 || 1));
    const y = pad.top + ph - ((r.duration - minD) / range) * ph;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // 数据点
  data.forEach((r, i) => {
    const x = pad.left + (pw * i / (data.length - 1 || 1));
    const y = pad.top + ph - ((r.duration - minD) / range) * ph;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI*2);
    ctx.fill();
    ctx.strokeStyle = '#007AFF';
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

// ==================== v2.4 多方式对比 ====================

function openComparePicker(groupId, btn) {
  compareGroupId = groupId;
  const rect = btn.getBoundingClientRect();
  comparePicker.style.left = Math.min(rect.left, window.innerWidth - 160) + 'px';
  comparePicker.style.top = Math.min(rect.bottom + 4, window.innerHeight - 200) + 'px';
  comparePicker.classList.remove('hidden');
}

startCompareBtn.addEventListener('click', async () => {
  comparePicker.classList.add('hidden');
  if (!compareGroupId) return;
  const group = allGroups.find(g => g.id === compareGroupId);
  if (!group) return;

  const checked = comparePicker.querySelectorAll('input[type=checkbox]:checked');
  if (checked.length === 0) { alert('请至少选择一种出行方式'); return; }
  const modes = Array.from(checked).map(cb => cb.value);

  const apiKey = await getApiKey();
  if (!apiKey) { alert('请先配置 API Key'); return; }

  compareGroupName.textContent = group.name;
  compareModal.classList.remove('hidden');
  compareBody.innerHTML = '<div style="text-align:center;padding:20px;color:#aeaeb2;">⏳ 正在查询...</div>';

  // 并行查询所有选中方式
  // v2.6: 对比也跟随方向
  const dir = await getCurrentDirection(group);
  const origin = dir === 'reversed' ? group.destination : group.origin;
  const destination = dir === 'reversed' ? group.origin : group.destination;

  const promises = modes.map(mode =>
    getCommuteTime(origin, destination, mode, apiKey)
      .then(r => ({ ...r, error: null }))
      .catch(e => ({ mode, error: e.message }))
  );
  const results = await Promise.all(promises);

  // 保存所有成功结果到历史
  for (const r of results) {
    if (!r.error) {
      await addHistoryRecord(group.id, {
        origin: group.origin,
        destination: group.destination,
        mode: r.mode,
        duration: r.duration,
        distance: r.distance,
        trafficStatus: r.trafficStatus || null,
        summary: r.summary || '',
      });
    }
  }

  // 渲染对比卡片
  compareBody.innerHTML = '<div class="compare-cards">' + results.map(r => {
    if (r.error) {
      return `<div class="compare-card compare-error">
        <div class="compare-mode">${MODE_LABELS[r.mode]||r.mode}</div>
        <div style="font-size:11px;color:#c62828;">❌ ${r.error}</div>
      </div>`;
    }
    const hours = Math.floor(r.duration / 60);
    const mins = r.duration % 60;
    let trafficBadge = '';
    if (r.trafficStatus && r.trafficStatus.level >= 1) {
      trafficBadge = `<span class="traffic-label traffic-${r.trafficStatus.level}">${TRAFFIC_ICONS[r.trafficStatus.level]||''} ${r.trafficStatus.label}</span>`;
    }
    return `<div class="compare-card">
      <div class="compare-mode">${MODE_LABELS[r.mode]||r.mode}</div>
      <div class="compare-duration">${hours>0?hours+'h':''}${mins}m</div>
      <div class="compare-dist">📏 ${r.distance||'?'}km</div>
      ${trafficBadge ? `<div>${trafficBadge}</div>` : ''}
    </div>`;
  }).join('') + '</div>';
});

closeCompareBtn.addEventListener('click', () => compareModal.classList.add('hidden'));
compareModal.querySelector('.modal-overlay').addEventListener('click', () => compareModal.classList.add('hidden'));

// 点击其他地方关闭对比选择器
document.addEventListener('click', (e) => {
  if (!comparePicker.classList.contains('hidden') && !e.target.closest('#comparePicker') && !e.target.closest('[data-action="compare"]')) {
    comparePicker.classList.add('hidden');
  }
});

// v2.4: 历史限制按钮（委托事件）
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.history-limit-btn');
  if (!btn) return;
  const limit = parseInt(btn.dataset.limit);
  await setHistoryLimit(limit);
  document.querySelectorAll('.history-limit-btn').forEach(b => {
    b.classList.toggle('btn-primary', parseInt(b.dataset.limit) === limit);
    b.classList.toggle('btn-secondary', parseInt(b.dataset.limit) !== limit);
  });
});

// ==================== v2.3 班次日历 ====================

// 班次图标映射
const SHIFT_ICONS = {
  day: '☀️',
  night: '🌙',
  rest: '🏖️',
  adjust: '🔄',
};
const SHIFT_LABELS = {
  day: '白班',
  night: '夜班',
  rest: '休息',
  adjust: '调休',
};

async function renderCalendar() {
  const cal = await getShiftCalendar();
  const year = calYear, month = calMonth;
  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=周日
  const totalDays = new Date(year, month, 0).getDate();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  let html = '';
  // 月份导航
  html += `<div class="cal-nav">
    <button class="cal-nav-btn" id="calPrev">◀</button>
    <span class="cal-title">${year}年${month}月</span>
    <button class="cal-nav-btn" id="calNext">▶</button>
  </div>`;

  // 星期头
  html += `<div class="cal-weekdays">
    <span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span>
  </div>`;

  // 日期网格
  html += '<div class="cal-grid">';
  // 填充上月空白
  for (let i = 0; i < firstDay; i++) {
    html += '<div class="cal-cell cal-empty"></div>';
  }
  // 本月日期
  for (let d = 1; d <= totalDays; d++) {
    const ds = `${year}-${pad(month)}-${pad(d)}`;
    const isToday = ds === todayStr;
    const entry = cal[ds];
    let cls = 'cal-cell';
    if (isToday) cls += ' cal-today';
    if (entry) cls += ' cal-set';
    const icon = entry ? SHIFT_ICONS[entry.type] || '' : '';
    const label = entry ? (entry.type === 'adjust' ? (entry.sub === 'am' ? '调休(上)' : '调休(下)') : SHIFT_LABELS[entry.type]) : '';
    html += `<div class="${cls}" data-date="${ds}" title="${label}">
      <span class="cal-day">${d}</span>
      <span class="cal-icon">${icon}</span>
    </div>`;
  }
  html += '</div>';

  // 图例
  html += `<div class="cal-legend">
    <span>☀️白班</span><span>🌙夜班</span><span>🏖️休息</span><span>🔄调休</span>
  </div>`;

  calendarContainer.innerHTML = html;

  // 导航事件
  calendarContainer.querySelector('#calPrev').addEventListener('click', (e) => {
    e.stopPropagation();
    if (calMonth === 1) { calMonth = 12; calYear--; }
    else calMonth--;
    renderCalendar();
  });
  calendarContainer.querySelector('#calNext').addEventListener('click', (e) => {
    e.stopPropagation();
    if (calMonth === 12) { calMonth = 1; calYear++; }
    else calMonth++;
    renderCalendar();
  });

  // 日期点击事件
  calendarContainer.querySelectorAll('.cal-cell:not(.cal-empty)').forEach(cell => {
    cell.addEventListener('click', (e) => {
      e.stopPropagation();
      const dateStr = cell.dataset.date;
      showShiftPicker(dateStr, cell);
    });
  });
}

function showShiftPicker(dateStr, cell) {
  // 移除已有选择器
  const existing = document.querySelector('.shift-picker');
  if (existing) existing.remove();

  const picker = document.createElement('div');
  picker.className = 'shift-picker';
  picker.innerHTML = `
    <div class="shift-option" data-type="day">☀️ 白班</div>
    <div class="shift-option" data-type="night">🌙 夜班</div>
    <div class="shift-option" data-type="rest">🏖️ 休息</div>
    <div class="shift-option" data-type="adjust">🔄 调休</div>
  `;
  document.body.appendChild(picker);

  // 定位到点击的单元格附近
  const rect = cell.getBoundingClientRect();
  picker.style.left = Math.min(rect.left, window.innerWidth - 140) + 'px';
  picker.style.top = Math.min(rect.bottom + 4, window.innerHeight - 200) + 'px';

  picker.querySelectorAll('.shift-option').forEach(opt => {
    opt.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const type = opt.dataset.type;
      if (type === 'adjust') {
        // 调休二级弹窗
        picker.remove();
        showAdjustPicker(dateStr, cell);
      } else {
        picker.remove();
        await setShiftDate(dateStr, { type });
        renderCalendar();
        await loadHolidayStatus();
        await loadGroups();
      }
    });
  });

  // 点击其他地方关闭
  setTimeout(() => {
    document.addEventListener('click', function closePicker() {
      const p = document.querySelector('.shift-picker');
      if (p) p.remove();
      document.removeEventListener('click', closePicker);
    }, { once: true });
  }, 0);
}

function showAdjustPicker(dateStr, cell) {
  const picker = document.createElement('div');
  picker.className = 'shift-picker';
  picker.innerHTML = `
    <div style="font-size:11px;color:#757575;padding:4px 10px;border-bottom:1px solid #eee;">选择调休时段</div>
    <div class="shift-option" data-sub="am">🌅 上午调休</div>
    <div class="shift-option" data-sub="pm">🌇 下午调休</div>
    <div class="shift-option shift-cancel">↩ 返回</div>
  `;
  document.body.appendChild(picker);

  const rect = cell.getBoundingClientRect();
  picker.style.left = Math.min(rect.left, window.innerWidth - 140) + 'px';
  picker.style.top = Math.min(rect.bottom + 4, window.innerHeight - 200) + 'px';

  picker.querySelectorAll('.shift-option').forEach(opt => {
    opt.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const sub = opt.dataset.sub;
      if (sub) {
        picker.remove();
        await setShiftDate(dateStr, { type: 'adjust', sub });
        renderCalendar();
        await loadHolidayStatus();
        await loadGroups();
      } else {
        // 返回上一级
        picker.remove();
        showShiftPicker(dateStr, cell);
      }
    });
  });

  setTimeout(() => {
    document.addEventListener('click', function closePicker() {
      const p = document.querySelector('.shift-picker');
      if (p) p.remove();
      document.removeEventListener('click', closePicker);
    }, { once: true });
  }, 0);
}

// ==================== 工具函数 ====================
function showMessage(el, text, type) {
  el.textContent = text;
  el.className = 'msg';
  if (type) el.classList.add(`msg-${type}`);
  el.classList.remove('hidden');
}

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
