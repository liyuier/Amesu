import { defineConfig, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import { transform } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';

const here = path.dirname(fileURLToPath(import.meta.url));
// 服务端可浏览根目录：默认为全盘 '/'，可用 AMESU_FS_ROOT 收紧；START 为打开目录浏览器时的默认路径（相对根）
const BASE = path.resolve(process.env.AMESU_FS_ROOT || '/');
const START = process.env.AMESU_FS_START || 'srv/dev/VisualNovelEngine/workspace';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.webm': 'video/webm', '.mp4': 'video/mp4',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.ico': 'image/x-icon',
};

function sendJson(res: http.ServerResponse, obj: unknown): void { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(obj)); }
function safeJoin(base: string, rel: string): string | null {
  const resolved = path.resolve(base, '.' + path.posix.normalize('/' + rel));
  const r = path.relative(base, resolved);
  return r && (r.startsWith('..') || path.isAbsolute(r)) ? null : resolved;
}
function parentRel(rel: string): string { const i = rel.lastIndexOf('/'); return i < 0 ? '' : rel.slice(0, i); }

// 服务端 API：浏览开发机目录(/api/fs/list) + 读取项目(/api/project /api/story) + 暴露素材(/api/asset)
const sse = new Set<http.ServerResponse>();
function broadcast(msg: string) { for (const r of sse) { try { r.write('data: ' + msg + '\n\n'); } catch (e) { /* */ } } }

function projectApi(): Plugin {
  return {
    name: 'amesu-server-api',
    configureServer(server) {
      // 脚本轨 HMR：监听开发机项目（父目录 workspace 下）→ /__reload 广播（仅 dev，不阻塞 build）
      try { const watchRoot = path.join(path.resolve(here, '..'), 'workspace'); fs.watch(watchRoot, { recursive: true }, (_e, f) => { if (f && /\.(ts|tsx|json)$/.test(f) && !/\.git/.test(f)) broadcast('reload'); }); } catch (e) { /* */ }
      server.middlewares.use(async (req, res, next) => {
        const u = new URL(req.url || '/', 'http://x');
        const p = u.pathname, q = u.searchParams;
        try {
          if (p === '/api/asset-list') {
            const rel = q.get('path') ?? '';
            const dir = safeJoin(BASE, rel); if (!dir) { res.writeHead(403); res.end('forbidden'); return; }
            const aRoot = path.join(dir, 'assets'); const out: { rel: string; url: string; kind: string }[] = [];
            const walk = (d: string, pre: string) => { try { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p2 = path.join(d, e.name); if (e.isDirectory()) walk(p2, pre + e.name + '/'); else if (/.(png|jpe?g|webp|gif|mp3|ogg|wav|mp4)$/i.test(e.name)) out.push({ rel: pre + e.name, url: '/api/asset?path=' + encodeURIComponent(rel) + '&file=' + encodeURIComponent(pre + e.name), kind: e.name.substring(e.name.lastIndexOf('.') + 1) }); } } catch (e) { /* */ } };
            walk(aRoot, ''); return sendJson(res, out);
          }
          if (p === '/api/save' && req.method === 'POST') {
            const rel = q.get('path') ?? '';
            const dir = safeJoin(BASE, rel); if (!dir) { res.writeHead(403); res.end('forbidden'); return; }
            let body = ''; req.on('data', (ch) => { body += ch; }); req.on('end', () => {
              try {
                const data = JSON.parse(body);
                const f = (data && data.file) || 'demo.json';
                const target = safeJoin(path.join(dir, 'scenes'), f);
                if (!target) { res.writeHead(403); res.end('forbidden'); return; }
                fs.writeFileSync(target, JSON.stringify(data.scene ?? data, null, 2));
                sendJson(res, { ok: true, file: target }); broadcast('reload');
              } catch (e) { res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('save failed: ' + ((e as Error).message)); }
            });
            return;
          }
          if (p === '/__reload') {
            res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
            res.write('retry: 2000\n\n'); sse.add(res); req.on('close', () => sse.delete(res)); return;
          }
          if (p === '/api/fs/list') {
            const rel = q.get('path') || START;
            const dir = safeJoin(BASE, rel);
            if (!dir || !fs.existsSync(dir)) { res.writeHead(404); res.end('not found'); return; }
            const dirs = fs.readdirSync(dir, { withFileTypes: true })
              .filter((d) => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'node_modules' && d.name !== '.git')
              .map((d) => ({ name: d.name, isProject: fs.existsSync(path.join(dir, d.name, 'config.json')), hasScenes: fs.existsSync(path.join(dir, d.name, 'scenes')) }))
              .sort((a, b) => Number(b.isProject) - Number(a.isProject) || a.name.localeCompare(b.name));
            return sendJson(res, { path: rel, parent: parentRel(rel), dirs });
          }
          if (p === '/api/project') {
            const rel = q.get('path') ?? '';
            const dir = safeJoin(BASE, rel);
            if (!dir) { res.writeHead(403); res.end('forbidden'); return; }
            const cfgFile = path.join(dir, 'config.json');
            if (!fs.existsSync(cfgFile)) { res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('该目录不是有效项目（缺 config.json）'); return; }
            const config = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
            const scenesDir = path.join(dir, 'scenes');
            const scenes = fs.existsSync(scenesDir) ? fs.readdirSync(scenesDir) : [];
            const scriptFile = scenes.find((n) => /\.ts$|\.js$/.test(n));
            if (scriptFile) {
              const qs = new URLSearchParams({ path: rel });
              return sendJson(res, { path: rel, track: 'script', meta: config, storyModule: '/api/story?' + qs.toString(), assetBase: '/api/asset?path=' + encodeURIComponent(rel) + '&file=' });
            }
            const jsonFile = scenes.find((n) => n.endsWith('.json')) || 'demo.json';
            const story = JSON.parse(fs.readFileSync(path.join(scenesDir, jsonFile), 'utf8'));
            return sendJson(res, { path: rel, track: 'json', meta: config, story, assetBase: '/api/asset?path=' + encodeURIComponent(rel) + '&file=' });
          }
          if (p === '/api/story') {
            const rel = q.get('path') ?? '';
            const dir = safeJoin(BASE, rel);
            if (!dir) { res.writeHead(403); res.end('forbidden'); return; }
            const scenesDir = path.join(dir, 'scenes');
            const file = fs.readdirSync(scenesDir).find((n) => /\.ts$|\.js$/.test(n));
            const out = await transform(fs.readFileSync(path.join(scenesDir, file), 'utf8'), { loader: 'ts', format: 'esm', target: 'es2020' });
            res.setHeader('Content-Type', 'text/javascript; charset=utf-8'); res.end(out.code); return;
          }
          if (p === '/api/asset') {
            const rel = q.get('path') ?? '';
            const fileRel = q.get('file') ?? '';
            const dir = safeJoin(BASE, rel);
            if (!dir) { res.writeHead(403); res.end('forbidden'); return; }
            const file = safeJoin(path.join(dir, 'assets'), fileRel);
            if (!file || !fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
            res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
            fs.createReadStream(file).pipe(res); return;
          }
          if (p === '/__amesu.js') {
            res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
            res.end("export { story, loadStory, storyToStory } from '/src/engine/index.ts';"); return;
          }
        } catch (e) { /* 走 vite */ }
        next();
      });
    },
  };
}

export default defineConfig({
  root: here,
  plugins: [vue(), projectApi()],
  server: { host: '0.0.0.0', port: Number(process.env.PORT || 11491), fs: { allow: [here, BASE] } },
  build: { outDir: 'dist/app', rollupOptions: { input: path.join(here, 'index.html') } },
  resolve: { alias: { '@engine': path.join(here, 'src/engine/index.ts') } },
});
