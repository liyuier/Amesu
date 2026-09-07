/*
 * Amesu —— 视觉小说演出引擎
 * Copyright (c) 2025 liyuier. Licensed under the MIT License (see LICENSE).
 * 版权声明（含设计借鉴来源）：见 types.ts 头条说明（受 Librian (MPL-2.0) 架构启发）。
 */

// Amesu/src/ui.ts —— Vue 3 表现层：把引擎的 SceneState 渲染成【全 DOM 元素】（可被 F12 逐项检查）。
// 场景（背景/立绘/粒子/对白/选项/HUD）都是真实 DOM 节点；画布仅用于【导出】（见 renderer.ts）。
// 引擎保持框架无关：仅暴露类型化的 getScene()；本模块用 rAF 轮询并交给 Vue 响应式重渲染。
import { createApp, h, type Ref, ref } from 'vue';
import type { Engine } from './engine.js';
import type { SceneState, EffectState } from './types.js';

const FONT = '"Noto Sans CJK SC","Noto Sans SC","Microsoft YaHei","PingFang SC",sans-serif';

export interface PlayerMount { destroy: () => void; }

// 把“粒子效果”描述转成一组 DOM 雨滴（预生成随机序列，避免每帧重建）
function rainDrops(effect: EffectState): { x: number; delay: number; dur: number; len: number }[] {
  const n = Math.min(Number(effect.params.count) || 60, 60);
  const out: { x: number; delay: number; dur: number; len: number }[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      x: Math.random() * 100,
      delay: Math.random() * (effect.duration / 1000),
      dur: effect.duration / 1000,
      len: 12 + Math.random() * 22,
    });
  }
  return out;
}

export function createPlayer(engine: Engine, mountEl: HTMLElement): PlayerMount {
  engine.domUI = true;          // 画布不再绘制对白/选择/HUD（由本 DOM 层呈现）
  engine.domScene = true;       // 画布不再绘制背景/立绘/粒子（全部交给 DOM；画布仅用于导出）
  const state: Ref<SceneState> = ref<SceneState>(engine.getScene());
  let raf = 0;
  const tick = () => { state.value = engine.getScene(); raf = requestAnimationFrame(tick); };
  raf = requestAnimationFrame(tick);

  const App = {
    render() {
      const s = state.value;
      const fx = (s.effects || []).find((e) => e.type.includes('rain'));
      const rain = fx ? rainDrops(fx) : [];
      return h('div', { class: 'ams-stage' }, [
        // 背景（DOM，可检查）
        s.bg ? h('div', { class: 'ams-bg', style: { backgroundImage: `url("${s.bg.src}")`, opacity: String(s.bg.mix) } }) : null,
        // 立绘（DOM <img>，可检查）
        h('div', { class: 'ams-sprites' }, (s.sprites || []).map((sp) =>
          sp.ready && sp.src
            ? h('img', {
                class: 'ams-sprite', 'data-id': sp.id, src: sp.src,
                style: {
                  left: `${sp.pos * 100}%`, opacity: String(sp.opacity), zIndex: String(sp.z),
                  transform: `translateX(-50%)${sp.flip ? ' scaleX(-1)' : ''}`,
                },
              })
            : null)),
        // 粒子（DOM 雨滴，可检查）
        h('div', { class: 'ams-fx' }, rain.map((d, i) =>
          h('span', { class: 'ams-drop', 'data-i': String(i), style: {
            left: `${d.x}%`, height: `${d.len}px`, animationDelay: `${d.delay}s`, animationDuration: `${d.dur}s`,
          } }))),
        // 对话框（名字 + 打字机文本）
        h('div', { class: 'ams-dialogue', 'data-time': String(s.time) }, [
          s.say && s.say.who ? h('div', { class: 'ams-name' }, s.say.who) : null,
          h('div', { class: 'ams-text' }, s.say ? s.say.text.slice(0, s.say.reveal) : ''),
        ]),
        // 选择项
        s.choices && s.choices.chosen == null
          ? h('div', { class: 'ams-choice-wrap' }, s.choices.options.map((o, i) =>
              h('button', { class: 'ams-choice', 'data-index': String(i), onclick: () => engine.choose(i) }, o.text)))
          : null,
        // HUD
        h('div', { class: 'ams-hud' }, `scene:${s.scene ?? '-'} t:${s.time}ms ${s.mode} x${s.speed}${s.paused ? ' [暂停]' : ''}${s.ended ? ' [结束]' : ''}`),
      ]);
    },
  };

  const app = createApp(App);
  app.mount(mountEl);
  return { destroy() { cancelAnimationFrame(raf); app.unmount(); } };
}

export function readScene(engine: Engine): SceneState { return engine.getScene(); }

export { FONT };
