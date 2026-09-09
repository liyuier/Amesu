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
// Amesu/src/engine.js —— 引擎核心
// 职责：故事调度（含分支/并行/阻塞指令）、确定性虚拟时钟、图层渲染、
//       音效、交互（点击推进/跳过/选择）、确定性导出与录屏、公开 API。
// 设计详见 doc/AMESU-视觉小说引擎设计文档.md 与 doc/02-API参考.md。

import { loadStory } from '../content/story.js';
import { clamp, lerp, ease, toMs, TAU } from '../platform/util.js';
import { AudioManager } from '../platform/audio.js';
import { resolveTheme, mergeTheme, type AmesuConfig, type ThemeRef } from '../theme/index.js';
import type { Story, CharacterDef, Task, EngineOptions, Directive, EngineRunState, RainOverlay, SpriteRuntime, BgRuntime, CameraRuntime, SayRuntime, ChoiceRuntime, FadeRuntime, Project, Drawable, SceneState } from '../types/types.js';
import { renderer } from '../render/renderer.js';
import { commands } from '../commands/commands.js';


const cx = (id) => id; // 占位，保持引用清晰

export function createEngine(project, options = {}) {
  return new Engine(project, options);
}

export class Engine {
  // —— 运行时字段（声明以启用类型检查）——
  res!: { width: number; height: number };
  fps!: number;
  dpr!: number;
  assetBase!: string;
  resolveAsset!: ((src: string) => string) | null;
  config!: AmesuConfig;
  mode!: 'interactive' | 'deterministic';
  story!: Story;
  characters!: Record<string, CharacterDef>;
  time!: number;
  speed!: number;
  paused!: boolean;
  ended!: boolean;
  state!: EngineRunState;
  activeTasks!: Task[];
  overlays!: RainOverlay[];
  chars!: Map<string, SpriteRuntime>;
  cg: { src: string; opacity: number } | null = null;
  _cgFade = 0;
  uiFx: { block: string; tags: string[]; start: number; dur: number } | null = null;
  html: string | null = null;
  video: { src: string; skip: boolean; mode?: 'bg'|'cg' } | null = null;
  _bgmSrc: string | null = null;
  _bgmVol = 0.6;
  _bgmForResume: string | null = null;
  bg!: BgRuntime;
  camera!: CameraRuntime;
  lastSay!: SayRuntime | null;
  pendingChoice!: ChoiceRuntime | null;
  fade!: FadeRuntime;
  skipRequested!: boolean;
  domUI = false;
  domScene = false; // DOM(Vue) 视图接管场景，画布留空（仅导出时绘制）
  exportMode = false; // 导出/录制：让画布绘制完整帧
  _bgSrc = ""; // 当前背景的原始 src
  _bgPrevSrc = ""; // 上一次背景的 src（供 DOM 交叉淡出）
  _bgPos = 'center'; // 背景定位/平移
  _lastSpeaker = '';
  episode = 0;  // 每场次递增：重播时 +1，供呈现层强制重置场景
  _saySeq = 0;
  audio!: AudioManager;
  ctx!: CanvasRenderingContext2D;
  canvas!: HTMLCanvasElement;
  _listeners!: Record<string, Function[]>;
  _imgCache!: Map<string, Drawable | null>;
  _running!: boolean;
  _lastNow!: number;
  _rafId!: number;
  sfxCache?: Record<string, AudioBuffer | null>;
  project!: Project;

  constructor(project: Project, options: EngineOptions = {}) {
    const meta = project?.meta || {};
    this.res = options.resolution || meta.resolution || { width: 1280, height: 720 };
    this.fps = options.fps || meta.fps || 30;
    this.dpr = options.dpr || 1;
    this.assetBase = options.assetBase || meta.res || './assets';
    this.resolveAsset = options.resolveAsset ?? null;
    const metaTheme = (meta as { theme?: unknown }).theme as ThemeRef | undefined;
    this.config = mergeTheme(resolveTheme(options.theme ?? metaTheme), options.config);
    // 插件：install 时拿到 engine 实例，可挂指令/覆盖主题/加资源
    for (const p of (options.plugins ?? [])) { try { p?.install?.(this); } catch (e) { console.error('[amesu] plugin', p?.name, e); } }
    this.mode = options.mode || 'interactive'; // 'interactive' | 'deterministic'
    this.story = loadStory(project.scripts || project);
    this.characters = Object.assign({}, meta.characters || {}, this.story.characters || {});

    // 运行时状态
    this.time = 0;             // 虚拟时钟（ms）
    this.speed = 0.5;          // 默认速度(自动播放放慢/至少一半)
    this.paused = false;
    this.ended = false;
    this.state = { stack: [], vars: {} };
    this.activeTasks = [];     // 阻塞当前的演出任务
    this.overlays = [];        // 非阻塞叠加（雨等）
    this.chars = new Map();    // id -> char render state
    this.bg = { cur: null, prev: null, mix: 1 };
    this.camera = { x: 0, y: 0, zoom: 1 };
    this.lastSay = null;       // 当前对白（持续显示直到被替换）
    this.pendingChoice = null; // { options, chosen, boxes: [] }
    this.fade = { color: this.config.colors.fadeIn, a: 0 }; // 转场蒙版
    this.skipRequested = false;

    this.audio = new AudioManager();
    this._listeners = {};
    this._imgCache = new Map();
    this._running = false;
    this._lastNow = 0;
    this._rafId = 0;

    // canvas
    this.canvas = options.canvas || null;
    this._buildCanvas();
  }

  // ---------- 画布 ----------
  _buildCanvas() {
    const res = this.res;
    if (this.canvas) {
      this.ctx = this.canvas.getContext('2d');
    } else {
      if (typeof document === 'undefined') {
        throw new Error('Engine needs a canvas or a DOM document (please run in browser).');
      }
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d');
    }
    this.canvas.width = res.width * this.dpr;
    this.canvas.height = res.height * this.dpr;
    this.canvas.style.width = res.width + 'px';
    this.canvas.style.height = res.height + 'px';
  }

  // ---------- 事件 ----------
  on(evt, fn) { (this._listeners[evt] = this._listeners[evt] || []).push(fn); return () => this.off(evt, fn); }
  off(evt, fn) { this._listeners[evt] = (this._listeners[evt] || []).filter((f) => f !== fn); }
  _emit(evt: string, arg?: unknown) { for (const f of this._listeners[evt] || []) f(arg); }

  // ---------- 素材 ----------
  _resolve(src) {
    if (this.resolveAsset) return this.resolveAsset(src);
    try { return new URL(src, new URL(this.assetBase + '/', location.href)).href; }
    catch (e) { return src; }
  }

  async _loadImage(src, kind) {
    if (this._imgCache.has(src)) return this._imgCache.get(src);
    const url = this._resolve(src);
    const p = new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      img.onload = () => {
        if (kind === 'bg') resolve(img);
        else resolve(img);
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
    const img = await p;
    this._imgCache.set(src, img); // null => fallback to placeholder
    return img;
  }

  // 背景 drawable：真实图；缺失时回退到主题声明的默认素材（如 demo 提供的内容），再缺则用 colors.fallbackBg
  async _bg(src) {
    const img = await this._loadImage(src, 'bg');
    if (img) return img;
    const def = this.config.assets.bg;
    if (def && def !== src) { const d = await this._loadImage(def, 'bg'); if (d) { this._imgCache.set(src, d); return d; } }
    return null;
  }

  _spriteSrc(c: SpriteRuntime): string {
    if (!c.sprite) return '';
    if (c.sprite instanceof HTMLImageElement) return c.sprite.src;
    return (c.sprite as HTMLCanvasElement).toDataURL();
  }

  async _charSprite(id, expr, color, suffix = '') {
    // 逐角色：加载 char/{id}.png|jpg|jpeg（不同分辨率由 高度*宽高比 统一渲染）
    for (const ext of ['png', 'jpg', 'jpeg']) {
      const src = `char/${id}.${ext}`;
      const img = await this._loadImage(src, 'char');
      if (img) { this._imgCache.set(src, img); return img; }
    }
    const def = this.config.assets.char; if (def) { const d = await this._loadImage(def, 'char'); if (d) return d; }
    return null;
  }

  async _audio(kind, src) {
    const url = this._resolve(src);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('not found');
      const buf = await res.arrayBuffer();
      const ctx = this.audio.ensure(); // 确保 AudioContext 存在后再解码
      return await ctx.decodeAudioData(buf);
    } catch (e) {
      const ctx = this.audio.ensure();
      const def = kind === 'bgm' ? this.config.assets.bgm : (kind === 'voice' ? this.config.assets.voice : this.config.assets.sfx);
      if (def && def !== src) { try { const r = await fetch(this._resolve(def)); if (r.ok) return await ctx.decodeAudioData(await r.arrayBuffer()); } catch (e2) { /* 忽略 */ } }
      return null; // 无音频：静音（不再合成占位音）
    }
  }

  // ---------- 启动 / 播放 ----------
  async start() {
    if (!this.story.start) throw new Error('start scene not set');
    this._reset();
    this._running = true;
    this._lastNow = performance.now();
    const loop = (now) => {
      if (!this._running) return;
      try {
        const dt = clamp(now - this._lastNow, 0, 100);
        this._lastNow = now;
        if (!this.paused && !this.ended) {
          this.time += dt * this.speed;
          this._update(dt * this.speed);
        }
        this._render();
        this._emit('frame', this.inspect());
      } catch (e) {
        console.error('[amesu] LOOP-ERR', e && e.stack ? e.stack : e);
      }
      this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);
    this._emit('load');
    return this;
  }

  _reset() {
    this.episode++; this.time = 0; this.speed = 0.5; this.paused = false; this.ended = false;
    this.activeTasks = []; this.overlays = [];
    this.chars.clear(); this.bg = { cur: null, prev: null, mix: 1 };
    this.camera = { x: 0, y: 0, zoom: 1 }; this.lastSay = null; this.pendingChoice = null;
    this.html = null; this.cg = null; this.video = null; this.uiFx = null; // 清叠加层：重播不再残留
    this.fade = { color: this.config.colors.fadeIn, a: 0 };
    this.state = { stack: [{ arr: this.story.scenes[this.story.start] || [], index: 0 }], vars: {} };
    this._advance();
  }

  // ---------- 调度 ----------
  _peekDir() {
    let guard = 0;
    while (guard++ < 1000) {
      const top = this.state.stack[this.state.stack.length - 1];
      if (!top) { this.ended = true; return null; }
      if (top.index >= top.arr.length) { this.state.stack.pop(); continue; }
      return top.arr[top.index];
    }
    return null;
  }
  _advanceIndex() {
    const top = this.state.stack[this.state.stack.length - 1];
    if (top) top.index++;
  }
  _gotoScene(name) {
    const arr = this.story.scenes[name] || (this.story.labels[name] ? this.story.scenes[this.story.labels[name]] : []) || [];
    this.state.stack = [{ arr, index: 0 }];
  }

  // 嘴型分层：说话者(且主题 treatment==='sprite')加载 _talk 贴图，否则普通贴图
  _advance() {
    let guard = 0;
    while (guard++ < 10000) {
      if (this.activeTasks.length) return; // 被阻塞
      if (this.ended) return;
      const d = this._peekDir();
      if (!d) { this.ended = true; this._emit('ended', this.time); return; }

      switch (d.type) {
        case 'label': this._advanceIndex(); break;
        case 'set': this._applySet(d); this._advanceIndex(); break;
        case 'include': this._advanceIndex(); break; // demo：no-op
        case 'if': {
          const branch: Directive[] = this._evalCond(d.cond) ? ((d.then as Directive[]) || []) : ((d.else as Directive[]) || []);
          this._advanceIndex();
          if (branch.length) this.state.stack.push({ arr: branch, index: 0 });
          break;
        }
        case 'jump': this._gotoScene(d.to); break; // 不 advanceIndex，直接切换
        case 'control':
          this._applyControl(d);
          this._advanceIndex();
          if (d.action === 'stop') { this.ended = true; this._emit('ended', this.time); }
          break;
        case 'parallel': {
          const tasks = [];
          for (const child of ((d.children as Directive[]) || [])) {
            const t = this._spawn(child);
            if (t) tasks.push(t);
          }
          this.activeTasks.push(...tasks);
          this._advanceIndex();
          break;
        }
        default: {
          const t = this._spawn(d);
          if (t) {
            this.activeTasks.push(t);
            this._advanceIndex(); // 已被本指令消费，推进到下一条；任务完成为止不再前进
            return;
          }
          this._advanceIndex(); // 非阻塞（effect/voice/bgm/sfx），继续
          break;
        }
      }
    }
  }

  // 生成一个阻塞任务；非阻塞返回 null
  _update(dt) {
    const done = [];
    for (let i = 0; i < this.activeTasks.length; i++) {
      const t = this.activeTasks[i];
      if (t.tick) t.tick(dt);
      if (t.isDone && t.isDone()) done.push(t);
    }
    for (const t of done) { if (t.complete) t.complete(); }
    if (done.length) this.activeTasks = this.activeTasks.filter((t) => !done.includes(t));
    // 清理过期/被跳过的叠加
    this.overlays = this.overlays.filter((o) => !o.dead && (this.time - o.start < o.duration));
    // 转场蒙版衰减
    if (this.fade.a > 0 && this.activeTasks.length === 0) this.fade.a = Math.max(0, this.fade.a - dt / 500);
    // 人物淡入/淡出 + 平滑移动：向目标值线性插值（400ms 淡入淡出 / 500ms 移动）
    const EF = this.config.effect.character; // 时长来自【主题】；补间本身由引擎(确定性)执行
    for (const c of this.chars.values()) {
      // 归一化时长插值：任何距离/变化都正好跑满 duration（避免“小变化瞬间完成”的假快）
      if (c.opacityTo !== undefined && c.opacityStart !== undefined) {
        const dur = c.opacityTo > c.opacityFrom! ? EF.enter.duration : EF.exit.duration;
        c.opacity = clamp(lerp(c.opacityFrom ?? 0, c.opacityTo, clamp((this.time - c.opacityStart) / dur, 0, 1)), 0, 1);
      }
      if (c.xFracTo !== undefined && c.xFracFrom !== undefined && c.xFracStart !== undefined) {
        c.xFrac = lerp(c.xFracFrom, c.xFracTo, clamp((this.time - c.xFracStart) / EF.move.duration, 0, 1));
      }
    }
    // 离场：淡到 0 后移除
    for (const [id, c] of this.chars.entries()) { if (c.leaving && c.opacity === 0) this.chars.delete(id); }
    this._advance();
  }

  // ---------- 用户输入 ----------
  choose(i: number) { if (this.pendingChoice) { this.pendingChoice.chosen = i; } }
  handleClick(x, y) {
    if (this.mode === 'deterministic') return false;
    if (this.paused) this.paused = false; // 点击预览=恢复（与播放/暂停按钮同步，避免“音乐响但场景不推进”）
    this.audio.ensure();
    // 先命中选项
    if (this.pendingChoice && this.pendingChoice.chosen == null) {
      for (let i = 0; i < this.pendingChoice.boxes.length; i++) {
        const b = this.pendingChoice.boxes[i];
        if (b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
          this.pendingChoice.chosen = i;
          this.audio.playSFX(this._sfxBuf('chime'), {});
          return true;
        }
      }
      return false;
    }
    // 快进所有【角色移动/淡入淡出】（单击即结束进行中动效，同“点一下打全句子”）；并同步 from/start 防回弹闪烁
    for (const c of this.chars.values()) {
      if (c.xFracTo !== undefined) { c.xFrac = c.xFracTo; c.xFracFrom = c.xFracTo; c.xFracStart = this.time; }
      if (c.opacityTo !== undefined) { c.opacity = c.opacityTo; c.opacityFrom = c.opacityTo; c.opacityStart = this.time; }
    }
    // 跳过进行中的背景交叉淡入（单击即完成至新背景）
    const bgTask = this.activeTasks.find((t) => t.kind === 'bg');
    if (bgTask) bgTask.forced = true; // 单击即完成背景交叉淡入（complete 置 mix=1，避免直接赋值导致闪）
    // 跳过进行中的特效（交互模式下单击=结束特效）
    const efTask = this.activeTasks.find((t) => t.kind === 'effect');
    if (efTask) {
      efTask.forced = true;
      if (this.overlays.length) this.overlays[this.overlays.length - 1].dead = true;
      this.audio.playSFX(this._sfxBuf('click'), {});
      return true;
    }
    // 推进 / 跳过对白
    const say = this.lastSay;
    if (say) {
      if (!say.typingDone) { say.typingDone = true; say.reveal = say.text.length; return true; }
      else { say.advance = true; return true; }
    }
    return false;
  }

  _sfxBuf(kind) {
    if (!this.sfxCache) this.sfxCache = {};
    if (this.sfxCache[kind]) return this.sfxCache[kind];
    // 异步预载（fire-and-forget）：首次通常未就绪，返回 null（播放时忽略）
    this._audio(kind, 'audio/sfx/' + kind + '.wav').then((s) => { this.sfxCache[kind] = s; }).catch(() => { /* 忽略 */ });
    return null;
  }

  // ---------- 渲染 ----------
  // ---------- 公开播放控制 ----------
  play() { this.paused = false; this.audio.ensure(); this.audio.resume(); }
  pause() { this.paused = true; this.audio.suspend(); }
  setSpeed(x) { this.speed = x; }
  seek(ms) { this.time = ms; }
  restart() { this.stop(); return this.start(); }
  stop() {
    this._running = false;
    cancelAnimationFrame(this._rafId);
    try { this.audio.stopBGM(200); } catch (e) { /* */ }
  }
  setMode(mode) { this.mode = mode; }
  // 热重载：替换剧本（编辑器“应用”/dev-server 场景变化时调用）
  // 跳转到当前场景的第 i 条指令（重新应用 0..i，供“点结点→预览实时跳转”）
  seekSceneIndex(i: number) {
    const top = this.state.stack[0]; if (!top) return;
    const arr = top.arr; if (i < 0 || i >= arr.length) return;
    this.chars.clear(); this.bg = { cur: null, prev: null, mix: 1 }; this.activeTasks = []; this.overlays = [];
    this.lastSay = null; this.pendingChoice = null; this.cg = null; this.html = null; this.video = null; this.uiFx = {};
    for (let j = 0; j <= i; j++) { top.index = j; const d = arr[j]; if (d) { this._spawn(d); } }
    this.bg.mix = 1; // 背景立即完整显示（否则停在淡入 mix=0 → 黑）
    this.video = this.video && this.video.mode === 'bg' ? this.video : null; // 保留背景循环视频；跳到/越过 CG 视频步时清除(一次性事件)
    this.activeTasks = this.activeTasks.filter((t) => t.kind === 'bg' && this._bgSrc);
  }
  setScripts(scripts: Story | Record<string, unknown>) {
    this.story = loadStory(scripts);
    this.restart();
  }
  getState() {
    const s = this.state.stack[this.state.stack.length - 1];
    return { time: this.time, scene: s ? Object.keys(this.story.scenes).find((k) => this.story.scenes[k] === s.arr) : null, vars: this.state.vars, mode: this.mode };
  }

  // 音量/静音直通（供页面控制）
  setVolume(v) { this.audio.setVolume(v); }
  setMuted(m) { this.audio.setMuted(m); }
  toggleMute() { return this.audio.toggleMute(); }

  // 详细运行时快照，供“元素检查器 / 调试面板”用（DOM 层看到每个细节）
  inspect() {
    const s = this.state.stack[this.state.stack.length - 1];
    const scene = s ? Object.keys(this.story.scenes).find((k) => this.story.scenes[k] === s.arr) : null;
    const layerRows: { id: string; kind: string; z?: number; opacity: number; pos?: number; sprite?: boolean; transition?: string }[] = [...this.chars.entries()].map(([id, c]) => ({
      id, kind: 'sprite', z: c.z, opacity: Math.round((c.opacity || 0) * 100) / 100, pos: c.xFrac,
      sprite: !!c.sprite,
    }));
    if (this.bg.cur) layerRows.unshift({ id: 'bg', kind: 'bg', opacity: Math.round(this.bg.mix * 100) / 100, transition: 'fade' });
    return {
      scene, time: Math.round(this.time), mode: this.mode, speed: this.speed, paused: this.paused, ended: this.ended,
      index: s ? s.index : null, activeTasks: this.activeTasks.map((t) => t.kind),
      layers: layerRows, overlays: this.overlays.map((o) => ({ type: o.type + (o.effectName ? ':' + o.effectName : ''), t: Math.round(this.time - o.start), dur: o.duration })),
      vars: this.state.vars,
      lastSay: this.lastSay ? { who: this.lastSay.who, text: this.lastSay.text, reveal: this.lastSay.reveal, len: this.lastSay.text.length } : null,
      pendingChoice: this.pendingChoice ? { chosen: this.pendingChoice.chosen, options: this.pendingChoice.options.map((o) => o.text) } : null,
      audio: { volume: this.audio.volume, muted: this.audio.muted },
    };
  }

  // 返回当前演出状态的“快照”给 Vue/DOM 视图（元素级、类型化，无 any）
  getScene(): SceneState {
    const s = this.state.stack[this.state.stack.length - 1];
    const scene = s ? (Object.keys(this.story.scenes).find((k) => this.story.scenes[k] === s.arr) ?? null) : null;
    const sprites = [...this.chars.values()]
      .map((c) => ({ id: c.id, expr: c.expr, pos: c.xFrac, z: c.z, opacity: c.opacity, flip: c.scaleX < 0, color: c.color, ready: !!c.sprite, src: this._spriteSrc(c), speaking: c.id === this.lastSay?.who, fx: c.fx }))
      .sort((a, b) => a.z - b.z);
    return {
      cg: this.cg ? { src: this._resolve(this.cg.src), opacity: this.cg.opacity } : null,
      uiFx: this.uiFx && this.time - this.uiFx.start < this.uiFx.dur ? { block: this.uiFx.block, tags: this.uiFx.tags } : null,
      html: this.html, video: this.video ? { src: this._resolve(this.video.src), skip: this.video.skip, mode: this.video.mode as 'bg' | 'cg' } : null,
      bg: (this.bg.cur || this.bg.prev) ? {
        cur: this.bg.cur ? { src: this._resolve(this._bgSrc || ''), opacity: this.bg.mix, pos: this._bgPos } : null,
        prev: this.bg.prev ? { src: this._resolve(this._bgPrevSrc || ''), opacity: 1 - this.bg.mix, pos: this._bgPos } : null,
      } : null,
      sprites,
      episode: this.episode,
      say: this.lastSay ? { who: this.lastSay.who, text: this.lastSay.text, reveal: this.lastSay.reveal, id: this.lastSay.id } : null,
      choices: this.pendingChoice ? { chosen: this.pendingChoice.chosen, options: this.pendingChoice.options } : null,
      effects: this.overlays.map((o, idx) => ({ key: String(idx), type: (o.effectName ? o.type + ':' + o.effectName : o.type), start: o.start, duration: o.duration, params: {} })),
      vars: this.state.vars,
      time: this.time, scene, ended: this.ended, mode: this.mode, speed: this.speed, paused: this.paused,
    };
  }

  // 预加载剧本引用的所有图片素材（异步加载完成后缓存，供确定性渲染复用）
  async preload() {
    const jobs = [];
    const seen = new Set();
    const push = (key, fn) => { if (!seen.has(key)) { seen.add(key); jobs.push(fn().catch(() => null)); } };
    for (const sceneId of Object.keys(this.story.scenes)) {
      for (const d of this.story.scenes[sceneId]) {
        if (!d) continue;
        if (d.type === 'bg' && d.src) push('bg:' + d.src, () => this._bg(d.src));
        if (d.type === 'char' && d.id) push('char:' + d.id + ':' + d.expr, () => this._charSprite(d.id, d.expr, (this.characters[d.id as string] || {}).color));
      }
    }
    await Promise.all(jobs);
  }

  // 确定性地“快进到 ms 时刻”并渲染一帧（用于截图/测试，不依赖 rAF）
  async renderFrameAt(ms, step = 16) {
    this._running = false;
    await this.preload();
    this._reset();
    this.time = 0;
    let guard = 0;
    while (this.time < ms && !this.ended && guard++ < 100000) {
      this.time = Math.min(ms, this.time + step);
      this._update(step);
      await Promise.resolve(); // 让异步图片 .then 回调刷新 bg/角色
    }
    await Promise.resolve();
    try { this._render(); } catch (e) { console.error('[ains] renderFrameAt error', e); }
    return this.canvas;
  }

  // ---------- 输出 ----------
  async snapshot() {
    this.exportMode = true;
    this._render();
    this.exportMode = false;
    return this.canvas.toBlob ? new Promise((r) => this.canvas.toBlob((b) => r(b), 'image/png')) : this.canvas.toDataURL('image/png');
  }

  captureStream() { return this.canvas.captureStream(this.fps); }

}

export interface Engine { _spawn(...args: unknown[]): Task | null; _taskTime(...args: unknown[]): Task; _taskBg(...args: unknown[]): Task; _taskChar(...args: unknown[]): Task; _taskSay(...args: unknown[]): Task; _taskCamera(...args: unknown[]): Task; _taskMove(...args: unknown[]): Task; _taskTween(...args: unknown[]): Task; _taskChoice(...args: unknown[]): Task; _taskEffect(...args: unknown[]): Task; _applyBgStart(...args: unknown[]): void; _applyCharStart(...args: unknown[]): void; _applyHide(...args: unknown[]): void; _applyShot(...args: unknown[]): void; _defaultPositions(...args: unknown[]): number[]; _xPos(...args: unknown[]): number; _applyBGM(...args: unknown[]): void; _applyCg(...args: unknown[]): void; _applyFx(...args: unknown[]): void; _applyHtml(...args: unknown[]): void; _applyVideo(...args: unknown[]): void; _applySFX(...args: unknown[]): void; _applyVoice(...args: unknown[]): void; _applyEffect(...args: unknown[]): void; _makeRain(...args: unknown[]): RainOverlay; _applySet(...args: unknown[]): void; _evalCond(...args: unknown[]): boolean; _applyControl(...args: unknown[]): void; _resolveChoice(...args: unknown[]): void;  _drawDialogue(...args: unknown[]): void; _render(...args: unknown[]): void; _drawBg(...args: unknown[]): void; _roundRect(...args: unknown[]): void; _drawChoice(...args: unknown[]): void; _drawHud(...args: unknown[]): void; _drawOverlays(...args: unknown[]): void; _drawChars(...args: unknown[]): void; _drawCover(...args: unknown[]): void; _drawFade(...args: unknown[]): void; _drawEnd(...args: unknown[]): void; _drawWrapped(...args: unknown[]): void; }
Object.assign(Engine.prototype, commands, renderer);
