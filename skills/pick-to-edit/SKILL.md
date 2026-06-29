---
name: pick-to-edit
description: 当用户想在网页上"指着"具体元素让你改时使用——比如"我要改首页这个标题""这里不对帮我调一下""这个按钮颜色换了""网页里某块内容/某个区域要改"。自动部署工具、启动本地服务、打开浏览器让用户可视化选取元素并写批注，读取标注后据此精确定位并修改代码。适用于任何静态网页项目。
---

# pick-to-edit：可视化标注 → 改代码

把"用户指着网页元素说要改"变成结构化流程：用户在浏览器里选元素 + 写批注，你读取标注后精确定位代码改动。**适用于任何静态网页项目**——工具文件会自动部署到目标项目。

## 触发后的步骤

1. **确定目标项目根目录** —— 通常是当前工作目录（cwd）。如果 cwd 不像网站项目（没有 `*.html`），问用户项目根目录的绝对路径，记为 `$PROJECT`。

2. **自动部署工具文件**（目标项目缺时才做）
   - 检查：`test -f "$PROJECT/picker.js"`
   - 若不存在，从**本 skill 目录**复制（skill 目录和本 SKILL.md 同级，用户级安装在 `~/.claude/skills/pick-to-edit/`，项目级在 `.claude/skills/pick-to-edit/`）：
     ```bash
     cp ~/.claude/skills/pick-to-edit/picker.js "$PROJECT"/
     cp ~/.claude/skills/pick-to-edit/annotate-server.js "$PROJECT"/
     ```
   - **不要复制 package.json**（避免覆盖目标项目已有的依赖配置）。
   - 已存在则跳过。

3. **确认目标页面** —— `ls "$PROJECT"/*.html`，默认 `index.html`；用户提到具体页面则用之。

4. **起服务** —— `annotate-server.js` 用 `__dirname` 作为根目录，所以直接运行脚本即可 serve 项目目录：
   ```bash
   node "$PROJECT/annotate-server.js"     # 必须 run_in_background
   ```
   先 `lsof -ti:4321` 查端口，已起就跳过；否则起完后循环 `curl -s -o /dev/null http://localhost:4321/` 到通（~5 秒）。

5. **打开浏览器** —— macOS `open` / Linux `xdg-open` / Windows `start`：
   ```
   open http://localhost:4321/<目标页面>
   ```
   picker 会被自动注入页面。

6. **给用户一句操作指引**（简短，别长篇）：
   > 浏览器已打开。移动鼠标到要改的元素 → `[` `]` 在堆叠图层间切换 → `Enter` 选中 → 写批注 → 全部选完点右上角"✓ 选完了"，然后回这里告诉它你想怎么改。

7. **结束本回合，等用户回来。** 用户会在浏览器选完、点"✓ 选完了"、回对话打字描述要怎么改。不要轮询、不要自己往下猜。

8. **用户回来后，读取标注**
   - `curl -s http://localhost:4321/__annotate` 读 `annotations.json`
   - 每条含：`selector` / `xpath` / `tagName` / `textPreview` / `htmlPreview` / `rect` / `tag`(改/问/赞) / `note`
   - 结合用户文字描述，定位 `$PROJECT` 下的 html / css / js 修改；多条标注按顺序处理

9. **清理** —— `curl -s -X POST http://localhost:4321/__clear` 清空标注，方便下次。

## 注意

- 服务是后台长驻进程，跨回合存活。别重复启动（端口 4321 会冲突）。
- `annotations.json` 是临时数据，勿提交 git。
- 用户口头能说清的**明确 / 全局**改动（"所有标题加粗""换主色""加个按钮"）→ 直接改，不必启动 picker。
- 验证改动可用 Playwright MCP 打开 `http://localhost:4321/<页面>` 截图自检。
- 本 skill 目录自带 `picker.js` + `annotate-server.js`，部署时复制到目标项目根。
