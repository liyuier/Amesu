<script setup lang="ts">
// 播放器：把 SceneState 渲染成【全 DOM】—— 这就是“交付物”的画面内容。Vue 第一公民。
import { computed } from 'vue';
import { DEFAULT_CONFIG, type SceneState, type AmesuConfig } from '@engine';
const RAIN = DEFAULT_CONFIG.particle.rain[0];
const props = defineProps<{ state: SceneState; theme?: AmesuConfig }>();
const emit = defineEmits<{ advance: []; choose: [index: number] }>();

const bgStyle = (layer: { src: string; opacity: number; pos: string } | null) => layer ? ({
  backgroundImage: `url("${layer.src}")`, opacity: String(layer.opacity), backgroundPosition: layer.pos, backgroundSize: 'cover', backgroundRepeat: 'no-repeat',
}) : {};

// 对话高度依据【完整文本】估算行数（而非逐字），一句内稳定 → 不逐帧回流抖动；又能随句长自适应
const dialogueStyle = computed(() => {
  const t = props.state.say?.text || '';
  const charsPerLine = 30;                       // 粗略：每行约 30 个 CJK 字符（1280 宽、20px）
  const lines = Math.max(1, Math.ceil(t.length / charsPerLine));
  const h = 34 + lines * 32 + 22;                // 名字行 + 文本行 + 内边距
  return { minHeight: Math.min(h, 200) + 'px', transition: 'height .3s ease' };
});
const spriteStyle = (sp: { id: string; pos: number; opacity: number; z: number; flip: boolean; speaking?: boolean; fx?: string[] }) => {
  const eff = props.theme?.effect;
  // 情绪/受击标签滤镜（主题 effect.tags 映射）+ 说话者灰化（主题 effect.speaker）
  const fxFilter = (sp.fx || []).map((t) => eff?.tags[t]).filter(Boolean).join(' ');
  // 说话者表现：主题 treatment==='gray' 才灰化非说话者；'sprite' 由引擎加载说话贴图(嘴型)
  const useGray = eff?.speaker.treatment === 'gray';
  const speakerFilter = useGray && !sp.speaking ? (eff?.speaker.grayFilter || 'grayscale(0.85) brightness(0.72)') : '';
  return {
    left: `${sp.pos * 100}%`, opacity: String(sp.opacity), zIndex: String(sp.z),
    transform: `translateX(-50%) scale(${sp.speaking ? 1.06 : 1})${sp.flip ? ' scaleX(-1)' : ''}`, // 说话者略放大=强调
    transition: 'filter .3s ease, transform .3s ease',
    filter: [fxFilter, speakerFilter].filter(Boolean).join(' ') || '',
  };
};
// 逐字淡入：按引擎的确定性 reveal 决定每个字符透明度（0/1 + opacity 过渡）；箱体按整句高度稳定
const cgStyle = computed(() => props.state.cg ? ({ backgroundImage: `url("${props.state.cg.src}")`, opacity: String(props.state.cg.opacity) }) : {});
const textChars = computed(() => Array.from(props.state.say?.text || ''));
const charStyle = (i: number) => ({ opacity: i < (props.state.say?.reveal ?? 0) ? 1 : 0, transition: 'opacity .2s ease' });
// 通用特效表：对具名 UI 块应用主题 effect.tags 的滤镜（如 stage/dialogue/name/hud）
const blockFx = (name: string) => { const u = props.state.uiFx; if (!u || u.block !== name) return {}; const f = u.tags.map((t) => props.theme?.effect.tags[t]).filter(Boolean).join(' '); return f ? { filter: f } : {}; };
// 素材加载态：尚无背景(且无上一帧)时显示“加载中”，避免闪黑
const sceneLoading = computed(() => !props.state.bg?.cur && !props.state.bg?.prev);
const rain = computed(() => {
  const fx = props.state.effects.find((e) => e.type.includes('rain'));
  if (!fx) return [] as { x: number; delay: number; dur: number; len: number }[];
  const n = Math.min(Number(fx.params.count) || RAIN.count, RAIN.count * 2);
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
  <div class="ams-stage" :key="state.episode" :style="blockFx('stage')" @click="emit('advance')">
    <div v-if="state.bg?.prev" class="ams-bg" :style="bgStyle(state.bg.prev)"></div>
    <div v-if="state.bg?.cur" class="ams-bg" :style="bgStyle(state.bg.cur)"></div>
    <div class="ams-sprites">
      <img v-for="sp in state.sprites" v-show="sp.ready && sp.src" :key="sp.id" class="ams-sprite" :class="{ speaking: sp.speaking }"
           :src="sp.src" :data-id="sp.id" :style="spriteStyle(sp)" draggable="false" />
    </div>
    <div v-if="sceneLoading" class="ams-loading"><span class="ams-loading-dot">●</span> 加载中…</div>
    <div v-if="state.cg" class="ams-cg" :style="cgStyle"></div>
    <div v-if="state.html" class="ams-html" v-html="state.html"></div>
    <video v-if="state.video && state.video.src" class="ams-video" :src="state.video.src" autoplay muted playsinline @ended="emit('videoEnded')" @click="emit('videoEnded')" title="点击跳过"></video>
    <div class="ams-fx"><span v-for="(d, i) in rain" :key="i" class="ams-drop" :style="dropStyle(d)"></span></div>
    <div class="ams-dialogue" :style="{ ...dialogueStyle, ...blockFx('dialogue') }">
      <div v-if="state.say && state.say.who" class="ams-name">{{ state.say.who }}</div>
      <div class="ams-text" :key="state.say?.id"><span v-for="(c, i) in textChars" :key="i" :style="charStyle(i)">{{ c }}</span></div>
    </div>
    <div v-if="state.choices && state.choices.chosen == null" class="ams-choice-wrap">
      <button v-for="(o, i) in state.choices.options" :key="i" class="ams-choice" :data-index="i"
              @click.stop="emit('choose', i)">{{ o.text }}</button>
    </div>
    <div class="ams-hud" :style="blockFx('hud')">{{ hud }}</div>
  </div>
</template>
