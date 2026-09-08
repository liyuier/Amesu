<script setup lang="ts">
// 控制栏：播放/暂停、重播、倍速、模式、音量。lucide 图标 + 激活态 + 音量滑条。
import { ref, watch } from 'vue';
import { Play, Pause, RotateCcw, Gauge, Volume2, VolumeX, Sparkles, Bot } from 'lucide-vue-next';
import type { Engine } from '@engine';
const props = defineProps<{ engine: Engine | null; paused?: boolean; muted?: boolean; speed?: number }>();
const emit = defineEmits<{ mode: [m: 'interactive' | 'deterministic'] }>();
const mode = ref<'interactive' | 'deterministic'>('interactive');
const vol = ref(0.5);

const togglePlay = () => { const e = props.engine; if (!e) return; e.paused ? e.play() : e.pause(); };
const restart = () => props.engine?.restart();
const setSpeed = (s: number) => { props.engine?.setSpeed(s); };
const bumpSpeed = () => { const s = Math.min(2, (props.speed ?? 0.5) + 0.5); props.engine?.setSpeed(s); };
const toggleMode = () => { mode.value = mode.value === 'interactive' ? 'deterministic' : 'interactive'; props.engine?.setMode(mode.value); emit('mode', mode.value); };
const toggleMute = () => { const e = props.engine; if (!e) return; e.audio.ensure(); e.toggleMute(); };
const onVol = (e: Event) => { const v = Number((e.target as HTMLInputElement).value); vol.value = v; props.engine?.setVolume(v); };
watch(() => props.muted, () => { try { vol.value = props.engine?.getVolume?.() ?? 0.5; } catch { /* */ } }, { immediate: true });
</script>

<template>
  <div class="ed-toolbar">
    <button class="tb" :class="{ active: !props.paused }" @click="togglePlay" :title="props.paused ? '播放' : '暂停'">
      <Pause v-if="!props.paused" :size="15" /><Play v-else :size="15" /><span class="tb-label">{{ props.paused ? '播放' : '暂停' }}</span>
    </button>
    <button class="tb" @click="restart" title="重播"><RotateCcw :size="15" /><span class="tb-label">重播</span></button>
    <button class="tb" @click="bumpSpeed" title="倍速(循环 0.5→2)"><Gauge :size="15" /><span class="tb-label">x{{ props.speed ?? 0.5 }}</span></button>
    <button class="tb" :class="{ active: mode === 'deterministic' }" @click="toggleMode" :title="mode === 'interactive' ? '交互' : '确定性'">
      <Sparkles v-if="mode === 'interactive'" :size="15" /><Bot v-else :size="15" /><span class="tb-label">{{ mode === 'interactive' ? '交互' : '确定性' }}</span>
    </button>
    <button class="tb" :class="{ active: !props.muted }" @click="toggleMute" :title="props.muted ? '开启声音' : '静音'"><Volume2 v-if="!props.muted" :size="15" /><VolumeX v-else :size="15" /><span class="tb-label">{{ props.muted ? '静音' : '声音' }}</span></button>
    <span class="tb-vol" @click.stop><Volume2 :size="13" /><input type="range" min="0" max="1" step="0.01" :value="vol" @input="onVol" /></span>
  </div>
</template>
