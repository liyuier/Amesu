/*
 * Amesu —— 视觉小说演出引擎
 * Copyright (c) 2025 liyuier. Licensed under the MIT License (see LICENSE).
 *
 * 版权声明（含设计借鉴来源）：
 *   Amesu 为原创实现，部分架构思想（可序列化演出状态快照、视图按状态回放、
 *   演出预烘焙、运行态可观测性）受到 Librian (MPL-2.0, Copyright © RimoChan) 的启发。
 *   Amesu 未复制/修改 Librian 源码，因此不触发 MPL-2.0 文件级 copyleft；
 *   若日后复用其源文件，则该文件须继续以 MPL-2.0 发布。详见仓库根 NOTICE。
 */

// —— 内容轨 ——
export interface Directive {
  type: string;
  [k: string]: unknown;
  meta?: { line?: number; comment?: string };
}
export interface CharacterDef { id?: string; name?: string; color?: string; sprites?: Record<string, string>; }
export interface ProjectMeta {
  title?: string; author?: string; version?: string;
  resolution?: { width: number; height: number };
  res?: string; fps?: number; defaultBranch?: string;
  characters?: Record<string, CharacterDef>;
  [k: string]: unknown;
}
export interface Story {
  meta?: { title?: string; res?: string; [k: string]: unknown };
  start: string;
  scenes: Record<string, Directive[]>;
  labels: Record<string, string>;
  characters?: Record<string, CharacterDef>;
}
export interface Project {
  meta?: ProjectMeta;
  scripts?: Story;
  characters?: Record<string, CharacterDef>;
  [k: string]: unknown;
}
import type { AmesuConfig } from '../theme/types.js';
import type { ThemeRef } from '../theme/index.js';

export interface EngineOptions {
  canvas?: HTMLCanvasElement;
  resolution?: { width: number; height: number };
  dpr?: number; fps?: number; assetBase?: string;
  mode?: 'interactive' | 'deterministic';
  loop?: boolean; autoplay?: boolean;
  resolveAsset?: (src: string) => string;
  config?: Partial<AmesuConfig>;
  theme?: ThemeRef;
  plugins?: unknown[];
  onFrame?: (frame: number, state: SceneState) => void;
  onError?: (err: unknown) => void;
}

// —— 演出状态快照（Vue 视图按此渲染，元素级可检查） ——
export interface BgState { src: string; mix: number; }
export interface SpriteState {
  id: string; expr: string; pos: number; z: number;
  opacity: number; flip: boolean; color: string; ready: boolean; src: string;
}
export interface SayState { who: string; text: string; reveal: number; }
export interface ChoiceOption { text: string; jump?: string; set?: Record<string, unknown>; }
export interface ChoiceState { chosen: number | null; options: ChoiceOption[]; }
export interface EffectState {
  key: string; type: string; start: number; duration: number;
  params: Record<string, unknown>;
}
export interface SceneState {
  bg: BgState | null;
  sprites: SpriteState[];
  say: SayState | null;
  choices: ChoiceState | null;
  effects: EffectState[];
  vars: Record<string, unknown>;
  time: number; scene: string | null; ended: boolean;
  mode: 'interactive' | 'deterministic'; speed: number; paused: boolean;
}

// —— 调度 / 运行时任务 ——
export interface Task {
  kind: string; start: number; duration?: number; forced?: boolean;
  data?: unknown;
  tick?: (dt: number) => void;
  isDone: () => boolean;
  complete?: () => void;
}

// —— 运行时内部（引擎持有，不用 any） ——
export type Drawable = HTMLImageElement | HTMLCanvasElement;
export interface BgRuntime { cur: Drawable | null; prev: Drawable | null; mix: number; }
export interface SpriteRuntime { id: string; expr: string; color: string; sprite: Drawable | null; xFrac: number; z: number; opacity: number; scaleX: number; opacityT?: number; opacityFrom?: number; opacityTo?: number; }
export interface SayRuntime { who: string; text: string; typewriter: number; start: number; reveal: number; typingDone: boolean; advance: boolean; }
export interface ChoiceRuntime { chosen: number | null; options: ChoiceOption[]; boxes: { x: number; y: number; w: number; h: number }[]; }
export interface FadeRuntime { color: string; a: number; }
export interface CameraRuntime { x: number; y: number; zoom: number; }
export interface RainDrop { x: number; y: number; len: number; sp: number; thick: number; }
export interface RainOverlay { type: 'rain'; effectName?: string; start: number; duration: number; angle: number; drops: RainDrop[]; dead?: boolean; }
export interface StackFrame { arr: Directive[]; index: number; }
export interface EngineRunState { stack: StackFrame[]; vars: Record<string, unknown>; }
