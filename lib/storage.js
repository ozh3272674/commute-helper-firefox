// ============================================================
// 本地存储管理模块 — 通勤助手 v2.1
// 支持：组级定时、到岗/到家时间、迟到预警、班次类型、假期缓存
// ============================================================

const STORAGE_KEYS = {
  API_KEY: 'amap_api_key',
  GROUPS: 'commute_groups',
  DATA_MIGRATED: 'data_migrated_v3',
  LAST_WEATHER: 'last_weather',        // v2.2: 上次天气查询缓存
  GLOBAL_SETTINGS: 'global_settings',  // v2.2: 全局班次时间设置
  SHIFT_CALENDAR: 'shift_calendar',    // v2.3: 班次日历 { "YYYY-MM-DD": { type, sub? } }
  HISTORY_LIMIT: 'history_limit',      // v2.4: 历史记录上限 (20|30|50)，默认30
};

// ==================== 数据迁移 ====================

/**
 * 将旧版全局定时迁移到各组，并初始化新字段
 */
async function migrateIfNeeded() {
  const result = await browser.storage.local.get(STORAGE_KEYS.DATA_MIGRATED);
  if (result[STORAGE_KEYS.DATA_MIGRATED]) return;

  const groups = await getAllGroupsRaw();
  const oldSlots = await browser.storage.local.get('schedule_slots');
  const oldScheduleSlots = oldSlots.schedule_slots || [];
  const oldAuto = await browser.storage.local.get('schedule_time');
  const oldAutoConfig = oldAuto.schedule_time;

  // 迁移旧全局时段到第一个开启了自动查询的组
  const autoGroup = groups.find(g => g.autoQueryEnabled);
  if (autoGroup && oldScheduleSlots.length > 0) {
    autoGroup.scheduleSlots = oldScheduleSlots;
  } else if (autoGroup && oldAutoConfig && oldAutoConfig.enabled) {
    autoGroup.scheduleSlots = [{
      id: generateId(), hour: oldAutoConfig.hour, minute: oldAutoConfig.minute, enabled: true,
    }];
  }

  // 确保所有组都有新字段
  for (const g of groups) {
    if (!g.scheduleSlots) g.scheduleSlots = [];
    if (!g.arriveBy) g.arriveBy = '';
    if (!g.homeBy) g.homeBy = '';
    if (!g.shiftType) g.shiftType = 'day'; // v2.1 新增：班次类型，默认白班
    g.updatedAt = g.updatedAt || g.createdAt || Date.now();
    delete g.autoQueryEnabled; // 清理旧字段
  }

  await browser.storage.local.set({
    [STORAGE_KEYS.GROUPS]: groups,
    [STORAGE_KEYS.DATA_MIGRATED]: true,
  });
  // 清除旧数据
  await browser.storage.local.remove('schedule_slots');
  await browser.storage.local.remove('schedule_time');
  await browser.storage.local.remove('schedule_interval');
}

async function getAllGroupsRaw() {
  const result = await browser.storage.local.get(STORAGE_KEYS.GROUPS);
  return result[STORAGE_KEYS.GROUPS] || [];
}

// ==================== API Key 管理 ====================

export async function getApiKey() {
  const result = await browser.storage.local.get(STORAGE_KEYS.API_KEY);
  return result[STORAGE_KEYS.API_KEY] || '';
}

export async function setApiKey(key) {
  await browser.storage.local.set({ [STORAGE_KEYS.API_KEY]: key });
}

// ==================== 地点组管理 ====================

export async function getAllGroups() {
  await migrateIfNeeded();
  return await getAllGroupsRaw();
}

export async function saveGroup(group) {
  await migrateIfNeeded();
  const groups = await getAllGroupsRaw();

  if (group.id) {
    const idx = groups.findIndex(g => g.id === group.id);
    if (idx >= 0) {
      groups[idx] = { ...groups[idx], ...group, updatedAt: Date.now() };
    }
  } else {
    group.id = generateId();
    group.createdAt = Date.now();
    group.updatedAt = Date.now();
    group.pinned = false;
    group.scheduleSlots = [];
    group.arriveBy = '';
    group.homeBy = '';
    group.shiftType = 'day';   // v2.1: 默认白班
    group.lastResult = null;
    group.lastQueryTime = null;
    groups.push(group);
  }

  await browser.storage.local.set({ [STORAGE_KEYS.GROUPS]: groups });
  return group;
}

export async function deleteGroup(id) {
  let groups = await getAllGroupsRaw();
  groups = groups.filter(g => g.id !== id);
  await browser.storage.local.set({ [STORAGE_KEYS.GROUPS]: groups });
}

export async function togglePin(id) {
  const groups = await getAllGroupsRaw();
  const g = groups.find(g => g.id === id);
  if (g) { g.pinned = !g.pinned; g.updatedAt = Date.now(); }
  await browser.storage.local.set({ [STORAGE_KEYS.GROUPS]: groups });
  return g;
}

export async function updateGroupResult(id, result) {
  const groups = await getAllGroupsRaw();
  const g = groups.find(g => g.id === id);
  if (g) {
    g.lastResult = result;
    g.lastQueryTime = Date.now();
    g.updatedAt = Date.now();
  }
  await browser.storage.local.set({ [STORAGE_KEYS.GROUPS]: groups });
  return g;
}

export async function updateGroupMode(id, mode) {
  const groups = await getAllGroupsRaw();
  const g = groups.find(g => g.id === id);
  if (g) { g.mode = mode; g.updatedAt = Date.now(); }
  await browser.storage.local.set({ [STORAGE_KEYS.GROUPS]: groups });
  return g;
}

/**
 * 更新组的到岗/到家时间
 */
export async function updateGroupTimes(id, arriveBy, homeBy) {
  const groups = await getAllGroupsRaw();
  const g = groups.find(g => g.id === id);
  if (g) {
    g.arriveBy = arriveBy || '';
    g.homeBy = homeBy || '';
    g.updatedAt = Date.now();
  }
  await browser.storage.local.set({ [STORAGE_KEYS.GROUPS]: groups });
  return g;
}

/**
 * 更新组的班次类型（v2.1 新增）
 * @param {string} id
 * @param {string} shiftType - 'day' | 'night' | 'none'
 */
export async function updateGroupShift(id, shiftType) {
  const groups = await getAllGroupsRaw();
  const g = groups.find(g => g.id === id);
  if (g) { g.shiftType = shiftType; g.updatedAt = Date.now(); }
  await browser.storage.local.set({ [STORAGE_KEYS.GROUPS]: groups });
  return g;
}

export async function getSortedGroups() {
  await migrateIfNeeded();
  const groups = await getAllGroupsRaw();
  return groups.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
  });
}

// ==================== 组级定时时段管理 ====================

export async function getGroupScheduleSlots(groupId) {
  const groups = await getAllGroupsRaw();
  const g = groups.find(g => g.id === groupId);
  return g?.scheduleSlots || [];
}

export async function setGroupScheduleSlots(groupId, slots) {
  const groups = await getAllGroupsRaw();
  const g = groups.find(g => g.id === groupId);
  if (g) {
    g.scheduleSlots = slots.sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
    g.updatedAt = Date.now();
  }
  await browser.storage.local.set({ [STORAGE_KEYS.GROUPS]: groups });
}

export async function addGroupSlot(groupId, hour, minute) {
  const slots = await getGroupScheduleSlots(groupId);
  slots.push({ id: generateId(), hour, minute, enabled: true });
  await setGroupScheduleSlots(groupId, slots);
  return slots;
}

export async function removeGroupSlot(groupId, slotId) {
  let slots = await getGroupScheduleSlots(groupId);
  slots = slots.filter(s => s.id !== slotId);
  await setGroupScheduleSlots(groupId, slots);
  return slots;
}

export async function toggleGroupSlot(groupId, slotId) {
  const slots = await getGroupScheduleSlots(groupId);
  const s = slots.find(s => s.id === slotId);
  if (s) { s.enabled = !s.enabled; }
  await setGroupScheduleSlots(groupId, slots);
  return s;
}

export async function updateGroupSlotTime(groupId, slotId, hour, minute) {
  const slots = await getGroupScheduleSlots(groupId);
  const s = slots.find(s => s.id === slotId);
  if (s) { s.hour = hour; s.minute = minute; }
  await setGroupScheduleSlots(groupId, slots);
  return s;
}

/**
 * 获取所有有启用定时时段的组（用于后台闹钟）
 */
export async function getGroupsWithEnabledSlots() {
  await migrateIfNeeded();
  const groups = await getAllGroupsRaw();
  return groups
    .filter(g => g.scheduleSlots && g.scheduleSlots.some(s => s.enabled))
    .map(g => ({
      id: g.id,
      name: g.name,
      origin: g.origin,
      destination: g.destination,
      mode: g.mode,
      arriveBy: g.arriveBy,
      homeBy: g.homeBy,
      shiftType: g.shiftType || 'day',
      scheduleSlots: g.scheduleSlots.filter(s => s.enabled),
    }));
}

// 兼容旧名
export async function getAutoQueryGroups() {
  const groups = await getGroupsWithEnabledSlots();
  return groups;
}

// ==================== 数据导出/导入 ====================

export async function exportData() {
  const groups = await getAllGroupsRaw();
  const apiKey = await getApiKey();

  const exportObj = {
    version: '2.1',
    exportTime: new Date().toISOString(),
    apiKey,
    groups,
  };

  const jsonStr = JSON.stringify(exportObj, null, 2);
  // 使用 FileReader 转 base64 data URL，避免 blob URL 在扩展环境失效
  const dataUrl = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(new Blob([jsonStr], { type: 'application/json' }));
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  await browser.downloads.download({
    url: dataUrl,
    filename: `通勤助手_备份_${timestamp}.json`,
    saveAs: true,
  });
}

/**
 * v2.4: 智能合并导入
 * - 同 ID 的组 → 覆盖更新
 * - 不同 ID 的组 → 追加
 * - API Key：如果导入数据有 Key 且与当前不同 → 返回 needsKeyConfirm
 */
export async function importData(jsonStr, mergeMode = true) {
  const data = JSON.parse(jsonStr);

  if (!data.version) throw new Error('无效的备份文件格式');

  let needsKeyConfirm = false;
  if (data.apiKey) {
    const currentKey = await getApiKey();
    if (currentKey && currentKey !== data.apiKey) {
      needsKeyConfirm = true;
    } else if (!currentKey) {
      await setApiKey(data.apiKey);
    }
  }

  if (Array.isArray(data.groups)) {
    if (mergeMode) {
      // v2.4: 智能合并
      const existing = await getAllGroupsRaw();
      const existingMap = new Map(existing.map(g => [g.id, g]));
      for (const imported of data.groups) {
        const normalized = {
          ...imported,
          scheduleSlots: imported.scheduleSlots || [],
          arriveBy: imported.arriveBy || '',
          homeBy: imported.homeBy || '',
          shiftType: imported.shiftType || 'day',
        };
        existingMap.set(imported.id, normalized);
      }
      const merged = Array.from(existingMap.values());
      await browser.storage.local.set({ [STORAGE_KEYS.GROUPS]: merged });
      await browser.storage.local.set({ [STORAGE_KEYS.DATA_MIGRATED]: true });
    } else {
      // 旧行为：完全覆盖
      const groups = data.groups.map(g => ({
        ...g,
        scheduleSlots: g.scheduleSlots || [],
        arriveBy: g.arriveBy || '',
        homeBy: g.homeBy || '',
        shiftType: g.shiftType || 'day',
      }));
      await browser.storage.local.set({ [STORAGE_KEYS.GROUPS]: groups });
      await browser.storage.local.set({ [STORAGE_KEYS.DATA_MIGRATED]: true });
    }
  }

  return { groupCount: data.groups?.length || 0, needsKeyConfirm };
}

/**
 * v2.4: 确认替换 API Key
 */
export async function confirmImportKey(newKey) {
  await setApiKey(newKey);
}

// ==================== v2.2 天气缓存 ====================

export async function getLastWeather() {
  const result = await browser.storage.local.get(STORAGE_KEYS.LAST_WEATHER);
  return result[STORAGE_KEYS.LAST_WEATHER] || null;
}

export async function saveLastWeather(weather) {
  await browser.storage.local.set({ [STORAGE_KEYS.LAST_WEATHER]: weather });
}

// ==================== v2.2 全局班次时间设置 ====================

const DEFAULT_GLOBAL_SETTINGS = {
  dayShiftStart: '08:00',
  dayShiftEnd: '17:00',
  nightShiftStart: '20:00',
  nightShiftEnd: '08:00',
};

export async function getGlobalSettings() {
  const result = await browser.storage.local.get(STORAGE_KEYS.GLOBAL_SETTINGS);
  return { ...DEFAULT_GLOBAL_SETTINGS, ...(result[STORAGE_KEYS.GLOBAL_SETTINGS] || {}) };
}

export async function saveGlobalSettings(settings) {
  await browser.storage.local.set({ [STORAGE_KEYS.GLOBAL_SETTINGS]: settings });
}

// ==================== v2.3 班次日历 ====================

/**
 * 获取全部班次日历数据
 * @returns {Promise<object>} { "2026-06-25": { type: "day"|"night"|"rest"|"adjust", sub?: "am"|"pm" } }
 */
export async function getShiftCalendar() {
  const result = await browser.storage.local.get(STORAGE_KEYS.SHIFT_CALENDAR);
  return result[STORAGE_KEYS.SHIFT_CALENDAR] || {};
}

/**
 * 设置某一天的班次
 */
export async function setShiftDate(dateStr, shiftData) {
  const cal = await getShiftCalendar();
  if (shiftData === null) {
    delete cal[dateStr];
  } else {
    cal[dateStr] = shiftData;
  }
  await browser.storage.local.set({ [STORAGE_KEYS.SHIFT_CALENDAR]: cal });
}

/**
 * 获取今天的班次类型（从日历读取）
 * @returns {Promise<string>} 'day' | 'night' | 'rest' | 'adjust' | ''
 */
export async function getTodayShiftType() {
  const today = formatDateStr(new Date());
  const cal = await getShiftCalendar();
  const entry = cal[today];
  return entry ? entry.type : '';
}

// ==================== v2.4 通勤历史记录 ====================

/**
 * 生成历史记录存储键
 */
function historyKey(groupId) {
  return `history_${groupId}`;
}

/**
 * 获取历史记录限制
 */
export async function getHistoryLimit() {
  const result = await browser.storage.local.get(STORAGE_KEYS.HISTORY_LIMIT);
  return result[STORAGE_KEYS.HISTORY_LIMIT] || 30;
}

/**
 * 设置历史记录限制
 */
export async function setHistoryLimit(limit) {
  await browser.storage.local.set({ [STORAGE_KEYS.HISTORY_LIMIT]: limit });
}

/**
 * 添加一条历史记录
 */
export async function addHistoryRecord(groupId, record) {
  const limit = await getHistoryLimit();
  const key = historyKey(groupId);
  const result = await browser.storage.local.get(key);
  const records = result[key] || [];
  records.unshift({
    id: generateId(),
    timestamp: Date.now(),
    ...record,
  });
  // 只保留最近 limit 条
  const trimmed = records.slice(0, limit);
  await browser.storage.local.set({ [key]: trimmed });
  return trimmed;
}

/**
 * 获取某组的历史记录
 */
export async function getHistoryRecords(groupId) {
  const key = historyKey(groupId);
  const result = await browser.storage.local.get(key);
  return result[key] || [];
}

/**
 * 获取某组在指定天数内的历史记录
 */
export async function getHistoryInRange(groupId, days) {
  const records = await getHistoryRecords(groupId);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return records.filter(r => r.timestamp >= cutoff);
}

// ==================== 工具函数 ====================

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function formatDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
