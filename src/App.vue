<script setup lang="ts">
// 编辑器：VSCode 式布局（顶栏 / 左侧工具区 / 中央预览 / 底部状态栏），交付物 = 用户选择的本地工作目录。
import { ref, watch, onBeforeUnmount } from 'vue';
import { createEngine, type Engine, type SceneState, type Project } from '@engine';
import Player from './components/Player.vue';
import Toolbar from './components/Toolbar.vue';
import Inspector from './components/Inspector.vue';
import { useProject } from './composables/useProject.ts';

const { loaded, name, error, openDir, openFromFiles } = useProject();
const engine = ref<Engine | null>(null);
const state = ref<SceneState | null>(null);
const inspect = ref('');
const sceneText = ref('');
let raf = 0;

function tick() {
  if (engine.value) {
    state.value = engine.value.getScene();
    inspect.value = JSON.stringify(engine.value.inspect(), null, 2);
  }
  raf = requestAnimationFrame(tick);
}
function launch(project: Project, resolveAsset: (src: string) => string) {
  engine.value = createEngine(project, { resolution: project.meta?.resolution, resolveAsset });
  engine.value.start();
  sceneText.value = JSON.stringify(project.scripts ?? {}, null, 2);
  cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
}
watch(loaded, (v) => { if (v && v.project) launch(v.project, v.resolveAsset); });
async function handleOpen() { openDir(); }
function handleFiles(e: Event) { const t = e.target as HTMLInputElement; openFromFiles(t.files).then(() => { /* launch via watch */ }).finally(() => { t.value = ''; }); }
function applyScene() { try { engine.value?.setScripts(JSON.parse(sceneText.value)); } catch (e) { alert('JSON 解析失败：' + ((e as Error).message)); } }
function onMode(m: 'interactive' | 'deterministic') { engine.value?.setMode(m); }
onBeforeUnmount(() => cancelAnimationFrame(raf));
</script>

<template>
  <div class="ed-app">
    <input id="dir-input" type="file" webkitdirectory multiple style="display:none" @change="handleFiles" />
    <header class="ed-top">
      <span class="ed-title">🧪 Amesu 可视化编辑器</span>
      <button class="ed-open" @click="handleOpen">{{ name ? '📂 ' + name : '📂 打开工作目录' }}</button>
      <span v-if="error" class="ed-err">{{ error }}</span>
      <span class="ed-top-spacer"></span>
      <span class="ed-top-hint">Vite + Vue 3 · 预览=交付物画面</span>
    </header>

    <div class="ed-body">
      <aside class="ed-side">
        <template v-if="engine">
          <Toolbar :engine="engine" @mode="onMode" />
          <label class="ed-label">剧本（JSON，改后点“应用”）</label>
          <textarea v-model="sceneText" class="ed-scene" spellcheck="false" />
          <button class="ed-apply" @click="applyScene">✔ 应用到预览</button>
        </template>
        <Inspector :inspect="inspect" />
      </aside>

      <main class="ed-main">
        <div v-if="!engine" class="ed-empty">
          <p class="ed-empty-title">还没有打开工作目录</p>
          <button class="ed-open lg" @click="handleOpen">📂 选择本地目录作为工作目录</button>
          <p class="ed-hint">目录内需有 <code>config.json</code> ＋ <code>scenes/*.json</code> ＋ <code>assets/</code><br/>（如 <code>workspace/demo</code>）。</p>
        </div>
        <div v-else class="ed-stage">
          <Player v-if="state" :state="state" @advance="engine?.handleClick(0,0)" @choose="(i: number) => engine?.choose(i)" />
        </div>
      </main>
    </div>

    <footer class="ed-statusbar">
      <span v-if="engine">scene:{{ state?.scene ?? '-' }} · t:{{ state?.time }}ms · {{ state?.mode }} x{{ state?.speed }}{{ state?.paused ? ' · ⏸' : '' }}{{ state?.ended ? ' · 结束' : '' }}</span>
      <span v-else>就绪</span>
      <span class="ed-spacer"></span>
      <span class="ed-status-right">点击画面=推进/跳过 · 交付物 = 本地工作目录（静态数据）</span>
    </footer>
  </div>
</template>
