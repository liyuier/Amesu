<script setup lang="ts">
// 编辑器：VSCode 式布局（顶栏 / 左工具区 / 中央预览 / 底状态栏）。
// 交付物 = 开发机上选定的一个项目目录（服务端 /api/projects 列出，/api/project 读取）。
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { createEngine, type Engine, type SceneState, type Project } from '@engine';
import Player from './components/Player.vue';
import Toolbar from './components/Toolbar.vue';
import Inspector from './components/Inspector.vue';
import { useProject } from './composables/useProject.ts';

const { projects, loaded, name, error, loadProjects, openProject } = useProject();
const selected = ref('');
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
function launch(project: Project, assetBase: string) {
  const resolveAsset = (src: string) => assetBase + src; // 素材由服务端 /api/asset/<项目>/ 提供
  engine.value = createEngine(project, { resolution: project.meta?.resolution, resolveAsset });
  engine.value.start();
  sceneText.value = JSON.stringify(project.scripts ?? {}, null, 2);
  cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
}
function handleSelect() { if (selected.value) openProject(selected.value); }
function applyScene() { try { engine.value?.setScripts(JSON.parse(sceneText.value)); } catch (e) { alert('JSON 解析失败：' + ((e as Error).message)); } }
watch(loaded, (v) => { if (v && v.project) launch(v.project, v.assetBase); });
onMounted(loadProjects);
onBeforeUnmount(() => cancelAnimationFrame(raf));
</script>

<template>
  <div class="ed-app">
    <header class="ed-top">
      <span class="ed-title">🧪 Amesu 可视化编辑器</span>
      <select class="ed-project" v-model="selected" @change="handleSelect">
        <option value="">📂 打开开发环境项目 …</option>
        <option v-for="p in projects" :key="p.name" :value="p.name">{{ p.name }}（{{ p.track === 'script' ? '脚本轨' : '数据轨' }}）</option>
      </select>
      <span v-if="error" class="ed-err">{{ error }}</span>
      <span class="ed-top-spacer"></span>
      <span class="ed-top-hint">Vite + Vue 3 · 预览=交付物画面 · 项目在开发机</span>
    </header>

    <div class="ed-body">
      <aside class="ed-side">
        <template v-if="engine">
          <Toolbar :engine="engine" />
          <label class="ed-label">剧本（JSON，改后点“应用”；改开发机文件可由 HMR 刷新）</label>
          <textarea v-model="sceneText" class="ed-scene" spellcheck="false" />
          <button class="ed-apply" @click="applyScene">✔ 应用到预览</button>
        </template>
        <Inspector :inspect="inspect" />
      </aside>

      <main class="ed-main">
        <div v-if="!engine" class="ed-empty">
          <p class="ed-empty-title">还没打开项目</p>
          <select class="ed-project large" v-model="selected" @change="handleSelect">
            <option value="">选择开发机上的项目目录 …</option>
            <option v-for="p in projects" :key="p.name" :value="p.name">{{ p.name }}（{{ p.track === 'script' ? '脚本轨' : '数据轨' }}）</option>
          </select>
          <p class="ed-hint">当前可用的项目：<code>workspace/</code> 下含 <code>config.json</code>＋<code>scenes/</code>＋<code>assets/</code> 的目录<br/>（例：<code>demo-data</code>（JSON 数据轨）、<code>demo-script</code>（JS/TS 脚本轨））。</p>
        </div>
        <div v-else class="ed-stage">
          <Player v-if="state" :state="state" @advance="engine?.handleClick(0,0)" @choose="(i: number) => engine?.choose(i)" />
        </div>
      </main>
    </div>

    <footer class="ed-statusbar">
      <span v-if="engine">项目:{{ name }} · scene:{{ state?.scene ?? '-' }} · t:{{ state?.time }}ms · {{ state?.mode }} x{{ state?.speed }}{{ state?.ended ? ' · 结束' : '' }}</span>
      <span v-else>就绪</span>
      <span class="ed-spacer"></span>
      <span class="ed-status-right">点击画面=推进/跳过 · 交付物 = 开发机上的项目目录（静态数据）</span>
    </footer>
  </div>
</template>
