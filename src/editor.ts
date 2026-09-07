/*
 * Amesu —— 视觉小说演出引擎
 * Copyright (c) 2025 liyuier. Licensed under the MIT License (see LICENSE).
 * 版权声明（含设计借鉴来源）：见 types.ts 头条说明（受 Librian (MPL-2.0) 架构启发）。
 */

// Amesu/src/editor.ts —— 【可视化编辑器】（Vue 驱动，引擎的外部工具）。
// 预览 = 挂载“播放器”到 previewEl；控制/检查/场景编辑 = Vue 面板（mount 到 panelEl）。
// 与交付物(demo)分离：编辑器的控制、检查能力都收在这里；demo 只含播放器。
import { createApp, h, ref, type Ref } from 'vue';
import { createEngine } from './engine.js';
import { createPlayer } from './ui.js';
import type { Project } from './types.js';

export interface EditorMount { destroy: () => void; }
export interface EditorOptions {
  project: Project;
  panelEl: HTMLElement;    // 左侧/面板挂载点（Vue 渲染 控制栏/检查器/场景编辑）
  previewEl: HTMLElement;  // 预览挂载点（播放器渲染 .frame 内容）
  fps?: number;
  assetBase?: string;
}

export function mountEditor(o: EditorOptions): EditorMount {
  const engine = createEngine(o.project, { fps: o.fps || 30, resolution: o.project.meta?.resolution, assetBase: o.assetBase });
  engine.start();
  const player = createPlayer(engine, o.previewEl);

  const paused = ref(false);
  const speed = ref(1);
  const mode = ref('interactive');
  const muted = ref(false);
  const inspect: Ref<string> = ref('');
  const sceneText = ref(JSON.stringify(o.project.scripts ?? {}, null, 2));
  let raf = 0;
  const tick = () => { inspect.value = JSON.stringify(engine.inspect(), null, 2); raf = requestAnimationFrame(tick); };
  raf = requestAnimationFrame(tick);

  const applyScene = () => {
    try {
      const scripts = JSON.parse(sceneText.value);
      engine.setScripts(scripts);
    } catch (e) { alert('JSON 解析失败：' + (e as Error).message); }
  };

  const App = {
    render() {
      return h('div', { class: 'ed-panel' }, [
        h('h2', '🧪 Amesu 可视化编辑器'),
        h('div', { class: 'ed-toolbar' }, [
          h('button', { onclick: () => { engine.paused ? engine.play() : engine.pause(); paused.value = engine.paused; } }, paused.value ? '▶ 播放' : '⏸ 暂停'),
          h('button', { onclick: () => engine.restart() }, '↻ 重播'),
          h('button', { onclick: () => { speed.value = speed.value >= 2 ? 0.5 : speed.value + 0.5; engine.setSpeed(speed.value); } }, 'x' + speed.value),
          h('button', { onclick: () => { mode.value = mode.value === 'interactive' ? 'deterministic' : 'interactive'; engine.setMode(mode.value); } }, mode.value === 'interactive' ? '交互' : '确定性'),
          h('button', { onclick: () => { engine.audio.ensure(); muted.value = engine.toggleMute(); } }, muted.value ? '🔇 静音' : '🔊 声音'),
          h('button', { onclick: () => { engine.setSpeed(engine.speed / 2); } }, '⏪ x½'),
        ]),
        h('label', { class: 'ed-label' }, '剧本（JSON，改后点“应用”，或由 dev-server 热重载）'),
        h('textarea', { class: 'ed-scene', spellcheck: 'false', value: sceneText.value,
          oninput: (e: Event) => { sceneText.value = ((e.target as HTMLTextAreaElement).value); } }),
        h('button', { class: 'ed-apply', onclick: applyScene }, '✔ 应用到预览'),
        h('details', { class: 'ed-inspect', open: true }, [h('summary', '元素检查器（引擎运行态）'), h('pre', inspect.value)]),
      ]);
    },
  };

  const app = createApp(App);
  app.mount(o.panelEl);
  return { destroy() { cancelAnimationFrame(raf); player.destroy(); app.unmount(); engine.stop(); } };
}
