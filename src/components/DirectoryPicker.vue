<script setup lang="ts">
// 目录浏览器（模态）：浏览【开发机(服务端)】文件系统，自由选择一个目录作为工作目录。
import { ref, onMounted } from 'vue';
const emit = defineEmits<{ select: [path: string]; close: [] }>();
const path = ref('');
const parent = ref('');
const dirs = ref<{ name: string; isProject: boolean; hasScenes: boolean }[]>([]);
const loading = ref(false);

async function list(p: string): Promise<void> {
  loading.value = true;
  try { const d = (await (await fetch('/api/fs/list?path=' + encodeURIComponent(p))).json()) as { path: string; parent: string; dirs: { name: string; isProject: boolean; hasScenes: boolean }[] }; path.value = d.path; parent.value = d.parent; dirs.value = d.dirs; }
  finally { loading.value = false; }
}
function openDir(n: string) { list(path.value ? path.value + '/' + n : n); }
function goUp() { if (parent.value !== '' || path.value) list(parent.value); }
function choose() { emit('select', path.value); emit('close'); }

onMounted(() => list('workspace'));
</script>

<template>
  <div class="dp-overlay" @click.self="emit('close')">
    <div class="dp-panel">
      <div class="dp-head"><span class="dp-title">📂 打开开发机项目（选择目录）</span><button class="dp-x" @click="emit('close')">✕</button></div>
      <div class="dp-path">
        <button class="dp-up" @click="goUp" :disabled="parent === '' && path === ''">← 上一级</button>
        <span class="dp-crumb">/{{ path || '（根）' }}</span>
        <span v-if="loading" class="dp-loading">加载中…</span>
      </div>
      <ul class="dp-list">
        <li v-for="d in dirs" :key="d.name" @click="openDir(d.name)">
          <span class="dp-ico">{{ d.isProject ? '📦' : (d.hasScenes ? '🗂️' : '📁') }}</span>
          <span class="dp-name">{{ d.name }}</span>
          <span v-if="d.isProject" class="dp-badge">项目</span>
          <span class="dp-arrow">›</span>
        </li>
        <li v-if="!dirs.length && !loading" class="dp-empty">（无子目录）</li>
      </ul>
      <div class="dp-foot">
        <button class="dp-choose" @click="choose">✔ 选择当前目录（/{{ path }}）</button>
        <span class="dp-tip">选择含 <code>config.json</code>＋<code>scenes/</code>＋<code>assets/</code> 的目录。</span>
      </div>
    </div>
  </div>
</template>
