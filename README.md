<div align="center">

# 🎯 pick-to-edit

**Visually pick a webpage element → annotate → let Claude Code change exactly that.**

可视化选取网页元素 · 写批注 · 让 Claude Code 精准改代码

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude-Code-skill-blueviolet.svg)](https://claude.com/claude-code)
[![Dependencies](https://img.shields.io/badge/dependencies-0-green.svg)](#)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey.svg)](#)

<!-- 📸 演示 GIF 占位：把一段 15 秒操作录屏放到 docs/demo.gif，取消下面注释 -->
<!-- <img src="docs/demo.gif" width="600" /> -->

</div>

---

## 💡 为什么需要它

让 AI 改网页时，最费劲的从来不是"改什么"，而是"**改哪个**"：

> ❌ "把**那个**卡片改一下" — AI：哪个卡片？
> ❌ "这里间距太大" — AI：哪里？
> ❌ "标题加粗" — AI：页面里有 8 个标题，哪个？

pick-to-edit 让你**直接在浏览器里点选元素**，AI 立刻知道你指的是哪个，并自动拿到它的 CSS selector / XPath / 尺寸，精准定位到代码去改。

### Before vs After

| 没有 pick-to-edit | 用 pick-to-edit |
|---|---|
| 你："把首页那个 CTA 改成圆角" | 你：`/pick-to-edit` |
| AI："首页有 3 个按钮，指哪个？给我 selector？" | （浏览器自动打开，你点按钮） |
| 你：开 DevTools，找元素，复制 selector，粘贴回来 | selector 已自动复制，你只需说"改圆角" |
| AI："好的，改好了" | AI：（已有精确 selector）改好了 |

---

## ⚙️ 它怎么工作

```
你说「改首页那个标题」
        ↓
skill 自动部署工具 + 起本地服务 + 打开浏览器
        ↓
你在网页：鼠标移动高亮 → [ ] 切层 → Enter 选中（自动复制 selector）→ 写批注 → ✓ 选完了
        ↓
Claude 读取标注（selector / XPath / 文本预览 / 你的批注）
        ↓
Claude 精准定位 html / css / js → 改
```

---

## ✨ 核心特性

| | |
|---|---|
| 🎯 **选中即复制** | `Enter` 一按，CSS selector 已在剪贴板，toast 告诉你复制了啥 |
| ⚡ **全键盘流** | `⌘C` 复制 · `⌘Enter` 快速标注 · `⌘Z` 撤销 · `Tab` 切标签 · `1-9` 跳层 |
| 🗂 **图层切换** | 重叠元素用 `[` `]` 上下切（基于 `elementsFromPoint`），选到任意一层 |
| 🛡 **Shadow DOM 隔离** | picker UI 与页面 CSS 完全隔离，不污染你，也不被你破坏 |
| 📋 **一键多格式复制** | 批注框复制 selector / XPath / HTML；面板复制全部 selector / JSON |
| 📊 **标注管理面板** | 点工具栏数字展开，单条删除、查看全部 |
| 🏷 **三种标签** | 🔴 改 · 🟡 问 · 🟢 赞 |
| 📦 **零依赖** | Node 内置模块，无需 `npm install`，也不碰你的 `package.json` |

---

## 🚀 快速开始

### 1. 安装（一条命令）

```bash
git clone https://github.com/CGIFM/pick-to-edit.git
cp -r pick-to-edit/skills/pick-to-edit ~/.claude/skills/
```

skill 目录自带 `picker.js` + `annotate-server.js`，触发时自动部署到目标项目，你不用给每个网站手动配置。

### 2. 用起来

在**任意静态网站项目**的 Claude Code 对话里说一句人话：

> 我要改首页那个标题

或手动触发：

```
/pick-to-edit
```

Claude 会自动把工具复制到当前项目、起服务、开浏览器。你选完元素点「✓ 选完了」，回对话告诉它怎么改即可。

---

## ⌨️ 操作��查

| 操作 | 功能 |
|---|---|
| 鼠标移动 | 实时高亮 + 显示 `tag#id.class · 尺寸 · 完整selector` |
| `]` / `[` | 往父级底层 / 子级顶层切 |
| `1` – `9` | 直接跳到第 N 层 |
| 滚轮 | 滚动页面（pick 模式下仍可滚） |
| **`Enter` / 点击** | 选中 → **selector 自动进剪贴板** → 弹批注框 |
| **`⌘C`** *(hover)* | 直接复制当前层 selector，不用选中 |
| **`⌘Enter`** *(hover)* | 快速标注：跳过打字直接提交，批量标记利器 |
| **`⌘Z`** | 撤销上一条标注 |
| **`Tab`** *(批注框)* | 切换 🔴改 / 🟡问 / 🟢赞 |
| 批注框 3 按钮 | 一键复制 selector / XPath / HTML |
| 点工具栏数字 | 标注面板：单条删除 + 复制全部 selector / JSON |
| `Esc` | 关面板 / 取消选中 / 退出 pick |

> 角标 `● 3/6 · 1200×834` 表示当前在第 3 层、该位置共 6 层重叠、元素尺寸 1200×834。

---

## 📋 标注数据格式

每条标注写入目标项目的 `annotations.json`，Claude 读取后据此定位代码：

```json
{
  "id": "ann-001",
  "selector": "#hero .quote",
  "xpath": "/html/body/main/section[1]/...",
  "tag": "改",
  "tagName": "p",
  "textPreview": "这段文字的前几十个字…",
  "htmlPreview": "<p class=\"quote\">…",
  "rect": { "x": 120, "y": 88, "w": 640, "h": 48 },
  "note": "这段关键词要加粗"
}
```

---

## 🧭 适用 / 不适用

| ✅ 适合 | ⚠️ 注意 |
|---|---|
| 静态网站（HTML/CSS/JS） | React/Vue 项目需先 `build` 或 dev server 跑着（picker 注入 HTML，框架无关） |
| 个人主页、作品集、简历 | 需能在 `localhost` 用静态文件访问 |
| 文档站、营销页、原型 | SSR 动态内容可能选不到（页面重渲染后元素失效） |

---

## ❓ FAQ

**Q：能用在我的 React/Vue 项目吗？**
能。只要它在 localhost 跑得起来、有真实 DOM。picker 直接操作 DOM，与框架无关。

**Q：标注存在哪？会提交到 git 吗？**
存在项目根的 `annotations.json`，是临时数据。skill 自带 `.gitignore` 会忽略它。

**Q：多个项目会串吗？**
不会。每次触发只在当前项目目录起服务、写该目录的 `annotations.json`。

**Q：Claude 怎么读到我标的东西？**
你点「✓ 选完了」后回对话说一声，Claude 会 `curl /__annotate` 读取全部标注。

---

## 🔧 自定义

| 想改 | 改哪 |
|---|---|
| 服务端口（默认 4321） | `annotate-server.js` 顶部 `PORT` |
| 标签（改/问/赞） | `picker.js` 里的 `.tag` 元素 |
| selector 生成策略 | `picker.js` 的 `cssPath()` |

---

## 📁 文件结构

```
pick-to-edit/
├── README.md
├── LICENSE
├── package.json
└── skills/
    └── pick-to-edit/
        ├── SKILL.md              # Claude Code skill 定义（自动部署 + 触发流程）
        ├── picker.js             # 前端可视化选择器（Shadow DOM 隔离）
        └── annotate-server.js    # 零依赖本地服务：serve 目录 + 注入 picker + 接收标注
```

## 🔧 工作原理

1. 触发 skill 时，Claude 把 `picker.js` + `annotate-server.js` 复制到目标项目根（仅首次）。
2. `annotate-server.js` serve 项目目录，返回 HTML 时自动注入 `<script src="/__picker.js">`。
3. `picker.js` 装进 Shadow DOM 与页面隔离；鼠标移动用 `document.elementsFromPoint(x, y)` 取该坐标下**整摞**重叠元素，按键在栈里上下切换。
4. 选中 + 写批注 + 确认 → POST → append 进 `annotations.json`。
5. Claude 读 `annotations.json`，靠 `selector` / `textPreview` 定位代码改动。

---

## 📄 License

[MIT](./LICENSE) · 自由使用、修改、分发。

---

<div align="center">

Made with ☕ by [FengMingyang](https://github.com/CGIFM)

如果这个项目帮到你，欢迎 ⭐ Star 让更多人看到。

</div>
