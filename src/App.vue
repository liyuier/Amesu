<script setup lang="ts">
// 可视化编辑器：VSCode 式【可拖动分栏】布局 = 顶栏 / 左工具区(可拖宽) + 中央预览(等比留黑边) + 底部工具区(可拖高) / 状态栏。
// 交付物 = 开发机上选定的项目目录（服务端 API 列出/读取）。
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { createEngine, type Engine, type SceneState, type Project, type AmesuConfig } from '@engine';
import Player from './components/Player.vue';
import Toolbar from './components/Toolbar.vue';
import Inspector from './components/Inspector.vue';
import DirectoryPicker from './components/DirectoryPicker.vue';
import StoryCanvas from './components/StoryCanvas.vue';
import { Image as ImageIcon, FolderOpen, Search, ChevronRight } from 'lucide-vue-next';
import { useProject } from './composables/useProject.ts';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const { loaded, name, error, openProject } = useProject();
const showPicker = ref(false);
const openDir = (p: string) => openProject(p);
const engine = ref<Engine | null>(null);
const state = ref<SceneState | null>(null);
const inspect = ref('');
const sceneText = ref('');
const assets = ref<{ rel: string; url: string; kind: string }[]>([]);
const sideTab = ref<'assets'|'fs'|'inspect'>('assets');
// 素材按媒体类型分组
const assetGroups = computed(() => ([
  { label: '图片', items: assets.value.filter((a) => ['png','jpg','jpeg','webp','gif'].includes(a.kind)) },
  { label: '音频', items: assets.value.filter((a) => ['mp3','wav','ogg'].includes(a.kind)) },
  { label: '视频', items: assets.value.filter((a) => ['mp4','webm'].includes(a.kind)) },
]));
// 文件系统浏览器
const fsPath = ref(''); const fsParent = ref(''); const fsDirs = ref<{name:string;isProject:boolean}[]>([]); const fsFiles = ref<{name:string}[]>([]);
async function listFs(p: string) { try { const d = await (await fetch('/api/fs/list?path=' + encodeURIComponent(p) + '&files=1')).json(); fsPath.value = d.path; fsParent.value = d.parent; fsDirs.value = d.dirs; fsFiles.value = d.files; } catch (e) { fsDirs.value = []; fsFiles.value = []; } }
function fsOpen(n: string) { listFs(fsPath.value ? fsPath.value + '/' + n : n); }
function fsUp() { listFs(fsParent.value); }
watch(name, (n) => { if (n) { loadAssets(n); listFs(n); } });
// 时间轴：当前场景的指令序列，高亮当前步
import { computed } from 'vue';
const sceneDirs = computed<{ type: string; who?: string }[]>(() => {
  const scripts = loaded.value?.project?.scripts as { scenes?: Record<string, { type: string; who?: string }[]> } | undefined;
  const scene = state.value?.scene as string;
  if (!scripts?.scenes || !scene) return [];
  return scripts.scenes[scene] ?? [];
});

// 分栏尺寸 + 预览(等比)尺寸
const sideWidth = ref(300);
const bottomHeight = ref(240);
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
  const move = (ev: MouseEvent) => { sideWidth.value = clamp(sw + ev.clientX - sx, 110, 980); };
  const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  window.addEventListener('mousemove', move); window.addEventListener('mouseup', up); e.preventDefault();
}
function startHDrag(e: MouseEvent) {
  const sy = e.clientY, sh = bottomHeight.value;
  const move = (ev: MouseEvent) => { bottomHeight.value = clamp(sh + (sy - ev.clientY), 50, 760); };
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
async function loadAssets(path: string) { try { const r = await fetch('/api/asset-list?path=' + encodeURIComponent(path)); assets.value = await r.json(); } catch (e) { assets.value = []; } }
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
        <div class="ed-activity">
          <button class="ed-activity-btn" :class="{on: sideTab==='assets'}" title="素材" @click="sideTab='assets'"><ImageIcon /></button>
          <button class="ed-activity-btn" :class="{on: sideTab==='fs'}" title="文件系统" @click="sideTab='fs'"><FolderOpen /></button>
          <button class="ed-activity-btn" :class="{on: sideTab==='inspect'}" title="检查器" @click="sideTab='inspect'"><Search /></button>
        </div>
        <div class="ed-tool">
          <template v-if="engine">
            <template v-if="sideTab==='assets'">
              <div v-for="g in assetGroups" :key="g.label" class="ed-agroup">
                <div class="ed-agroup-title">{{ g.label }}</div>
                <div v-if="g.items.length" class="ed-assets">
                  <div v-for="a in g.items" :key="a.rel" class="ed-asset" :title="a.rel">
                    <img v-if="['png','jpg','jpeg','webp','gif'].includes(a.kind)" :src="a.url" class="ed-asset-thumb" />
                    <audio v-else-if="['mp3','wav','ogg'].includes(a.kind)" :src="a.url" controls class="ed-asset-audio" />
                    <video v-else-if="['mp4','webm'].includes(a.kind)" :src="a.url" controls class="ed-asset-video" />
                    <span class="ed-asset-name">{{ a.rel }}</span>
                  </div>
                </div>
                <div v-else class="ed-agroup-empty">（无 {{ g.label }}）</div>
              </div>
            </template>
            <template v-else-if="sideTab==='fs'">
              <div class="ed-fs">
                <div class="ed-fs-bar"><button @click="fsUp" :disabled="!fsParent">← 上一级</button><span class="ed-fs-path">{{ fsPath || '（根）' }}</span></div>
                <div v-for="d in fsDirs" :key="d.name" class="ed-fs-item" @click="fsOpen(d.name)"><FolderOpen class="ed-fs-icon" /> {{ d.name }}{{ d.isProject ? '（项目）' : '' }}</div>
                <div v-for="f in fsFiles" :key="f.name" class="ed-fs-item fs-file"><span class="ed-fs-dot">·</span>{{ f.name }}</div>
              </div>
            </template>
            <template v-else-if="sideTab==='inspect'">
              <Inspector :inspect="inspect" />
            </template>
          </template>
        </div>
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
        <div class="ed-viewbar"><Toolbar :engine="engine" :paused="state?.paused ?? false" :muted="state?.audio?.muted ?? false" /></div>
        <div class="ed-split-h" @mousedown="startHDrag"></div>
        <section class="ed-bottom" :style="{ height: bottomHeight + 'px' }">
          <div class="ed-bottom-title">画布 · 当前场景（拖拽改序 / 点结点编辑 / 连线分支；橙色=当前步）</div>
          <div class="ed-bottom-body">
            <StoryCanvas v-if="state" :scene-dirs="sceneDirs" :scene-name="state?.scene || ''" :current-index="state?.index" @save="handleSceneSave" />
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
