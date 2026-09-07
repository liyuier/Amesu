<script setup lang="ts">
// 播放器：把 SceneState 渲染成【全 DOM】—— 这就是“交付物”的画面内容。Vue 第一公民。
import { computed } from 'vue';
import type { SceneState } from '@engine';
const props = defineProps<{ state: SceneState }>();
const emit = defineEmits<{ advance: []; choose: [index: number] }>();

const bgStyle = computed(() => ({
  backgroundImage: props.state.bg ? `url("${props.state.bg.src}")` : undefined,
  opacity: String(props.state.bg?.mix ?? 1),
}));
const spriteStyle = (sp: { pos: number; opacity: number; z: number; flip: boolean }) => ({
  left: `${sp.pos * 100}%`, opacity: String(sp.opacity), zIndex: String(sp.z),
  transform: `translateX(-50%)${sp.flip ? ' scaleX(-1)' : ''}`,
});
const rain = computed(() => {
  const fx = props.state.effects.find((e) => e.type.includes('rain'));
  if (!fx) return [] as { x: number; delay: number; dur: number; len: number }[];
  const n = Math.min(Number(fx.params.count) || 60, 60);
  return Array.from({ length: n }, (_, i) => ({
    x: Math.random() * 100, delay: Math.random() * (fx.duration / 1000), dur: fx.duration / 1000, len: 12 + Math.random() * 22,
  }));
});
const dropStyle = (d: { x: number; delay: number; dur: number; len: number }) => ({
  left: `${d.x}%`, height: `${d.len}px`, animationDelay: `${(d.delay % d.dur).toFixed(2)}s`, animationDuration: `${d.dur.toFixed(2)}s`,
});
const hud = computed(() => `scene:${props.state.scene ?? '-'} t:${props.state.time}ms ${props.state.mode} x${props.state.speed}`);
</script>

<template>
  <div class="ams-stage" @click="emit('advance')">
    <div v-if="state.bg" class="ams-bg" :style="bgStyle"></div>
    <div class="ams-sprites">
      <img v-for="sp in state.sprites" v-show="sp.ready && sp.src" :key="sp.id" class="ams-sprite"
           :src="sp.src" :data-id="sp.id" :style="spriteStyle(sp)" draggable="false" />
    </div>
    <div class="ams-fx"><span v-for="(d, i) in rain" :key="i" class="ams-drop" :style="dropStyle(d)"></span></div>
    <div class="ams-dialogue" :data-time="String(state.time)">
      <div v-if="state.say && state.say.who" class="ams-name">{{ state.say.who }}</div>
      <div class="ams-text">{{ state.say ? state.say.text.slice(0, state.say.reveal) : '' }}</div>
    </div>
    <div v-if="state.choices && state.choices.chosen == null" class="ams-choice-wrap">
      <button v-for="(o, i) in state.choices.options" :key="i" class="ams-choice" :data-index="i"
              @click.stop="emit('choose', i)">{{ o.text }}</button>
    </div>
    <div class="ams-hud">{{ hud }}</div>
  </div>
</template>
