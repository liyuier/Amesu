import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: here,
  plugins: [vue()],
  // 交付物（workspace/demo）作为【静态项目数据】通过 publicDir 暴露：/demo/*
  publicDir: path.join(here, 'public'),
  server: { host: '0.0.0.0', port: Number(process.env.PORT || 11491), fs: { allow: [here] } },
  build: {
    outDir: 'dist/app',
    rollupOptions: { input: path.join(here, 'index.html') },
  },
  resolve: {
    alias: { '@engine': path.join(here, 'src/engine/index.ts') },
  },
});
