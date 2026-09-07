/*
 * Amesu —— 视觉小说演出引擎
 * Copyright (c) 2025 liyuier. Licensed under the MIT License (see LICENSE).
 *
 * 版权声明（含设计借鉴来源）：
 *   Amesu 为原创实现，部分架构思想（可序列化演出状态快照、视图按状态回放、
 *   演出预烘焙、运行态可观测性）受到 Librian (MIT? -> MPL-2.0, Copyright © RimoChan,
 *   https://github.com/RimoChan/Librian) 的启发。Amesu 未复制/修改 Librian 源码，
 *   因此不触发 MPL-2.0 文件级 copyleft；若日后复用其源文件，则该文件须继续以
 *   MPL-2.0 发布。详见仓库根 NOTICE。
 */
// Amesu/src/types.ts —— 核心类型定义（公开 API 与内部关键结构）
// 设计详见 doc/Amesu/AMESU-视觉小说引擎设计文档.md 与 02-API参考.md。

/** 一条演出指令（数据轨 JSON 对象；也由内容 API story 生成）。type 决定其字段集合。 */
export interface Directive {
  type: string;
  [k: string]: unknown;
  meta?: { line?: number; comment?: string };
}

export interface ProjectMeta {
  title?: string;
  author?: string;
  version?: string;
  resolution?: { width: number; height: number };
  res?: string;            // 资源根
  fps?: number;
  defaultBranch?: string;  // 确定性模式下 choice 自动选择
  characters?: Record<string, CharacterDef>;
  [k: string]: unknown;
}

export interface CharacterDef { id?: string; name?: string; color?: string; sprites?: Record<string, string>; }

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
  presets?: unknown[];
  theme?: unknown;
  [k: string]: unknown;
}

export interface EngineOptions {
  canvas?: HTMLCanvasElement;
  resolution?: { width: number; height: number };
  dpr?: number;
  fps?: number;
  assetBase?: string;
  mode?: 'interactive' | 'deterministic';
  loop?: boolean;
  autoplay?: boolean;
  plugins?: unknown[];
  onFrame?: (frame: number, state: EngineState) => void;
  onError?: (err: unknown) => void;
}

export interface EngineState {
  scene?: string | null;
  time: number;
  mode: string;
  speed: number;
  paused: boolean;
  ended: boolean;
  index?: number | null;
  activeTasks: string[];
  layers: { id: string; kind: string; z?: number; opacity?: number; pos?: number; sprite?: boolean }[];
  overlays: { type: string; t: number; dur: number }[];
  vars: Record<string, unknown>;
  lastSay: { who: string; text: string; reveal: number; len: number } | null;
  pendingChoice: { chosen: number | null; options: string[] } | null;
  audio: { volume: number; muted: boolean };
}

/** 运行时每个“阻塞任务”的形态。 */
export interface Task {
  kind: string;
  start: number;
  duration?: number;
  forced?: boolean;
  data?: unknown;
  tick?: (dt: number) => void;
  isDone: () => boolean;
  complete?: () => void;
}

export interface LayerState {
  key: string;
  kind: string;
  zIndex?: number;
  visible?: boolean;
  opacity?: number;
  transform?: unknown;
  source?: unknown;
  [k: string]: unknown;
}
