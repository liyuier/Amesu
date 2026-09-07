import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: here,
  plugins: [vue()],
  server: { host: '0.0.0.0', port: Number(process.env.PORT || 11491), fs: { allow: [here] } },
  build: {
    outDir: 'dist/app',
    rollupOptions: { input: path.join(here, 'index.html') },
  },
  resolve: {
    alias: { '@engine': path.join(here, 'src/engine/index.ts') },
  },
});
