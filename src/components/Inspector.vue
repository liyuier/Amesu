<script setup lang="ts">
// 元素检查器（编辑器工具）：展示引擎运行态。
import { computed } from 'vue';
const props = defineProps<{ inspect: string }>();
const lines = computed(() => props.inspect.split('\n'));
</script>

<template>
  <details class="ed-inspect" open>
    <summary>元素检查器（引擎运行态）</summary>
    <pre><code>{{ inspect }}</code></pre>
  </details>
</template>
