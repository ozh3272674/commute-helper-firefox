// ============================================================
// 节假日/工作日判断模块 — 通勤助手 v2.1
// 数据来源：timor.tech 免费节假日 API
// ============================================================

const HOLIDAY_CACHE_KEY = 'holiday_cache';
const HOLIDAY_LAST_FETCH_KEY = 'holiday_last_fetch';
const CACHE_TTL = 12 * 60 * 60 * 1000; // 缓存 12 小时

/**
 * 获取指定日期的节假日/工作日信息
 * @param {Date} date - 要查询的日期，默认今天
 * @returns {Promise<{isWorkday: boolean, isHoliday: boolean, name: string, type: string}>}
 *   type: 'workday' | 'holiday' | 'rest' | 'adjusted_workday'
 */
export async function getDateInfo(date = new Date()) {
  const dateStr = formatDate(date);

  // 先查缓存
  const cache = await loadCache();
  if (cache[dateStr]) {
    return cache[dateStr];
  }

  // 调用 API
  try {
    const info = await fetchHolidayInfo(dateStr);
    cache[dateStr] = info;
    await saveCache(cache);
    return info;
  } catch (e) {
    console.warn('[通勤助手] 节假日 API 请求失败，使用本地判断:', e.message);
    // 降级：周一至周五视为工作日
    return localFallback(date);
  }
}

/**
 * 判断今天是否为工作日（考虑班次设置）
 * @param {string} shiftType - 'day' | 'night' | 'none'
 * @returns {Promise<boolean>}
 */
export async function isTodayWorkday(shiftType) {
  if (shiftType === 'none') return false;
  const info = await getDateInfo();
  return info.isWorkday;
}

// ==================== 内部实现 ====================

async function fetchHolidayInfo(dateStr) {
  const url = `https://timor.tech/api/holiday/info/${dateStr}`;
  const res = await fetch(url);
  const data = await res.json();

  if (data.code !== 0) {
    throw new Error('节假日 API 返回异常');
  }

  const holiday = data.holiday;
  const typeInfo = data.type;

  if (holiday && holiday.holiday) {
    // 法定节假日
    return {
      isWorkday: false,
      isHoliday: true,
      name: holiday.name || '节假日',
      type: 'holiday',
    };
  }

  if (typeInfo) {
    // type: 0=工作日, 1=休息日, 2=节假日, 3=调休工作日
    if (typeInfo.type === 3) {
      return {
        isWorkday: true,
        isHoliday: false,
        name: '调休工作日',
        type: 'adjusted_workday',
      };
    }
    if (typeInfo.type === 1 || typeInfo.type === 2) {
      return {
        isWorkday: false,
        isHoliday: typeInfo.type === 2,
        name: typeInfo.name || (typeInfo.type === 2 ? '节假日' : '休息日'),
        type: typeInfo.type === 2 ? 'holiday' : 'rest',
      };
    }
  }

  // 普通工作日
  return {
    isWorkday: true,
    isHoliday: false,
    name: '工作日',
    type: 'workday',
  };
}

function localFallback(date) {
  const day = date.getDay();
  const isWorkday = day >= 1 && day <= 5;
  return {
    isWorkday,
    isHoliday: false,
    name: isWorkday ? '工作日（本地判断）' : '休息日（本地判断）',
    type: isWorkday ? 'workday' : 'rest',
  };
}

// ==================== 缓存管理 ====================

async function loadCache() {
  const lastFetch = await browser.storage.local.get(HOLIDAY_LAST_FETCH_KEY);
  const now = Date.now();

  if (lastFetch[HOLIDAY_LAST_FETCH_KEY] && (now - lastFetch[HOLIDAY_LAST_FETCH_KEY] > CACHE_TTL)) {
    // 缓存过期，清除
    await browser.storage.local.remove(HOLIDAY_CACHE_KEY);
    await browser.storage.local.remove(HOLIDAY_LAST_FETCH_KEY);
    return {};
  }

  const result = await browser.storage.local.get(HOLIDAY_CACHE_KEY);
  return result[HOLIDAY_CACHE_KEY] || {};
}

async function saveCache(cache) {
  await browser.storage.local.set({
    [HOLIDAY_CACHE_KEY]: cache,
    [HOLIDAY_LAST_FETCH_KEY]: Date.now(),
  });
}

// ==================== 工具函数 ====================

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
