// ============================================================
// 高德地图 API 封装模块
// ============================================================

const AMAP_BASE = 'https://restapi.amap.com';

/**
 * 地理编码：将地址文本转换为经纬度坐标
 * @param {string} address - 地址文本
 * @param {string} apiKey - 高德 API Key
 * @returns {Promise<{lng: number, lat: number, name: string, adcode: string}>}
 */
export async function geocode(address, apiKey) {
  const url = `${AMAP_BASE}/v3/geocode/geo?key=${apiKey}&address=${encodeURIComponent(address)}`;
  const res = await fetch(url);
  const data = await res.json();

  if (data.status !== '1') {
    throw new Error(`地理编码失败: ${data.info || '未知错误'}`);
  }

  const geocodes = data.geocodes;
  if (!geocodes || geocodes.length === 0) {
    throw new Error(`未找到地址: ${address}`);
  }

  const [lng, lat] = geocodes[0].location.split(',').map(Number);
  return {
    lng, lat,
    name: geocodes[0].formatted_address || address,
    adcode: geocodes[0].adcode || '',
    city: geocodes[0].city || '',
  };
}

/**
 * 路径规划查询
 * @param {string} origin - 起点地址
 * @param {string} destination - 终点地址
 * @param {string} mode - 出行方式: driving|transit|bicycling|walking
 * @param {string} apiKey - 高德 API Key
 * @returns {Promise<object>} 通勤结果
 */
export async function getCommuteTime(origin, destination, mode, apiKey) {
  // 先对起点和终点进行地理编码
  const [originGeo, destGeo] = await Promise.all([
    geocode(origin, apiKey),
    geocode(destination, apiKey),
  ]);

  const originStr = `${originGeo.lng},${originGeo.lat}`;
  const destStr = `${destGeo.lng},${destGeo.lat}`;

  let url;
  switch (mode) {
    case 'driving':
      url = `${AMAP_BASE}/v3/direction/driving?key=${apiKey}&origin=${originStr}&destination=${destStr}&extensions=all`;
      break;
    case 'transit':
      url = `${AMAP_BASE}/v3/direction/transit/integrated?key=${apiKey}&origin=${originStr}&destination=${destStr}&city=城市&extensions=all`;
      break;
    case 'bicycling':
      url = `${AMAP_BASE}/v4/direction/bicycling?key=${apiKey}&origin=${originStr}&destination=${destStr}`;
      break;
    case 'walking':
      url = `${AMAP_BASE}/v3/direction/walking?key=${apiKey}&origin=${originStr}&destination=${destStr}`;
      break;
    default:
      throw new Error(`不支持的出行方式: ${mode}`);
  }

  const res = await fetch(url);
  const data = await res.json();

  if (data.status !== '1') {
    throw new Error(`路径规划失败: ${data.info || '未知错误'}`);
  }

  return parseRouteResult(data, mode, originGeo, destGeo);
}

/**
 * 解析不同出行方式的返回结果
 */
function parseRouteResult(data, mode, originGeo, destGeo) {
  const result = {
    mode,
    origin: originGeo.name,
    destination: destGeo.name,
    originCoord: { lng: originGeo.lng, lat: originGeo.lat, adcode: originGeo.adcode },
    destCoord: { lng: destGeo.lng, lat: destGeo.lat, adcode: destGeo.adcode },
  };

  try {
    switch (mode) {
      case 'driving': {
        const route = data.route.paths[0];
        result.duration = Math.round(route.duration / 60);
        result.distance = Math.round(route.distance / 100) / 10;
        result.traffic_lights = route.traffic_lights || 0;
        result.trafficStatus = extractTrafficStatus(route);
        result.polyline = extractPolyline(route.steps);
        break;
      }
      case 'transit': {
        const route = data.route;
        if (route.transits && route.transits.length > 0) {
          const transit = route.transits[0];
          result.duration = Math.round(transit.duration / 60);
          result.distance = transit.distance ? Math.round(transit.distance / 100) / 10 : null;
          result.walkingDistance = transit.walking_distance
            ? Math.round(transit.walking_distance / 100) / 10 : null;
          const segments = transit.segments || [];
          result.summary = segments
            .filter(s => s.bus)
            .map(s => s.bus.buslines[0]?.name || '')
            .join(' → ');
          result.polyline = extractPolyline(segments);
        }
        break;
      }
      case 'bicycling': {
        const route = data.data.paths[0];
        result.duration = Math.round(route.duration / 60);
        result.distance = Math.round(route.distance / 100) / 10;
        result.polyline = extractPolyline(route.steps);
        break;
      }
      case 'walking': {
        const route = data.route.paths[0];
        result.duration = Math.round(route.duration / 60);
        result.distance = Math.round(route.distance / 100) / 10;
        result.polyline = extractPolyline(route.steps);
        break;
      }
    }
  } catch (e) {
    console.error('解析路径结果失败:', e);
    result.error = '解析路径数据失败';
  }

  return result;
}

/**
 * 从路径 steps 中提取 polyline（用于静态地图绘制）
 */
function extractPolyline(steps) {
  if (!steps || steps.length === 0) return '';
  const polylines = steps
    .map(s => s.polyline || '')
    .filter(p => p);
  return polylines.join(';');
}

/**
 * v2.5: 生成高德静态地图 URL（含路线绘制）
 */
export function getStaticMapUrl(result, apiKey) {
  const o = result.originCoord;
  const d = result.destCoord;
  if (!o || !d) return '';

  const size = '380*220';
  const scale = 2;
  const markers = `mid,0xFF0000,A:${o.lng},${o.lat};mid,0xFF0000,B:${d.lng},${d.lat}`;

  let url = `${AMAP_BASE}/v3/staticmap?key=${apiKey}&size=${size}&scale=${scale}&markers=${markers}`;

  if (result.polyline) {
    // 路线颜色按模式区分
    const colors = { driving: '0x007AFF', transit: '0x34c759', bicycling: '0xff9500', walking: '0x7c3aed' };
    const color = colors[result.mode] || '0x007AFF';
    url += `&paths=4,${color},1,,:${encodeURIComponent(result.polyline)}`;
  }

  return url;
}

/**
 * 从驾车路径规划的 steps 中提取路况状态
 * tmcs.status: 0=未知, 1=畅通, 2=缓行, 3=拥堵, 4=严重拥堵
 * 返回整体路况（取最差状态）
 */
function extractTrafficStatus(route) {
  try {
    let worstStatus = 0;
    const steps = route.steps || [];
    for (const step of steps) {
      const tmcs = step.tmcs || [];
      for (const tmc of tmcs) {
        if (tmc.status > worstStatus) worstStatus = tmc.status;
      }
    }
    return {
      level: worstStatus,
      label: TRAFFIC_LABELS[worstStatus] || '未知',
    };
  } catch (e) {
    return { level: 0, label: '未知' };
  }
}

// ==================== 天气查询 ====================

/**
 * 查询指定城市的实况天气
 * @param {string} adcode - 城市 adcode（从地理编码结果获取）
 * @param {string} apiKey - 高德 API Key
 * @returns {Promise<object|null>} 天气信息
 */
export async function getWeatherInfo(adcode, apiKey) {
  if (!adcode) return null;
  try {
    const url = `${AMAP_BASE}/v3/weather/weatherInfo?key=${apiKey}&city=${adcode}&extensions=base`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.status !== '1' || !data.lives || data.lives.length === 0) {
      console.warn('[通勤助手] 天气查询失败:', data.info || '无数据');
      return null;
    }

    const live = data.lives[0];
    return {
      city: live.city,
      weather: live.weather,               // 天气现象（文字）
      temperature: live.temperature,        // 实时气温（摄氏度）
      winddirection: live.winddirection,    // 风向
      windpower: live.windpower,           // 风力级别
      humidity: live.humidity,             // 湿度
      reporttime: live.reporttime,         // 发布时间
      isRainSnow: isRainSnowWeather(live.weather),
    };
  } catch (e) {
    console.warn('[通勤助手] 天气 API 请求异常:', e.message);
    return null;
  }
}

/**
 * 判断天气现象是否为雨雪
 */
function isRainSnowWeather(weatherText) {
  if (!weatherText) return false;
  // 包含"雨"或"雪"即为雨雪天气
  return weatherText.includes('雨') || weatherText.includes('雪');
}

/**
 * v2.2: 根据天气文字返回对应图标
 */
export function getWeatherIcon(weatherText) {
  if (!weatherText) return '☀️';
  const w = weatherText;
  if (w.includes('暴雨') || w.includes('大暴雨') || w.includes('特大暴雨')) return '⛈️';
  if (w.includes('大雨') || w.includes('中雨') || w.includes('雷阵雨')) return '🌧️';
  if (w.includes('雨') || w.includes('阵雨')) return '🌧️';
  if (w.includes('暴雪') || w.includes('大雪') || w.includes('中雪')) return '❄️';
  if (w.includes('雪') || w.includes('阵雪')) return '🌨️';
  if (w.includes('雾') || w.includes('霾')) return '🌫️';
  if (w.includes('沙尘') || w.includes('尘')) return '🌪️';
  if (w.includes('风') && !w.includes('微风')) return '💨';
  if (w.includes('多云') || w.includes('阴')) return '⛅';
  if (w.includes('晴')) return '☀️';
  return '☀️'; // 默认晴朗
}

// ==================== 路况/天气 标签映射 ====================

/** 路况状态标签：0=未知, 1=畅通, 2=缓行, 3=拥堵, 4=严重拥堵 */
export const TRAFFIC_LABELS = {
  0: '未知',
  1: '畅通',
  2: '缓行',
  3: '拥堵',
  4: '严重拥堵',
};

/** 路况状态对应的图标 */
export const TRAFFIC_ICONS = {
  1: '🟢',
  2: '🟡',
  3: '🔴',
  4: '🔴',
};

/**
 * 测试 API Key 是否有效（简单的地理编码测试）
 * @param {string} apiKey
 * @returns {Promise<boolean>}
 */
export async function testApiKey(apiKey) {
  let res;
  try {
    const url = `${AMAP_BASE}/v3/geocode/geo?key=${apiKey}&address=北京市朝阳区`;
    res = await fetch(url);
  } catch (e) {
    throw new Error(`网络请求失败: ${e.message || '请检查网络连接'}`);
  }

  if (!res.ok) {
    throw new Error(`HTTP 错误 (${res.status}): ${res.statusText}`);
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error('API 返回数据格式异常，请确认使用的是「Web服务」类型的 Key');
  }

  // 高德 API 返回状态: 1=成功, 0=失败
  if (data.status === '1') {
    return true;
  }

  // 根据高德错误码给出中文提示
  const errMsg = data.info || data.infocode || '';
  let hint = '';
  if (data.infocode === '10001') {
    hint = '（Key 不正确或已被删除）';
  } else if (data.infocode === '10002') {
    hint = '（Key 没有使用该服务的权限，请确认服务平台选的是「Web服务」）';
  } else if (data.infocode === '10003') {
    hint = '（访问量已达上限或配额不足）';
  } else if (data.infocode === '10004') {
    hint = '（IP 访问受限，请在 API Key 设置中检查 IP 白名单）';
  } else if (data.infocode === '10005') {
    hint = '（请求过于频繁，请稍后重试）';
  } else if (data.infocode === '20000') {
    hint = '（服务不可用，请稍后重试）';
  }

  throw new Error(`${errMsg}${hint}`);
}

/**
 * 出行方式的中文名称映射
 */
export const MODE_LABELS = {
  driving: '驾车',
  transit: '公共交通',
  bicycling: '骑行',
  walking: '步行',
};

/**
 * 格式化通勤结果为人可读的文本
 */
export function formatCommuteResult(result) {
  const modeLabel = MODE_LABELS[result.mode] || result.mode;
  let text = `【${modeLabel}】\n`;
  text += `从: ${result.origin}\n`;
  text += `到: ${result.destination}\n`;

  if (result.duration !== undefined) {
    const hours = Math.floor(result.duration / 60);
    const mins = result.duration % 60;
    text += `预计耗时: ${hours > 0 ? hours + '小时' : ''}${mins}分钟\n`;
  }
  if (result.distance !== null && result.distance !== undefined) {
    text += `距离: ${result.distance}公里\n`;
  }
  if (result.summary) {
    text += `方案: ${result.summary}\n`;
  }

  return text;
}

/**
 * v2.5: 获取中国行政区划（省/市/区三级）
 * @returns {Promise<Array>} [{ name, adcode, level, children }]
 */
export async function getDistrictTree(apiKey) {
  const url = `${AMAP_BASE}/v3/config/district?key=${apiKey}&keywords=中国&subdistrict=3`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== '1' || !data.districts || data.districts.length === 0) {
    throw new Error('获取行政区划失败');
  }
  return data.districts[0].districts || []; // 返回省份列表
}
