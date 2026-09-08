<script setup lang="ts">
// 递归文件树（VSCode 风格）：目录可展开/收起，目录在前、文件在后（各自按名称排序）。
import { ref, computed } from 'vue';
import { FolderOpen, ChevronRight } from 'lucide-vue-next';
type Node = { name: string; type: 'dir' | 'file'; children?: Node[]; size?: number };
const props = defineProps<{ node: Node; depth?: number }>();
const open = ref(false);
const children = computed(() => {
  if (!props.node.children) return [];
  return [...props.node.children].sort((a, b) => (a.type === 'dir' ? -1 : 0) - (b.type === 'dir' ? -1 : 0) || a.name.localeCompare(b.name));
});
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
    <div v-if="node.type==='dir' && open" class="ft-children">
      <FsTree v-for="c in children" :key="c.name" :node="c" :depth="(depth || 0) + 1" />
    </div>
  </div>
</template>
