# 🚗 通勤助手 (Commute Helper) — Firefox 扩展

> 一款运行在 Firefox 浏览器上的通勤时间查询扩展，支持定时自动查询、迟到预警、天气提醒和路况监测。

<p align="center">
  <img src="https://img.shields.io/badge/version-2.5.0-blue" alt="version">
  <img src="https://img.shields.io/badge/platform-Firefox%20115%2B-orange" alt="platform">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="license">
</p>

---

## ✨ 核心功能

| 功能 | 说明 |
|------|------|
| 🔍 **通勤查询** | 支持驾车/公交/骑行/步行，调用高德地图 API |
| ⏰ **定时自动查询** | 每个地点组可独立设置多个时间段 |
| ⚠️ **迟到智能预警** | 自动计算通勤耗时，提前 30 分钟警告 |
| 📊 **多方式对比** | 一键并排对比所有出行方式 |
| 📋 **历史记录** | 保留查询记录，支持折线图趋势分析 |
| 🚦 **实时路况** | 驾车模式自动检测拥堵并提醒 |
| 🌧️ **天气提示** | 雨雪天气自动提醒提前出发 |
| 📅 **班次日历** | 自定义白班/夜班/调休，自动排序 |
| 🎨 **FlowMouse 风格 UI** | iOS 风格蓝，纯白卡片，Toggle 开关 |

---

## 🛠 技术栈

| 层级 | 技术 |
|------|------|
| 平台 | Firefox Extension (Manifest V3) |
| 语言 | JavaScript (ES Modules) |
| 地图 | 高德地图 Web服务 API |
| 天气 | 高德天气 API |
| 假期 | timor.tech 节假日 API |
| 存储 | `browser.storage.local` |
| UI | HTML5 + CSS3（无框架，纯 Canvas 图表） |

---

## 📥 安装方式

### 方式一：临时加载（开发/测试）

1. 下载本项目所有文件
2. 打开 Firefox，地址栏输入 `about:debugging`
3. 点击「此 Firefox」→「临时载入附加组件」
4. 选择项目根目录下的 `manifest.json`
5. 完成！

### 方式二：永久安装（发布后）

> 待提交到 Firefox Add-ons 商店后，可直接搜索安装。

---

## 📖 使用说明

### 首次配置

1. 前往 [高德开放平台](https://lbs.amap.com/) 注册并创建应用
2. 添加 Key，服务平台选择 **「Web服务」**（非 Web端 JS API）
3. 打开扩展，输入 API Key → 「🧪 测试并保存」

### 创建地点组

1. 点击「＋ 新建地点组」
2. 填写名称、起点、终点、到岗/到家时间
3. 选择班次类型（白班 / 夜班 / 关闭）
4. 保存后即可查询

### 定时查询

1. 在卡片上点击「✎ 设置」定时时段
2. 添加多个时间（如 08:00、18:00）
3. 开启 Toggle 开关启用
4. 系统会在设定时间自动查询并通知

---

## 📁 项目结构

```
commute-helper-firefox/
├── manifest.json              # Firefox MV3 配置
├── background/
│   └── background.js          # 后台服务（闹钟 + 预警 + 图标）
├── popup/
│   ├── popup.html             # 弹出面板界面
│   ├── popup.css              # 样式表
│   └── popup.js               # 主逻辑
├── lib/
│   ├── amap.js                # 高德 API 封装
│   ├── storage.js             # 本地存储管理
│   └── calendar.js            # 节假日判断
├── icons/                     # 图标资源
├── LICENSE                    # MIT 许可证
└── README.md                  # 本文件
```

---

## 🌐 浏览器版本

| 版本 | 仓库 | 状态 |
|------|------|------|
| Firefox | `commute-helper-firefox` | ✅ 当前 |
| Chrome | `commute-helper-chrome` | 🔜 计划中 |

---

## 📄 许可证

MIT License © 2026 通勤助手
