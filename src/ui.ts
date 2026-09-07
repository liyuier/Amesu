/*
 * Amesu —— 视觉小说演出引擎
 * Copyright (c) 2025 liyuier. Licensed under the MIT License (see LICENSE).
 *
 * 版权声明（含设计借鉴来源）：见 types.ts 头条说明（受 Librian (MPL-2.0) 架构启发）。
 */

// Amesu/src/ui.ts —— Vue 3 表现层：把引擎的 SceneState 渲染成【可被 F12 检查的 DOM 元素】。
// 采用 Vue 渲染函数（h），无需 SFC 编译器；esbuild 直接打包 vue。
// 引擎保持框架无关：仅暴露类型化的 getScene()；本模块用 rAF 轮询并交给 Vue 响应式重渲染。
import { createApp, h, ref, type Ref } from 'vue';
import type { Engine } from './engine.js';
import type { SceneState } from './types.js';

const FONT = '"Noto Sans CJK SC","Noto Sans SC","Microsoft YaHei","PingFang SC",sans-serif';

export interface PlayerMount { destroy: () => void; }

export function createPlayer(engine: Engine, mountEl: HTMLElement): PlayerMount {
  engine.domUI = true; // 让引擎画布跳过 UI（由本 DOM 层呈现）
  const state: Ref<SceneState> = ref<SceneState>(engine.getScene());
  let raf = 0;
  const tick = () => { state.value = engine.getScene(); raf = requestAnimationFrame(tick); };
  raf = requestAnimationFrame(tick);

  const App = {
    render() {
      const s = state.value;
      return h('div', { class: 'ams-stage' }, [
        // 对话框（名字 + 打字机文本）—— F12 可检查
        h('div', { class: 'ams-dialogue', 'data-time': String(s.time), style: dialogueStyle }, [
          s.say && s.say.who ? h('div', { class: 'ams-name' }, s.say.who) : null,
          h('div', { class: 'ams-text' }, s.say ? s.say.text.slice(0, s.say.reveal) : ''),
        ]),
        // 选择项
        s.choices && s.choices.chosen == null
          ? h('div', { class: 'ams-choice-wrap' }, s.choices.options.map((o, i) =>
              h('button', { class: 'ams-choice', onclick: () => engine.choose(i), 'data-index': String(i) }, o.text)))
          : null,
        // HUD
        h('div', { class: 'ams-hud' }, `scene:${s.scene ?? '-'} t:${s.time}ms ${s.mode} x${s.speed}${s.paused ? ' [暂停]' : ''}${s.ended ? ' [结束]' : ''}`),
      ]);
    },
  };

  const app = createApp(App);
  app.mount(mountEl);
  return {
    destroy() { cancelAnimationFrame(raf); app.unmount(); },
  };
}

const dialogueStyle = {
  position: 'absolute', left: '24px', right: '24px', bottom: '16px',
  padding: '18px 22px', minHeight: '96px',
  background: 'rgba(255,250,240,0.94)', border: '1px solid rgba(180,140,100,0.45)',
  borderRadius: '14px', fontFamily: FONT, color: '#4a3a2c',
} as const;

// 供外部读取当前场景（测试/调试）
export function readScene(engine: Engine): SceneState { return engine.getScene(); }
