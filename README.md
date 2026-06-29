# pick-to-edit

> Visually pick a webpage element, annotate it, and let Claude Code change exactly that.

可视化选取网页元素 → 写批注 → 让 Claude Code 精准定位代码去改。**适用于任何静态网站项目。**

当你要改网页上"那块"东西时，不用费劲描述位置——直接在浏览器里**用鼠标点选元素**，打个勾写句批注，Claude 就知道你指的是哪个，直接定位到代码改掉。

解决 AI 辅助前端开发里最烦的一个痛点：**"我说'这个标题'，AI 不知道是哪个标题。"**

---

## 安装（一条命令）

```bash
git clone https://github.com/CGIFM/pick-to-edit.git
cp -r pick-to-edit/skills/pick-to-edit ~/.claude/skills/
```

skill 目录**自带 `picker.js` + `annotate-server.js`**，触发时会自动部署到目标项目——你不用给每个网站手动配置。

## 用起来

在**任意静态网站项目**的 Claude Code 对话里说一句人话：

> 我要改首页那个标题

或手动触发：

```
/pick-to-edit
```

Claude 会自动把工具复制到该项目、起服务、打开浏览器。你选完元素、点「✓ 选完了」，回对话告诉它怎么改即可。

## 它怎么工作

```
你说「我要改首页这个标题」
        ↓
skill 自动把 picker.js + annotate-server.js 复制到当前项目（仅首次）
        ↓
起本地服务 + 打开浏览器
        ↓
你在网页上：鼠标移动高亮 → [ ] 切换堆叠图层 → Enter 选中 → 写批注 → ✓ 选完了
        ↓
Claude 读取标注（CSS selector / XPath / 文本预览 / 你的批注）
        ↓
Claude 精准定位 html / css / js 里对应代码 → 改
```

## 核心特性

- **任意项目通用** — skill 自带工具文件，自动部署，不限某个网站。
- **图层切换** — 鼠标停在重叠元素上，用 `[` `]` 在堆叠层级间上下切（基于 `document.elementsFromPoint`），选到任意一层。
- **Shadow DOM 隔离** — picker UI 与页面 CSS 完全隔离，不污染你的样式，也不被破坏。
- **结构化标注** — 每条标注自动生成稳健的 CSS selector / XPath / 元素矩形 / 文本预览。
- **三种标签** — 🔴 改 / 🟡 问 / 🟢 赞。
- **零依赖** — server 用 Node 内置模块，无需 `npm install`，也不碰你项目的 `package.json`。

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

每条标注写入目标项目的 `annotations.json`：

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

## 文件说明

```
pick-to-edit/
├── README.md
├── LICENSE
├── package.json
└── skills/
    └── pick-to-edit/
        ├── SKILL.md              # Claude Code skill 定义（自动部署 + 触发流程）
        ├── picker.js             # 前端可视化选择器（Shadow DOM 隔离）
        └── annotate-server.js    # 零依赖本地服务，serve 当前目录 + 自动注入 picker
```

## License

[MIT](./LICENSE)
