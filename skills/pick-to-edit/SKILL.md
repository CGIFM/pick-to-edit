---
name: pick-to-edit
description: 当用户想在网页上"指着"具体元素让你改时使用——比如"我要改首页这个标题""这里不对帮我调一下""这个按钮颜色换了""网页里某块内容/某个区域要改"。启动本地标注服务、打开浏览器让用户可视化选取元素并写批注，读取标注后据此精确定位并修改代码。
---

# pick-to-edit：可视化标注 → 改代码

把"用户指着网页元素说要改"变成结构化流程：用户在浏览器里选元素 + 写批注，你读取标注后精确定位代码改动。解决"我说'这个标题'，AI 不知道是哪个标题"的痛点。

## 前置

`picker.js` / `annotate-server.js` / `package.json`（含 `annotate` 脚本）需在**用户项目根目录**。若不在当前工作目录，先问用户项目在哪并 `cd` 过去。

## 触发后的步骤

1. **确认目标页面** —— 列出项目根的 HTML：`ls *.html`。默认 `index.html`；若用户提到具体页面则用之。

2. **确保标注服务在跑**
   - `lsof -ti:4321` 查端口；有输出说明已起，跳过
   - 没起就后台启动：`npm run annotate`（**必须 run_in_background**，在项目根目录执行）
   - 等就绪：循环 `curl -s -o /dev/null http://localhost:4321/` 直到成功（最多 ~5 秒）

3. **打开浏览器** —— macOS：`open http://localhost:4321/<目标页面>`；Linux：`xdg-open`；Windows：`start`。picker 会自动注入页面。

4. **给用户一句操作指引**（简短，别长篇）：
   > 浏览器已打开。移动鼠标到要改的元素 → `[` `]` 在堆叠图层间切换 → `Enter` 选中 → 写批注 → 全部选完点右上角"✓ 选完了"，然后回这里告诉它你想怎么改。

5. **结束本回合，等用户回来。** 用户会在浏览器选完、点"✓ 选完了"、回对话打字描述要怎么改。不要轮询、不要自己往下猜——回合停在这一步。

6. **用户回来后，读取标注**
   - `curl -s http://localhost:4321/__annotate` 读 `annotations.json`
   - 每条含：`selector` / `xpath` / `tagName` / `textPreview` / `htmlPreview` / `rect` / `tag`(改/问/赞) / `note`
   - 结合用户的文字描述，定位项目里的 html / css / js 修改；多条标注按顺序处理

7. **清理** —— `curl -s -X POST http://localhost:4321/__clear` 清空标注，方便下次干净开始。

## 注意

- 服务是后台长驻进程，跨回合存活。别重复启动（端口 4321 会冲突）。
- `annotations.json` 是临时数据，勿提交 git。
- 用户口头能说清的**明确 / 全局**改动（"所有标题加粗""换主色""加个按钮"）→ 直接改，不必启动 picker。
- 验证改动可用 Playwright MCP 打开 `http://localhost:4321/<页面>` 截图自检。
