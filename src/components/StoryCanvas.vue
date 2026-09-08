<script setup lang="ts">
// 结点画布（参考 interview-knowledge-tree）：mermaid 自渲染流程图 SVG。
// 点结点 → emit('select', i)（由 App 展示右侧 sc-prop）；本组件只管画布 + 高亮选中。
import { ref, watch, nextTick, onMounted } from 'vue';
import mermaid from 'mermaid';

mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', theme: 'dark', themeVariables: { fontSize: '14px', fontFamily: 'Noto Sans SC, sans-serif' }, flowchart: { curve: 'basis', padding: 12, nodeSpacing: 40, rankSpacing: 70, useMaxWidth: false } });

type D = { type: string; [k: string]: unknown };
const props = defineProps<{ sceneDirs: D[]; sceneName: string; currentIndex?: number; selected?: number | null }>();
const emit = defineEmits<{ save: [dirs: D[]]; select: [i: number] }>();

const wrap = ref<HTMLElement | null>(null);
const pan = ref({ x: 20, y: 20 });
const zoom = ref(0.85);
let renderSeq = 0;
let panning: { x: number; y: number; ox: number; oy: number } | null = null;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const snippet = (d: D) => (['text', 'src', 'id', 'who', 'name'].find((x) => typeof d[x] === 'string') ?? '');
const label = (d: D) => d.type + (snippet(d) ? ' · ' + String(d[snippet(d)]) : '');

function buildGraph() {
  const nodes = props.sceneDirs.map((d, i) => `  n${i}["${esc(label(d))}"]`);
  const edges = props.sceneDirs.slice(0, -1).map((_, i) => `  n${i} --> n${i + 1}`);
  return ['flowchart LR', ...nodes, ...edges].join('\n');
}
async function renderGraph() {
  if (!wrap.value) return;
  const seq = ++renderSeq;
  try {
    const { svg } = await mermaid.render('story-scene-graph', buildGraph());
    if (seq !== renderSeq) return;
    wrap.value.innerHTML = svg;
    const svgEl = wrap.value.querySelector('svg');
    if (!svgEl) return;
    const bbox = svgEl.getBBox();
    svgEl.style.width = (bbox.width + 60) + 'px';
    svgEl.style.height = (bbox.height + 60) + 'px';
    await nextTick();
    bindNodes();
  } catch (e) { console.error('mermaid render', e); }
}
function bindNodes() {
  if (!wrap.value) return;
  wrap.value.querySelectorAll<SVGGElement>('.node').forEach((n, i) => {
    n.style.cursor = 'pointer';
    n.onclick = (ev) => { ev.stopPropagation(); emit('select', i); };
    const r = n.querySelector('rect'); if (r) r.setAttribute('fill', i === props.selected ? '#e08a5a' : '#34343f');
    const t = n.querySelector('text'); if (t) t.setAttribute('fill', i === props.selected ? '#fff' : '#e8e8ee');
  });
}
watch(() => [props.sceneDirs, props.currentIndex, props.selected], () => { renderGraph(); }, { immediate: true });
onMounted(renderGraph);
function onWheel(e: WheelEvent) { zoom.value = Math.max(0.3, Math.min(2.5, zoom.value * (e.deltaY < 0 ? 1.1 : 0.9))); }
function onMouseDown(e: MouseEvent) { panning = { x: e.clientX, y: e.clientY, ox: pan.value.x, oy: pan.value.y }; }
function onMouseMove(e: MouseEvent) { if (panning) pan.value = { x: panning.ox + (e.clientX - panning.x), y: panning.oy + (e.clientY - panning.y) }; }
function onMouseUp() { panning = null; }
function addNode() { emit('save', [...props.sceneDirs, { type: 'say', who: '', text: '新对白', typewriter: 40 }]); }
</script>

<template>
  <div class="sc-root">
    <div class="sc-bar">
      <button @click="addNode">＋ 添加结点</button>
      <span class="sc-hint">{{ sceneName }} · 拖拽平移/滚轮缩放 · 点结点在右侧编辑；橙色=当前步</span>
    </div>
    <div class="sc-flow" @mousedown="onMouseDown" @mouseup="onMouseUp" @mousemove="onMouseMove" @wheel.prevent="onWheel">
      <div class="sc-world" :style="{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }">
        <div ref="wrap" class="mermaid-wrap"></div>
      </div>
    </div>
  </div>
</template>
