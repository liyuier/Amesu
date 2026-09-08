<script setup lang="ts">
// 可视化编辑器：VSCode 式【可拖动分栏】布局 = 顶栏 / 左工具区(可拖宽) + 中央预览(等比留黑边) + 底部工具区(可拖高) / 状态栏。
// 交付物 = 开发机上选定的项目目录（服务端 API 列出/读取）。
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { createEngine, type Engine, type SceneState, type Project, type AmesuConfig } from '@engine';
import Player from './components/Player.vue';
import Toolbar from './components/Toolbar.vue';
import Inspector from './components/Inspector.vue';
import DirectoryPicker from './components/DirectoryPicker.vue';
import { useProject } from './composables/useProject.ts';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const { loaded, name, error, openProject } = useProject();
const showPicker = ref(false);
const openDir = (p: string) => openProject(p);
const engine = ref<Engine | null>(null);
const state = ref<SceneState | null>(null);
const inspect = ref('');
const sceneText = ref('');

// 分栏尺寸 + 预览(等比)尺寸
const sideWidth = ref(300);
const bottomHeight = ref(150);
const mainEl = ref<HTMLElement | null>(null);
const fw = ref(0); const fh = ref(0);
function updateFrame() {
  const el = mainEl.value; if (!el) return;
  const w = el.clientWidth, h = el.clientHeight; if (w <= 0 || h <= 0) return;
  let W = w, H = (w * 9) / 16;
  if (H > h) { H = h; W = (h * 16) / 9; }
  fw.value = W; fh.value = H;
}
let ro: ResizeObserver | null = null;

function startVDrag(e: MouseEvent) {
  const sx = e.clientX, sw = sideWidth.value;
  const move = (ev: MouseEvent) => { sideWidth.value = clamp(sw + ev.clientX - sx, 160, 640); };
  const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  window.addEventListener('mousemove', move); window.addEventListener('mouseup', up); e.preventDefault();
}
function startHDrag(e: MouseEvent) {
  const sy = e.clientY, sh = bottomHeight.value;
  const move = (ev: MouseEvent) => { bottomHeight.value = clamp(sh + (sy - ev.clientY), 90, 420); };
  const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  window.addEventListener('mousemove', move); window.addEventListener('mouseup', up); e.preventDefault();
}

let raf = 0;
function tick() {
  if (engine.value) { state.value = engine.value.getScene(); inspect.value = JSON.stringify(engine.value.inspect(), null, 2); }
  raf = requestAnimationFrame(tick);
}
function applyTheme(c: AmesuConfig) {
  const el = document.documentElement;
  const col = c.colors, sp = c.effect.speaker;
  const map: Record<string, string> = { '--ams-name': col.name, '--ams-dialogue-bg': col.dialogueBg, '--ams-dialogue-border': col.dialogueBorder, '--ams-text': col.text, '--ams-choice-bg': col.choiceBg, '--ams-choice-border': col.choiceBorder, '--ams-choice-text': col.choiceText, '--ams-hud': col.hud, '--ams-shadow': col.shadow, '--ams-fallback-bg': col.fallbackBg, '--ams-nonspeaker-filter': sp.grayFilter };
  for (const k in map) el.style.setProperty(k, map[k]);
}
function launch(project: Project, assetBase: string) {
  engine.value?.stop(); // 避免旧引擎残留
  const resolveAsset = (src: string) => assetBase + src;
  engine.value = createEngine(project, { resolution: project.meta?.resolution, resolveAsset });
  if (engine.value) applyTheme(engine.value.config);
  engine.value.start();
  (window as unknown as { engine?: Engine }).engine = engine.value; // 供调试/自动化
  sceneText.value = JSON.stringify(project.scripts ?? {}, null, 2);
  cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
}
async function applyScene() {
  try { const scripts = JSON.parse(sceneText.value); engine.value?.setScripts(scripts); }
  catch (e) { alert('JSON 解析失败：' + ((e as Error).message)); return; }
  // 剧本回写：POST /api/save 写入开发机项目文件（数据轨）；脚本轨仍走 HMR
  if (name.value) {
    try { await fetch('/api/save?path=' + encodeURIComponent(name.value), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: 'demo.json', scene: JSON.parse(sceneText.value) }) }); }
    catch (e) { console.warn('保存失败（回写开发机文件）：', e); }
  }
}
watch(loaded, (v) => { if (v && v.project) launch(v.project, v.assetBase); });
onMounted(() => {
  if (mainEl.value) { ro = new ResizeObserver(updateFrame); ro.observe(mainEl.value); updateFrame(); }
  // 脚本轨 HMR：dev-server 广播 reload → 重新打开当前项目（重取/转译 .ts 剧本）
  try { const es = new EventSource('/__reload'); es.onmessage = (e) => { if (e.data === 'reload' && name.value) openProject(name.value); }; } catch (e) { /* */ }
});
onBeforeUnmount(() => { ro?.disconnect(); cancelAnimationFrame(raf); });
</script>

<template>
  <div class="ed-app">
    <header class="ed-top">
      <span class="ed-title">🧪 Amesu 可视化编辑器</span>
      <button class="ed-open" @click="showPicker = true">📂 打开开发机项目</button>
      <span v-if="error" class="ed-err">{{ error }}</span>
      <span class="ed-top-spacer"></span>
      <span class="ed-top-hint">Vite + Vue 3 · 预览=交付物画面</span>
    </header>

    <div class="ed-mid">
      <aside class="ed-side" :style="{ width: sideWidth + 'px' }">
        <template v-if="engine">
          <Toolbar :engine="engine" />
          <label class="ed-label">剧本（JSON，改后点“应用”）</label>
          <textarea v-model="sceneText" class="ed-scene" spellcheck="false" />
          <button class="ed-apply" @click="applyScene">✔ 应用到预览</button>
        </template>
        <Inspector :inspect="inspect" />
      </aside>
      <div class="ed-split-v" @mousedown="startVDrag"></div>

      <div class="ed-col">
        <main class="ed-main" ref="mainEl">
          <div v-if="!engine" class="ed-empty">
            <p class="ed-empty-title">还没打开项目</p>
            <button class="ed-open lg" @click="showPicker = true">📂 选择开发机目录作为工作目录</button>
            <p class="ed-hint">选择含 <code>config.json</code>＋<code>scenes/</code>＋<code>assets/</code> 的目录（自由浏览开发机）。</p>
          </div>
          <div v-else class="ams-frame" :style="{ width: fw + 'px', height: fh + 'px' }">
            <Player v-if="state" :key="state.episode" :state="state" :theme="engine?.config" @advance="engine?.handleClick(0,0)" @choose="(i: number) => engine?.choose(i)" />
          </div>
        </main>
        <div class="ed-split-h" @mousedown="startHDrag"></div>
        <section class="ed-bottom" :style="{ height: bottomHeight + 'px' }">
          <div class="ed-bottom-title">时间轴 / 演出（工具区）</div>
          <div class="ed-bottom-body">
            <p class="ed-hint-inline">这里预留给：时间线、资源/素材面板、分支导航等工具。当前为占位。</p>
          </div>
        </section>
      </div>
    </div>

    <footer class="ed-statusbar">
      <span v-if="engine">项目:{{ name }} · scene:{{ state?.scene ?? '-' }} · t:{{ state?.time }}ms · {{ state?.mode }} x{{ state?.speed }}{{ state?.ended ? ' · 结束' : '' }}</span>
      <span v-else>就绪</span>
      <span class="ed-spacer"></span>
      <span class="ed-status-right">点击画面=推进/跳过 · 交付物 = 开发机上的项目目录 · 拖分栏可调大小</span>
    </footer>

    <DirectoryPicker v-if="showPicker" @select="openDir" @close="showPicker = false" />
  </div>
</template>
