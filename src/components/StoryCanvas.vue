<script setup lang="ts">
// 结点画布（MVP）：当前场景指令 → 可拖拽/连线的结点；选中→属性面板编辑；保存回场景 JSON(数据轨)。
import { ref, computed, watch } from 'vue';
import { VueFlow, type Node, type Edge } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';

type D = { type: string; [k: string]: unknown };
const props = defineProps<{ sceneDirs: D[]; sceneName: string; currentIndex?: number }>();
const emit = defineEmits<{ save: [dirs: D[]] }>();

const snippet = (d: D) => (['text', 'src', 'id', 'who', 'name'].find((x) => typeof d[x] === 'string') ?? '');
const label = (d: D) => d.type + (snippet(d) ? ' · ' + String(d[snippet(d)]) : '');

const nodes = ref<Node[]>([]);
const edges = ref<Edge[]>([]);
const selected = ref<number | null>(null);

function sync() {
  // 横向排布（从左到右），当前步高亮
  nodes.value = props.sceneDirs.map((d, i) => ({ id: 'n' + i, position: { x: 40 + i * 175, y: 40 }, data: { i }, label: label(d), style: i === props.currentIndex ? { outline: '2px solid var(--accent)', outlineOffset: '2px', borderRadius: '8px' } : undefined }));
  edges.value = props.sceneDirs.slice(0, -1).map((_, i) => ({ id: 'e' + i, source: 'n' + i, target: 'n' + (i + 1), animated: true }));
}
watch(() => props.currentIndex, sync);
watch(() => props.sceneDirs, sync, { immediate: true });

function onNodeClick({ node }: { node: Node }) { selected.value = Number(String(node.id).slice(1)); }
function onDragStop() {
  const order = [...nodes.value].sort((a, b) => a.position.x - b.position.x).map((n) => Number(String(n.id).slice(1)));
  emit('save', order.map((i) => props.sceneDirs[i])); sync();
}
function onConnect(c: { source: string | undefined; target: string | undefined }) { edges.value.push({ id: 'e' + Date.now(), source: c.source!, target: c.target!, animated: true }); }

const propText = ref('');
watch(selected, (i) => { propText.value = i != null ? JSON.stringify(props.sceneDirs[i], null, 2) : ''; });
function applyProp() { if (selected.value == null) return; try { const v = JSON.parse(propText.value); const d = [...props.sceneDirs]; d[selected.value] = v; emit('save', d); propText.value = JSON.stringify(v, null, 2); } catch (e) { alert('JSON 非法：' + ((e as Error).message)); } }
function addNode() { emit('save', [...props.sceneDirs, { type: 'say', who: '', text: '新对白', typewriter: 40 }]); }
</script>

<template>
  <div class="sc-root">
    <div class="sc-bar">
      <button @click="addNode">＋ 添加结点</button>
      <span class="sc-hint">{{ sceneName }} · 拖拽改序 / 点结点编辑 / 连线分支</span>
    </div>
    <div class="sc-flow">
      <VueFlow v-model:nodes="nodes" v-model:edges="edges" fit-view-on-init @node-click="onNodeClick" @node-drag-stop="onDragStop" @connect="onConnect">
        <Background pattern-color="#3a3a44" :gap="16" />
      </VueFlow>
    </div>
    <div v-if="selected != null" class="sc-prop">
      <span class="sc-prop-title">结点 #{{ selected }}（{{ props.sceneDirs[selected]?.type }}）</span>
      <textarea v-model="propText" class="sc-json" spellcheck="false" />
      <button @click="applyProp">✔ 应用</button>
    </div>
  </div>
</template>
