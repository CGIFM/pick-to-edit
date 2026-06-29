/*
 * annotate-server.js — 标注模式的本地服务（零依赖，纯 Node 内置模块）
 *
 *   - 静态托管项目文件（index.html / resume_*.html / styles.css / script.js / images ...）
 *   - 凡是 .html 自动注入 <script src="/__picker.js">，其它文件原样返回
 *   - POST /__annotate  → 收到一条标注，append 进 annotations.json
 *   - GET  /__annotate?count=1 → 返回 {count}
 *   - GET  /__annotate        → 返回全部标注
 *   - POST /__clear           → 清空
 *
 *   启动：  npm run annotate      访问： http://localhost:4321
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = 4321;
const ANNO = path.join(ROOT, 'annotations.json');
let doneTs = 0;   // 用户点"✓ 选完了"的时间戳；skill 可据此判断会话结束
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.pdf': 'application/pdf', '.woff2': 'font/woff2', '.woff': 'font/woff',
};

// ---- annotations.json 读写 ----
function readAnno() {
  try { return JSON.parse(fs.readFileSync(ANNO, 'utf8')); }
  catch { return { annotations: [] }; }
}
function writeAnno(data) {
  fs.writeFileSync(ANNO, JSON.stringify(data, null, 2));
}

// ---- 读取文件 + html 注入 ----
function serveFile(filePath, res) {
  fs.readFile(filePath, (err, buf) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    if (ext === '.html') {
      let html = buf.toString('utf8');
      const inject = '<script src="/__picker.js"></script>';
      if (!html.includes('/__picker.js')) {
        if (/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, inject + '</body>');
        else html += inject;
      }
      buf = Buffer.from(html, 'utf8');
    }
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

function readBody(req) {
  return new Promise(resolve => {
    let data = '';
    req.on('data', c => data += c);
    req.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
  });
}

// ---- 路由 ----
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // —— picker 脚本 ——
  if (url.pathname === '/__picker.js') {
    return serveFile(path.join(ROOT, 'picker.js'), res);
  }

  // —— 标注 API ——
  if (url.pathname === '/__annotate') {
    if (req.method === 'POST') {
      const payload = await readBody(req);
      if (!payload) { res.writeHead(400); return res.end('{"error":"bad json"}'); }
      const data = readAnno();
      const id = `ann-${String(data.annotations.length + 1).padStart(3, '0')}`;
      data.annotations.push({ id, ...payload });
      writeAnno(data);
      console.log(`  ✓ ${id} [${payload.tag || ''}] ${payload.selector}  ${payload.note ? '— ' + payload.note : ''}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, id, count: data.annotations.length }));
    }
    // GET
    if (url.searchParams.get('count')) {
      const data = readAnno();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ count: data.annotations.length }));
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(readAnno(), null, 2));
  }

  // —— 清空 ——
  if (url.pathname === '/__clear' && req.method === 'POST') {
    writeAnno({ annotations: [] });
    doneTs = 0;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true }));
  }

  // —— 会话结束标记（用户点了"✓ 选完了"）——
  if (url.pathname === '/__done') {
    const data = readAnno();
    if (req.method === 'POST') {
      doneTs = Date.now();
      console.log(`  ⊙ 用户结束选择，共 ${data.annotations.length} 条标注`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, doneTs, count: data.annotations.length }));
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ done: !!doneTs, count: data.annotations.length }));
  }

  // —— 静态文件 ——
  let p = decodeURIComponent(url.pathname);
  if (p === '/' || p === '') p = '/index.html';
  // 防目录穿越
  const filePath = path.normalize(path.join(ROOT, p));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
  return serveFile(filePath, res);
});

server.listen(PORT, () => {
  console.log('\n  🟢 标注模式已启动');
  console.log(`  →  http://localhost:${PORT}`);
  console.log('  →  在页面里移动鼠标，[ ] 切层，Enter 选中，写批注打勾');
  console.log('  →  我（Claude）读 annotations.json 就能看到你标了什么\n');
});
