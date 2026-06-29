# pick-to-edit

> Visually pick a webpage element, annotate it, and let Claude Code change exactly that.

可视化选取网页元素 → 写批注 → 让 Claude Code 精准定位代码去改。

当你要改网页上"那块"东西时，不用费劲描述位置——直接在浏览器里**用鼠标点选元素**，打个勾写句批注，Claude 就知道你指的是哪个，直接定位到代码改掉。

解决 AI 辅助前端开发里最烦的一个痛点：**"我说'这个标题'，AI 不知道是哪个标题。"**

---

## 它怎么工作

```
你说「我要改首屏这个标题」
        ↓
skill 自动起本地服务 + 打开浏览器
        ↓
你在网页上：鼠标移动高亮 → [ ] 切换堆叠图层 → Enter 选中 → 写批注 → ✓ 选完了
        ↓
Claude 读取标注（CSS selector / XPath / 文本预览 / 你的批注）
        ↓
Claude 精准定位 index.html / styles.css / script.js 里对应代码 → 改
```

## 核心特性

- **图层切换** — 鼠标停在重叠元素上，用 `[` `]` 在堆叠层级间上下切（基于 `document.elementsFromPoint`），选到任意一层，不被最顶层挡住。
- **Shadow DOM 隔离** — picker UI 与页面 CSS 完全隔离，不污染你的样式，也不被你的样式破坏。
- **结构化标注** — 每条标注自动生成稳健的 CSS selector / XPath / 元素矩形 / 文本预览，AI 能精确对应回代码。
- **三种标签** — 🔴 改 / 🟡 问 / 🟢 赞，分类管理。
- **零依赖** — server 用 Node 内置模块，无需 `npm install`。

## 快速开始

### 1. 把 skill 装进 Claude Code

```bash
# 用户级（所有项目可用，推荐）
cp -r skills/pick-to-edit ~/.claude/skills/

# 或项目级（仅当前项目）
cp -r skills/pick-to-edit .claude/skills/
```

### 2. 把 picker + server 放进你的网页项目

```bash
cp picker.js annotate-server.js package.json /path/to/your-website/
```

### 3. 用起来

在 Claude Code 里说一句人话：

> 我要改首页那个标题

或手动触发：

```
/pick-to-edit
```

Claude 会自动 `npm run annotate` 起服务、打开浏览器。你选完元素、点「✓ 选完了」，回对话告诉它怎么改即可。

## 操作速查

| 操作 | 功能 |
|---|---|
| 鼠标移动 | 实时高亮当前层 + 显示标签名 |
| `]` | 往父级 / 底层切 |
| `[` | 往子级 / 顶层切 |
| `1`–`5` | 直接跳到第 N 层 |
| 滚轮 | 滚动页面 |
| `Enter` / 点击 | 锁定 → 弹批注框 |
| ✓ 确认 | 落盘（写入 `annotations.json`） |
| 「✓ 选完了」 | 结束选取，回 Claude 对话 |
| `Esc` | 取消 / 退出 |

角标 `● 3/6` 表示当前在第 3 层、该位置共 6 层重叠。

## 标注数据格式

每条标注写入 `annotations.json`：

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

## 自定义

- **端口**：默认 `4321`，改 `annotate-server.js` 顶部的 `PORT`。
- **标签**：改 `picker.js` 里的 `.tag` 元素（默认 改 / 问 / 赞）。
- **目标页面**：skill 默认 `index.html`，触发时可指定其他 HTML。

## 文件说明

| 文件 | 作用 |
|---|---|
| `picker.js` | 前端可视化选择器（Shadow DOM 隔离，hover 高亮 + `[` `]` 切层） |
| `annotate-server.js` | 本地零依赖服务，serve 当前目录 + 自动注入 picker + 接收标注 |
| `skills/pick-to-edit/SKILL.md` | Claude Code skill 定义 |
| `package.json` | `npm run annotate` 启动脚本 |

## 工作原理

1. `annotate-server.js` serve 你的项目目录，并在返回 HTML 时自动注入 `<script src="/__picker.js">`。
2. `picker.js` 装进 Shadow DOM 与页面隔离；鼠标移动时用 `document.elementsFromPoint(x, y)` 取到该坐标下**整摞**重叠元素，按键在栈里上下切换。
3. 选中 + 写批注 + 确认 → POST 到 server → append 进 `annotations.json`。
4. Claude 读 `annotations.json`，靠 `selector` / `textPreview` 定位代码改动。

## License

[MIT](./LICENSE)
