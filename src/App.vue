<script setup lang="ts">
// 编辑器布局：左侧面板(工具+检查+场景编辑) + 右侧预览(播放器)。
// 引擎在此创建；播放器(Player.vue) 渲染 SceneState；此处轮询把它变成响应式状态。
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { createEngine, type Engine, type Project, type SceneState } from '@engine';
import Player from './components/Player.vue';
import Toolbar from './components/Toolbar.vue';
import Inspector from './components/Inspector.vue';

const engine = ref<Engine | null>(null);
const state = ref<SceneState | null>(null);
const inspect = ref('');
const sceneText = ref('');
const mode = ref<'interactive' | 'deterministic'>('interactive');
const projectPath = ref('/demo');   // 交付物(项目数据)静态路径

let raf = 0;
function tick() {
  if (engine.value) {
    state.value = engine.value.getScene();
    inspect.value = JSON.stringify(engine.value.inspect(), null, 2);
  }
  raf = requestAnimationFrame(tick);
}

async function boot() {
  const [cfg] = await Promise.all([fetch(`${projectPath.value}/config.json`).then((r) => r.json())]);
  // 双轨剧本：优先【JS 脚本】(模块图内，@engine 可解析)；回退 /demo JSON
  let scene;
  try { scene = ((await import('./story.demo.ts')) as { demoStory?: unknown }).demoStory; }
  catch { scene = await fetch(`${projectPath.value}/scenes/demo.json`).then((r) => r.json()); }
  const project: Project = { meta: { ...cfg, resolution: cfg.resolution }, scripts: scene, characters: cfg.characters };
  engine.value = createEngine(project, { fps: cfg.fps, resolution: cfg.resolution, mode: 'interactive', assetBase: `${projectPath.value}/assets` });
  engine.value.start();
  sceneText.value = JSON.stringify(scene, null, 2);
  cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
}

function applyScene() {
  try { engine.value?.setScripts(JSON.parse(sceneText.value)); } catch (e) { alert('JSON 解析失败：' + (e as Error).message); }
}
function onMode(m: 'interactive' | 'deterministic') { mode.value = m; engine.value?.setMode(m); }

onMounted(boot);
onBeforeUnmount(() => cancelAnimationFrame(raf));
</script>

<template>
  <div class="ed-root">
    <aside class="ed-panel">
      <h2>🧪 Amesu 可视化编辑器</h2>
      <Toolbar :engine="engine" @mode="onMode" />
      <label class="ed-label">剧本（JSON，改后点“应用”；Vite HMR 亦热重载）</label>
      <textarea v-model="sceneText" class="ed-scene" spellcheck="false" />
      <button class="ed-apply" @click="applyScene">✔ 应用到预览</button>
      <Inspector :inspect="inspect" />
      <p class="ed-note">交付物 = <code>/demo</code>（静态项目数据，由播放器渲染）；引擎逻辑见 <code>src/engine</code>。</p>
    </aside>
    <main class="ed-preview">
      <div class="frame">
        <Player v-if="state" :state="state" @choose="(i: number) => engine?.choose(i)" />
      </div>
      <p class="ed-hint">预览（= 交付物画面）。修改 /demo 下场景/配置/素材，Vite HMR 即时刷新。</p>
    </main>
  </div>
</template>
