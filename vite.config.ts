import { defineConfig, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import { transform } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';

const here = path.dirname(fileURLToPath(import.meta.url));
// 服务器端工作区：本开发机上的项目目录（供编辑器“打开开发环境目录”）
const WORKSPACE = path.resolve(here, '..', 'workspace');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.webm': 'video/webm', '.mp4': 'video/mp4',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.ico': 'image/x-icon',
};

function sendJson(res: http.ServerResponse, obj: unknown): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}
function safeJoin(base: string, rel: string): string | null {
  const resolved = path.resolve(base, '.' + path.posix.normalize('/' + rel));
  return resolved.startsWith(base + path.sep) ? resolved : null;
}

// 服务端项目 API：列出开发机上的项目、读取项目、转译脚本轨剧情、暴露素材
function projectApi(): Plugin {
  return {
    name: 'amesu-server-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const u = new URL(req.url || '/', 'http://x');
        const p = u.pathname, q = u.searchParams;
        try {
          if (p === '/api/projects') {
            const list = fs.readdirSync(WORKSPACE, { withFileTypes: true })
              .filter((d) => d.isDirectory() && fs.existsSync(path.join(WORKSPACE, d.name, 'config.json')))
              .map((d) => {
                const scenes = fs.existsSync(path.join(WORKSPACE, d.name, 'scenes')) ? fs.readdirSync(path.join(WORKSPACE, d.name, 'scenes')) : [];
                const track = scenes.some((n) => /\.(ts|js)$/.test(n)) ? 'script' : 'json';
                return { name: d.name, track };
              });
            return sendJson(res, list);
          }
          if (p === '/api/project') {
            const name = q.get('name') || '';
            if (!safeJoin(WORKSPACE, name)) { res.writeHead(403); res.end('forbidden'); return; }
            const dir = path.join(WORKSPACE, name);
            const config = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'));
            const scenes = fs.existsSync(path.join(dir, 'scenes')) ? fs.readdirSync(path.join(dir, 'scenes')) : [];
            const scriptFile = scenes.find((n) => /\.ts$|\.js$/.test(n));
            if (scriptFile) {
              return sendJson(res, { name, track: 'script', meta: config, storyModule: `/api/story?name=${encodeURIComponent(name)}`, assetBase: `/api/asset/${name}/` });
            }
            const jsonFile = scenes.find((n) => n.endsWith('.json')) || 'demo.json';
            const story = JSON.parse(fs.readFileSync(path.join(dir, 'scenes', jsonFile), 'utf8'));
            return sendJson(res, { name, track: 'json', meta: config, story, assetBase: `/api/asset/${name}/` });
          }
          if (p === '/api/story') {
            const name = q.get('name') || '';
            const dir = path.join(WORKSPACE, name, 'scenes');
            const file = fs.readdirSync(dir).find((n) => /\.ts$|\.js$/.test(n));
            const code = fs.readFileSync(path.join(dir, file), 'utf8');
            const out = await transform(code, { loader: 'ts', format: 'esm', target: 'es2020' });
            res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
            res.end(out.code); return;
          }
          if (p.startsWith('/api/asset/')) {
            const rest = p.slice('/api/asset/'.length); const parts = rest.split('/'); const name = parts.shift() || '';
            if (!name || !fs.existsSync(path.join(WORKSPACE, name, 'config.json'))) { res.writeHead(403); res.end('forbidden'); return; }
            const base = path.join(WORKSPACE, name, 'assets');
            const file = safeJoin(base, parts.join('/'));
            if (!file) { res.writeHead(403); res.end('forbidden'); return; }
            if (!fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
            res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
            fs.createReadStream(file).pipe(res); return;
          }
          if (p === '/__amesu.js') {
            res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
            res.end("export { story, loadStory, storyToStory } from '/src/engine/index.ts';");
            return;
          }
        } catch (e) { /* 继续走 vite */ }
        next();
      });
    },
  };
}

export default defineConfig({
  root: here,
  plugins: [vue(), projectApi()],
  server: { host: '0.0.0.0', port: Number(process.env.PORT || 11491), fs: { allow: [here, path.resolve(here, '..')] } },
  build: { outDir: 'dist/app', rollupOptions: { input: path.join(here, 'index.html') } },
  resolve: { alias: { '@engine': path.join(here, 'src/engine/index.ts') } },
});
