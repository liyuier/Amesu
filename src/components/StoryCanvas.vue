<script setup lang="ts">
// 结点画布（mermaid 自渲染）：展示【完整分支树】(全部场景子图 + 顺序边 + choice 跳转边)，高亮当前场景的当前节点。
// 点节点 → emit('select', i)（App 展示右侧 sc-prop 并 seekSceneIndex 跳转预览）。
import { ref, watch, nextTick, onMounted } from 'vue';
import mermaid from 'mermaid';

mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', theme: 'dark', themeVariables: { fontSize: '13px', fontFamily: 'Noto Sans SC, sans-serif' }, flowchart: { curve: 'basis', padding: 10, nodeSpacing: 34, rankSpacing: 54, useMaxWidth: false } });

type D = { type: string; [k: string]: unknown };
type Story = { scenes?: Record<string, D[]> };
const props = defineProps<{ story?: Story | null; sceneDirs?: D[]; sceneName: string; currentScene?: string; currentIndex?: number; sceneIdx?: number; selected?: number | null }>();
const emit = defineEmits<{ save: [dirs: D[]]; select: [i: number] }>();

const wrap = ref<HTMLElement | null>(null);
const pan = ref({ x: 20, y: 20 });
const zoom = ref(0.7);
let renderSeq = 0; let panning: { x: number; y: number; ox: number; oy: number } | null = null;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const snippet = (d: D) => (['text', 'src', 'id', 'who', 'name'].find((x) => typeof d[x] === 'string') ?? '');
const label = (d: D) => d.type + (snippet(d) ? ' · ' + String(d[snippet(d)]) : '');

function buildGraph() {
  const full = props.story?.scenes && Object.keys(props.story.scenes).length ? props.story.scenes : null;
  const scenes = full || { [props.sceneName]: (props.sceneDirs || []) };
  const lines = ['flowchart LR'];
  for (const [name, arr] of Object.entries(scenes)) {
    if (!Array.isArray(arr) || !arr.length) continue;
    lines.push(`subgraph ${name}["${esc(name)}"]`);
    arr.forEach((d, i) => lines.push(`  ${name}_${i}["${esc(label(d))}"]`));
    arr.slice(0, -1).forEach((_, i) => lines.push(`  ${name}_${i} --> ${name}_${i + 1}`));
    lines.push('end');
  }
  for (const [name, arr] of Object.entries(scenes)) {
    if (!Array.isArray(arr)) continue;
    arr.forEach((d, i) => { if (d.type === 'choice' && Array.isArray(d.options)) d.options.forEach((o: { jump?: string }) => { if (o.jump && scenes[o.jump]) lines.push(`  ${name}_${i} ==> ${o.jump}_0`); }); });
  }
  return lines.join('\n');
}

async function renderGraph() {
  if (!wrap.value) return;
  const seq = ++renderSeq;
  try {
    const { svg } = await mermaid.render('story-tree-' + seq, buildGraph());
    if (seq !== renderSeq) return;
    wrap.value.innerHTML = svg;
    setTimeout(() => { document.querySelectorAll('[id^="dstory-"]').forEach((e) => e.parentNode && e.remove()); }, 60); // 彻底清理 mermaid 遗留临时容器(防溢出滚动条)
    const svgEl = wrap.value.querySelector('svg');
    if (!svgEl) return;
    const bbox = svgEl.getBBox();
    svgEl.style.width = (bbox.width + 60) + 'px'; svgEl.style.height = (bbox.height + 60) + 'px';
    await nextTick(); bindNodes();
  } catch (e) { console.error('mermaid render', e); }
}
function bindNodes() {
  if (!wrap.value) return;
  const cur = `${props.currentScene}_${props.currentIndex}`;
  wrap.value.querySelectorAll<SVGGElement>('.node').forEach((n, i) => {
    n.style.cursor = 'pointer';
    const id = (n.getAttribute('id') || '') + ' ' + (n.getAttribute('data-id') || '');
    n.onclick = (ev) => { ev.stopPropagation(); emit('select', i); };
    const r = n.querySelector('rect');
    if (cur && (id.includes('-' + cur + '-') || id === cur)) { // 边界匹配, 避免 scene_dusk_2 误中 scene_dusk_20
      if (r) r.setAttribute('fill', '#e08a5a'); const tx = n.querySelector('text'); if (tx) tx.setAttribute('fill', '#fff');
    }
    else if (r && i !== props.selected) r.setAttribute('fill', '#34343f');
  });
}
watch(() => [props.story, props.sceneDirs, props.currentScene, props.currentIndex, props.selected], () => { renderGraph(); }, { immediate: true });
onMounted(renderGraph);
function onWheel(e: WheelEvent) { zoom.value = Math.max(0.3, Math.min(2.5, zoom.value * (e.deltaY < 0 ? 1.1 : 0.9))); }
function onMouseDown(e: MouseEvent) { panning = { x: e.clientX, y: e.clientY, ox: pan.value.x, oy: pan.value.y }; }
function onMouseMove(e: MouseEvent) { if (panning) pan.value = { x: panning.ox + (e.clientX - panning.x), y: panning.oy + (e.clientY - panning.y) }; }
function onMouseUp() { panning = null; }
</script>

<template>
  <div class="sc-root">
    <div class="sc-bar">
      <span class="sc-hint">{{ sceneName }} · 完整分支树（拖拽平移/滚轮缩放；橙色=当前步）</span>
    </div>
    <div class="sc-flow" @mousedown="onMouseDown" @mouseup="onMouseUp" @mousemove="onMouseMove" @wheel.prevent="onWheel">
      <div class="sc-world" :style="{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }">
        <div ref="wrap" class="mermaid-wrap"></div>
      </div>
    </div>
  </div>
</template>
