<script setup lang="ts">
// 结点画布（简化版，稳定渲染）：当前场景指令 = 横向可滚动的结点卡片行（稳定可见）。
// 点结点选中→属性面板(JSON 编辑)；左右挪改序/删除/添加；保存回场景 JSON（零代码、双轨通用）。
import { ref, watch } from 'vue';

type D = { type: string; [k: string]: unknown };
const props = defineProps<{ sceneDirs: D[]; sceneName: string; currentIndex?: number }>();
const emit = defineEmits<{ save: [dirs: D[]] }>();

const selected = ref<number | null>(null);
const propText = ref('');
const snippet = (d: D) => (['text', 'src', 'id', 'who', 'name'].find((x) => typeof d[x] === 'string') ?? '');
const nodeLabel = (d: D) => d.type + (snippet(d) ? ' · ' + String(d[snippet(d)]) : '');

watch(selected, (i) => { propText.value = i != null ? JSON.stringify(props.sceneDirs[i], null, 2) : ''; });
function applyProp() { if (selected.value == null) return; try { const v = JSON.parse(propText.value); const d = [...props.sceneDirs]; d[selected.value] = v; emit('save', d); propText.value = JSON.stringify(v, null, 2); } catch (e) { alert('JSON 非法：' + ((e as Error).message)); } }
function addNode() { emit('save', [...props.sceneDirs, { type: 'say', who: '', text: '新对白', typewriter: 40 }]); }
function delNode(i: number) { const d = [...props.sceneDirs]; d.splice(i, 1); emit('save', d); if (selected.value === i) selected.value = null; }
function move(i: number, dx: number) { const j = i + dx; if (j < 0 || j >= props.sceneDirs.length) return; const d = [...props.sceneDirs]; [d[i], d[j]] = [d[j], d[i]]; emit('save', d); }
</script>

<template>
  <div class="sc-root">
    <div class="sc-bar">
      <button @click="addNode">＋ 添加结点</button>
      <span class="sc-hint">{{ sceneName }} · 点结点编辑 / 左右挪改序 / 删除；橙色=当前步</span>
    </div>
    <div class="sc-row">
      <div v-for="(d, i) in sceneDirs" :key="i" class="sc-card" :class="{ cur: i === currentIndex, sel: i === selected }" @click="selected = i">
        <div class="sc-card-head"><span class="sc-card-no">#{{ i }}</span><span class="sc-card-type">{{ d.type }}</span></div>
        <div class="sc-card-snippet">{{ nodeLabel(d) }}</div>
        <div class="sc-card-actions">
          <button class="sc-mini" title="左移" @click.stop="move(i, -1)">◀</button>
          <button class="sc-mini" title="右移" @click.stop="move(i, 1)">▶</button>
          <button class="sc-mini danger" title="删除" @click.stop="delNode(i)">✕</button>
        </div>
      </div>
    </div>
    <div v-if="selected != null" class="sc-prop">
      <span class="sc-prop-title">结点 #{{ selected }}（{{ props.sceneDirs[selected]?.type }}）</span>
      <textarea v-model="propText" class="sc-json" spellcheck="false" />
      <button @click="applyProp">✔ 应用</button>
    </div>
  </div>
</template>
