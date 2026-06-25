// ============================================================
// 通勤助手 — 后台脚本 v2.1
// 功能：组级定时闹钟 + 迟到预警 + 路况提醒 + 天气提示 + 工作日判断
// ============================================================

import {
  getApiKey, getGroupsWithEnabledSlots, updateGroupResult,
  saveLastWeather, getWeatherCity,
} from '../lib/storage.js';
import { getCommuteTime, getWeatherInfo, getWeatherIcon, TRAFFIC_LABELS, TRAFFIC_ICONS } from '../lib/amap.js';
import { isTodayWorkday, getDateInfo } from '../lib/calendar.js';

const ALARM_PREFIX = 'commute-';

// ==================== 启动 ====================
browser.runtime.onInstalled.addListener(() => {
  console.log('[通勤助手] 扩展已安装');
  restoreDefaultIcon();
  setupAllAlarms();
  checkLateWarning();
});
browser.runtime.onStartup.addListener(() => {
  restoreDefaultIcon();
  setupAllAlarms();
  checkLateWarning();
});

// 每5分钟检查一次迟到状态
browser.alarms.create('late-check', { periodInMinutes: 5 });
browser.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'late-check') {
    await checkLateWarning();
    return;
  }
  if (alarm.name.startsWith(ALARM_PREFIX)) {
    console.log('[通勤助手] 定时触发:', alarm.name);
    await runScheduledQuery(alarm.name);
    await checkLateWarning();
  }
});

// ==================== 闹钟管理 ====================
async function setupAllAlarms() {
  // 清除所有旧闹钟
  const existing = await browser.alarms.getAll();
  for (const a of existing) {
    if (a.name.startsWith(ALARM_PREFIX)) {
      await browser.alarms.clear(a.name);
    }
  }

  let groups = await getGroupsWithEnabledSlots();

  // v2.1: 过滤非工作日的组（shiftType=none 的组也跳过）
  const workdayGroups = [];
  for (const g of groups) {
    if (g.shiftType === 'none') continue;
    const isWorkday = await isTodayWorkday(g.shiftType);
    if (isWorkday) {
      workdayGroups.push(g);
    }
  }

  if (workdayGroups.length === 0) {
    restoreDefaultIcon();
    return;
  }

  const now = new Date();
  let alarmCount = 0;

  for (const group of workdayGroups) {
    for (const slot of group.scheduleSlots) {
      const alarmName = `${ALARM_PREFIX}${group.id}-${slot.id}`;

      const target = new Date(now);
      target.setHours(slot.hour, slot.minute, 0, 0);
      if (target <= now) target.setDate(target.getDate() + 1);

      const delayMin = Math.max(1, Math.round((target - now) / 60000));

      browser.alarms.create(alarmName, {
        delayInMinutes: delayMin,
        periodInMinutes: 24 * 60,
      });
      alarmCount++;
    }
  }

  console.log(`[通勤助手] 已设置 ${alarmCount} 个定时闹钟`);
  restoreDefaultIcon();
}

// ==================== 执行定时查询 ====================
async function runScheduledQuery(alarmName) {
  const apiKey = await getApiKey();
  if (!apiKey) return;

  // 从 alarm 名称解析 groupId: commute-{groupId}-{slotId}
  const parts = alarmName.slice(ALARM_PREFIX.length).split('-');
  const slotId = parts.pop();
  const groupId = parts.join('-');

  // 获取当前所有启用的组
  const groups = await getGroupsWithEnabledSlots();
  const group = groups.find(g => g.id === groupId);
  if (!group) return;

  // v2.1: 补充检查今天是否为工作日
  if (group.shiftType && group.shiftType !== 'none') {
    const isWorkday = await isTodayWorkday(group.shiftType);
    if (!isWorkday) {
      console.log(`[通勤助手] 今天非工作日，跳过「${group.name}」定时查询`);
      return;
    }
  }

  try {
    const result = await getCommuteTime(group.origin, group.destination, group.mode, apiKey);
    await updateGroupResult(group.id, result);

    const hours = Math.floor(result.duration / 60);
    const mins = result.duration % 60;
    const timeStr = hours > 0 ? `${hours}小时${mins}分钟` : `${mins}分钟`;

    // 构建通知消息
    let notifyMsg = `预计耗时: ${timeStr}`;
    if (result.distance) notifyMsg += `\n距离: ${result.distance}公里`;

    // v2.1: 路况检查（仅驾车模式）
    let trafficWarn = false;
    if (result.mode === 'driving' && result.trafficStatus && result.trafficStatus.level >= 3) {
      trafficWarn = true;
      const icon = TRAFFIC_ICONS[result.trafficStatus.level] || '🔴';
      notifyMsg += `\n${icon} 路况: ${result.trafficStatus.label}`;
    }

    browser.notifications.create(`result-${group.id}`, {
      type: 'basic',
      iconUrl: browser.runtime.getURL('icons/icon-48.svg'),
      title: `🚗 ${group.name} 通勤查询`,
      message: notifyMsg,
    });

    // v2.1: 路况拥堵主动提醒
    if (trafficWarn) {
      browser.notifications.create(`traffic-${group.id}`, {
        type: 'basic',
        iconUrl: browser.runtime.getURL('icons/icon-48.svg'),
        title: '🚦 路况拥堵预警',
        message: `「${group.name}」当前路况${result.trafficStatus.label}，建议提前出发！`,
      });
    }

    // v2.5: 天气检查（使用手动设置的城市）
    const city = await getWeatherCity();
    if (city && city.adcode) {
      const weather = await getWeatherInfo(city.adcode, apiKey);
      if (weather) {
        const wIcon = getWeatherIcon(weather.weather);
        await saveLastWeather({
          city: weather.city,
          adcode: city.adcode,
          weather: weather.weather,
          temperature: weather.temperature,
          icon: wIcon,
          reporttime: weather.reporttime,
          updateTime: Date.now(),
        });

        // v2.5: 雨雪天气切换拓展图标（迟到优先）
        if (weather.isRainSnow) {
          const isRain = weather.weather.includes('雨');
          setWeatherIcon(isRain);

          browser.notifications.create(`weather-${group.id}`, {
            type: 'basic',
            iconUrl: browser.runtime.getURL('icons/icon-48.svg'),
            title: '🌧️ 天气影响提示',
            message: `「${group.name}」目的地 ${weather.city}：${weather.weather}，温度${weather.temperature}℃，请提前出发注意安全！`,
          });
        } else {
          // 非雨雪天气恢复默认图标
          restoreDefaultIcon();
        }
      }
    }

    // 检查是否需要迟到预警
    await checkLateWarningForGroup(group, result);
  } catch (e) {
    console.error(`[通勤助手] 定时查询失败 [${group.name}]:`, e.message);
  }
}

// ==================== 迟到预警系统 ====================
async function checkLateWarning() {
  const groups = await getGroupsWithEnabledSlots();
  let anyLate = false;

  for (const group of groups) {
    if (!group.arriveBy || !group.lastResult) continue;

    if (group.shiftType && group.shiftType !== 'none') {
      const isWorkday = await isTodayWorkday(group.shiftType);
      if (!isWorkday) continue;
    }

    const isLate = isAboutToBeLate(group.arriveBy, group.lastResult.duration);
    if (isLate) {
      anyLate = true;
      break;
    }
  }

  if (anyLate) {
    setLateIcon();
  } else {
    restoreDefaultIcon();
  }
}

async function checkLateWarningForGroup(group, result) {
  if (!group.arriveBy || !result) return;

  const isLate = isAboutToBeLate(group.arriveBy, result.duration);
  if (isLate) {
    setLateIcon();

    browser.notifications.create(`late-${group.id}`, {
      type: 'basic',
      iconUrl: browser.runtime.getURL('icons/icon-48.svg'),
      title: '⚠️ 迟到预警！',
      message: `请赶紧上班，你要迟到了！\n「${group.name}」通勤需${result.duration}分钟，到岗时间${group.arriveBy}`,
    });
  }
}

/**
 * 判断是否即将迟到
 * 逻辑：(希望到岗时间 - 通勤耗时) <= 30分钟缓冲 → 触发预警
 */
function isAboutToBeLate(arriveByStr, commuteMinutes) {
  if (!arriveByStr || !commuteMinutes) return false;

  const [ah, am] = arriveByStr.split(':').map(Number);
  const now = new Date();
  const arriveByMin = ah * 60 + am;            // 到岗时间（分钟数）
  const latestLeaveMin = arriveByMin - commuteMinutes; // 最晚出发时间
  const nowMin = now.getHours() * 60 + now.getMinutes(); // 当前时间

  // 如果现在时间 >= 最晚出发时间 - 30分钟缓冲，即需要预警
  // 也就是说：剩余可拖延时间 <= 30分钟
  const remainingBuffer = latestLeaveMin - nowMin;
  return remainingBuffer <= 30 && remainingBuffer > -commuteMinutes;
}

// ==================== v2.5 图标管理 ====================

const DEFAULT_ICON = { 16: 'icons/icon-16.svg', 32: 'icons/icon-32.svg', 48: 'icons/icon-48.svg' };
const LATE_ICON   = { 16: 'icons/late-16.svg', 32: 'icons/late-32.svg', 48: 'icons/late-48.svg' };
const RAIN_ICON   = { 16: 'icons/rain-16.svg', 32: 'icons/rain-32.svg', 48: 'icons/rain-48.svg' };
const SNOW_ICON   = { 16: 'icons/snow-16.svg', 32: 'icons/snow-32.svg', 48: 'icons/snow-48.svg' };

let iconState = 'default'; // 'default' | 'late' | 'rain' | 'snow'

function restoreDefaultIcon() {
  iconState = 'default';
  browser.action.setIcon({ path: DEFAULT_ICON });
  browser.action.setBadgeText({ text: '' });
}

function setLateIcon() {
  // 迟到优先于天气，直接覆盖
  iconState = 'late';
  browser.action.setIcon({ path: LATE_ICON });
  browser.action.setBadgeText({ text: '' });
}

function setWeatherIcon(isRain) {
  // 只有当前不是迟到状态才切换天气图标
  if (iconState === 'late') return;
  iconState = isRain ? 'rain' : 'snow';
  browser.action.setIcon({ path: isRain ? RAIN_ICON : SNOW_ICON });
  browser.action.setBadgeText({ text: '' });
}

// ==================== 消息监听 ====================
browser.runtime.onMessage.addListener(async (message) => {
  if (message.action === 'updateSchedule') {
    await setupAllAlarms();
    await checkLateWarning();
    return { success: true };
  }

  // v2.5: 处理导出下载（支持 saveAs 对话框）
  if (message.action === 'exportDownload') {
    const blob = new Blob([message.data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    try {
      await browser.downloads.download({
        url,
        filename: message.filename,
        saveAs: true,
      });
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
    return { success: true };
  }

  if (message.action === 'runNow') {
    const groups = await getGroupsWithEnabledSlots();
    for (const group of groups) {
      try {
        const apiKey = await getApiKey();
        if (!apiKey) continue;
        const result = await getCommuteTime(group.origin, group.destination, group.mode, apiKey);
        await updateGroupResult(group.id, result);
      } catch (e) {
        console.error('[通勤助手] 手动触发查询失败:', e.message);
      }
    }
    await checkLateWarning();
    return { success: true };
  }

  return { success: false };
});
