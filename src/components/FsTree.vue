<script setup lang="ts">
// 递归文件树（VSCode 风格）：目录可展开/收起，文件展示。
import { ref } from 'vue';
import { FolderOpen, ChevronRight } from 'lucide-vue-next';
type Node = { name: string; type: 'dir' | 'file'; children?: Node[]; size?: number };
const props = defineProps<{ node: Node; depth?: number }>();
const open = ref(false);
</script>

<template>
  <div class="ft-item">
    <div class="ft-row" :style="{ paddingLeft: (depth || 0) * 14 + 6 + 'px' }" @click="open = !open">
      <ChevronRight v-if="node.type==='dir'" class="ft-chev" :class="{ down: open }" />
      <span v-else class="ft-chev-placeholder"></span>
      <FolderOpen v-if="node.type==='dir'" class="ft-icon" />
      <span v-else class="ft-dot">·</span>
      <span class="ft-name">{{ node.name }}</span>
    </div>
    <div v-if="node.type==='dir' && open && node.children">
      <FsTree v-for="c in children" :key="c.name" :node="c" :depth="(depth || 0) + 1" />
    </div>
  </div>
</template>
