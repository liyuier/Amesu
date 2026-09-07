/*
 * Amesu —— 视觉小说演出引擎
 * Copyright (c) 2025 liyuier. Licensed under the MIT License (see LICENSE).
 */
// tools/dev-server.ts —— 开发服务器：静态服务 + SSE 热重载 + 可视化编辑器页。
// 分离三件套：交付物(demo)只渲染播放器；编辑器页挂载 editor.js；场景/素材变化即热重载。
// 运行：node tools/dev-server.ts  （默认 0.0.0.0:11491，可用 PORT 覆盖）
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { watch } from 'node:fs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');          // /srv/dev/VisualNovelEngine
const DEMO = path.join(ROOT, 'workspace', 'demo');    // 交付物项目
const HOST = '0.0.0.0';
const PORT = Number(process.env.PORT || 11491);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.ts': 'text/plain; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.jsonc': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.webm': 'video/webm', '.mp4': 'video/mp4',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.ico': 'image/x-icon',
};
const EDITOR_HTML = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"/><title>Amesu 编辑器</title>
<style>
  body{margin:0;background:#f6efe6;font-family:"Noto Sans CJK SC",sans-serif;color:#4a3a2c}
  .ed-root{display:flex;gap:14px;padding:16px;min-height:100vh}
  .ed-panel{width:360px;background:#fffaf2;border:1px solid #ecddc4;border-radius:12px;padding:16px}
  .ed-panel h2{font-size:16px;margin:0 0 10px}
  .ed-toolbar{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}
  .ed-toolbar button, .ed-apply{background:#fff;border:1px solid #ecddc4;border-radius:8px;padding:7px 10px;cursor:pointer}
  .ed-toolbar button:hover{color:#8a4a2a}
  .ed-label{font-size:12px;color:#8a6a4a}
  .ed-scene{width:100%;height:200px;font:12px/1.5 monospace;border:1px solid #ecddc4;border-radius:8px;background:#fff;color:#4a3a2c;white-space:pre;padding:8px;box-sizing:border-box}
  .ed-inspect{margin-top:10px}
  .ed-inspect pre{max-height:260px;overflow:auto;font:11px/1.4 monospace}
  .ed-preview{flex:1;background:transparent}
  .ed-preview .frame{width:1280px;height:720px;max-width:100%;margin:0 auto;background:#fff;border:1px solid #ecddc4;border-radius:12px;overflow:hidden;position:relative;box-shadow:0 14px 40px rgba(190,150,110,.25)}
  .ed-hint{color:#b39b80;font-size:12px;text-align:center}
</style></head><body>
<div class="ed-root">
  <aside class="ed-panel" id="panel"></aside>
  <main class="ed-preview"><div class="frame" id="preview"></div><p class="ed-hint">预览（= 交付物画面）。场景/配置变化经 /__reload 热重载。</p></main>
</div>
<script type="module">
  import { mountEditor } from './Amesu/dist/editor.js';
  const [cfg, scene] = await Promise.all([
    fetch('./workspace/demo/config.json').then(r=>r.json()),
    fetch('./workspace/demo/scenes/demo.json').then(r=>r.json()),
  ]);
  const project = { meta:{...cfg,resolution:cfg.resolution}, scripts:scene, characters:cfg.characters };
  mountEditor({ project, panelEl: document.getElementById('panel'), previewEl: document.getElementById('preview'), fps: cfg.fps, assetBase: '/workspace/demo/assets' });
</script></body></html>`;

const sseClients = new Set<http.ServerResponse>();
function broadcast(msg: string) { for (const r of sseClients) { try { r.write('data: ' + msg + '\n\n'); } catch (e) { /* */ } } }
function safeJoin(base: string, target: string): string | null {
  const resolved = path.resolve(base, '.' + path.posix.normalize('/' + target));
  if (resolved !== base && !resolved.startsWith(base + path.sep)) return null;
  return resolved;
}

const server = http.createServer((req, res) => {
  let p: string;
  try { p = decodeURIComponent(new URL(req.url || '/', 'http://x').pathname); } catch { res.writeHead(400); res.end(); return; }
  if (p === '/editor') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(EDITOR_HTML); return; }
  if (p === '/__reload') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('retry: 2000\n\n'); sseClients.add(res);
    req.on('close', () => sseClients.delete(res)); return;
  }
  // 交付物：/ 重定向到 /workspace/demo/，使页面相对路径正确解析
  if (p === '/') { res.writeHead(302, { Location: '/workspace/demo/' }); res.end(); return; }
  if (p === '/workspace/demo' || p === '/workspace/demo/') { p = '/workspace/demo/index.html'; }
  const file = safeJoin(ROOT, p);
  if (!file) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': stat.size, 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
});

// 监听交付物项目（场景/配置/素材）→ 热重载
watch(DEMO, { recursive: true }, (_ev, file) => {
  if (file && /(scenes|config|assets)/.test(file)) { console.log('[hot-reload]', file, '→ reload'); broadcast('reload'); }
});

server.listen(PORT, HOST, () => {
  console.log(`Amesu dev-server: http://${HOST}:${PORT}/`);
  console.log(`  交付物:  http://${HOST}:${PORT}/workspace/demo/`);
  console.log(`  编辑器:  http://${HOST}:${PORT}/editor`);
});
