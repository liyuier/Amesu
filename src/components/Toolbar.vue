<script setup lang="ts">
// 控制栏（编辑器工具）：播放/暂停、重播、速度、模式、静音。Vue 组件。
import { ref } from 'vue';
import type { Engine } from '@engine';
const props = defineProps<{ engine: Engine | null }>();
const emit = defineEmits<{ mode: [m: 'interactive' | 'deterministic'] }>();
const paused = ref(false);
const speed = ref(0.5);
const mode = ref<'interactive' | 'deterministic'>('interactive');
const muted = ref(false);

const togglePlay = () => { const e = props.engine; if (!e) return; e.paused ? e.play() : e.pause(); paused.value = e.paused; };
const restart = () => props.engine?.restart();
const bumpSpeed = () => { speed.value = speed.value >= 2 ? 0.5 : speed.value + 0.5; props.engine?.setSpeed(speed.value); };
const toggleMode = () => {
  mode.value = mode.value === 'interactive' ? 'deterministic' : 'interactive';
  props.engine?.setMode(mode.value);
  emit('mode', mode.value);
};
const toggleMute = () => { const e = props.engine; if (!e) return; e.audio.ensure(); muted.value = e.toggleMute(); };
</script>

<template>
  <div class="ed-toolbar">
    <button @click="togglePlay">{{ paused ? '▶ 播放' : '⏸ 暂停' }}</button>
    <button @click="restart">↻ 重播</button>
    <button @click="bumpSpeed">x{{ speed }}</button>
    <button @click="toggleMode">{{ mode === 'interactive' ? '交互' : '确定性' }}</button>
    <button @click="toggleMute">{{ muted ? '🔇 静音' : '🔊 声音' }}</button>
  </div>
</template>
