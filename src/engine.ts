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

import { loadStory } from './story.js';
import { clamp, lerp, ease, toMs, TAU } from './util.js';
import { makeBackground, makeCharacter, makeBGM, makeSFX, makeVoice } from './placeholder.js';
import { AudioManager } from './audio.js';
import type { Story, CharacterDef, Task, EngineOptions, Directive, EngineRunState, RainOverlay, SpriteRuntime, BgRuntime, CameraRuntime, SayRuntime, ChoiceRuntime, FadeRuntime, Project, Drawable, SceneState } from './types.js';


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
  bg!: BgRuntime;
  camera!: CameraRuntime;
  lastSay!: SayRuntime | null;
  pendingChoice!: ChoiceRuntime | null;
  fade!: FadeRuntime;
  skipRequested!: boolean;
  domUI = false;
  _bgSrc = ""; // 当前背景的原始 src（供 DOM background-image 使用） // 当采用 DOM(Vue) 视图时，画布跳过 UI 层，由 DOM 呈现
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
    this.mode = options.mode || 'interactive'; // 'interactive' | 'deterministic'
    this.story = loadStory(project.scripts || project);
    this.characters = Object.assign({}, meta.characters || {}, this.story.characters || {});

    // 运行时状态
    this.time = 0;             // 虚拟时钟（ms）
    this.speed = 1;            // 快慢放
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
    this.fade = { color: 'rgba(0,0,0,0)', a: 0 }; // 转场蒙版
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

  // 背景 drawable：真实图或占位渐变（缓存）
  async _bg(src) {
    const img = await this._loadImage(src, 'bg');
    if (img) return img;
    const key = 'ph_bg_' + src;
    if (this._imgCache.has(key)) return this._imgCache.get(key);
    const c = makeBackground(src || 'bg', this.res.width, this.res.height);
    this._imgCache.set(key, c);
    return c;
  }

  async _charSprite(id, expr, color) {
    const src = `char/${id}_${expr || 'normal'}.png`;
    const img = await this._loadImage(src, 'char');
    if (img) return img;
    const key = 'ph_char_' + id + '_' + (expr || 'normal');
    if (this._imgCache.has(key)) return this._imgCache.get(key);
    const c = makeCharacter(id, expr || 'normal', color || '#8fd0ff', 520, 760);
    this._imgCache.set(key, c);
    return c;
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
      if (kind === 'bgm') return makeBGM(ctx);
      if (kind === 'voice') return makeVoice(ctx);
      return makeSFX(ctx, 'click');
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
    this.time = 0; this.speed = 1; this.paused = false; this.ended = false;
    this.activeTasks = []; this.overlays = [];
    this.chars.clear(); this.bg = { cur: null, prev: null, mix: 1 };
    this.camera = { x: 0, y: 0, zoom: 1 }; this.lastSay = null; this.pendingChoice = null;
    this.fade = { color: 'rgba(0,0,0,0)', a: 0 };
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
    this._advance();
  }

  // ---------- 用户输入 ----------
  choose(i: number) { if (this.pendingChoice) { this.pendingChoice.chosen = i; } }
  handleClick(x, y) {
    if (this.mode === 'deterministic') return false;
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
    // 跳过进行中的特效（交互模式下单击=结束特效，类似“点一下打全句子”）
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
    try { this.sfxCache[kind] = makeSFX(this.audio.ensure(), kind); } catch (e) { return null; }
    return this.sfxCache[kind];
  }

  // ---------- 渲染 ----------
  // ---------- 公开播放控制 ----------
  play() { this.paused = false; this.audio.ensure(); }
  pause() { this.paused = true; }
  setSpeed(x) { this.speed = x; }
  seek(ms) { this.time = ms; }
  restart() { this.stop(); return this.start(); }
  stop() {
    this._running = false;
    cancelAnimationFrame(this._rafId);
    try { this.audio.stopBGM(200); } catch (e) { /* */ }
  }
  setMode(mode) { this.mode = mode; }
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
      .map((c) => ({ id: c.id, expr: c.expr, pos: c.xFrac, z: c.z, opacity: c.opacity, flip: c.scaleX < 0, color: c.color, ready: !!c.sprite }))
      .sort((a, b) => a.z - b.z);
    return {
      bg: this.bg.cur ? { src: this._bgSrc || '', mix: this.bg.mix } : null,
      sprites,
      say: this.lastSay ? { who: this.lastSay.who, text: this.lastSay.text, reveal: this.lastSay.reveal } : null,
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
    this._render();
    return this.canvas.toBlob ? new Promise((r) => this.canvas.toBlob((b) => r(b), 'image/png')) : this.canvas.toDataURL('image/png');
  }

  captureStream() { return this.canvas.captureStream(this.fps); }

  _spawn(d) {
    switch (d.type) {
      case 'bg': return this._taskBg(d);
      case 'char': return this._taskChar(d);
      case 'say': return this._taskSay(d);
      case 'wait': return this._taskTime('wait', toMs(d.duration));
      case 'camera': return this._taskCamera(d);
      case 'move': return this._taskMove(d);
      case 'tween': return this._taskTween(d);
      case 'choice': return this._taskChoice(d);
      case 'bgm': this._applyBGM(d); return null;
      case 'sfx': this._applySFX(d); return null;
      case 'voice': this._applyVoice(d); return null;
      case 'effect': return this._taskEffect(d);
      default: return null;
    }
  }

  _taskTime(kind, duration) {
    const start = this.time;
    return {
      kind, start, duration,
      isDone: () => this.time - start >= duration,
      complete: () => {},
    };
  }

  _taskBg(d) {
    const duration = toMs(d.duration) || (d.transition && d.transition !== 'none' ? 600 : 0);
    const start = this.time;
    const prevMix = this.bg.cur ? this.bg.mix : 1;
    this._applyBgStart(d);
    return {
      kind: 'bg', start, duration,
      isDone: () => this.time - start >= duration,
      tick: () => {
        if (duration > 0) this.bg.mix = clamp((this.time - start) / duration, 0, 1);
        else this.bg.mix = 1;
      },
      complete: () => { this.bg.mix = 1; if (this.bg.prev) this.bg.prev = null; },
    };
  }

  _taskChar(d) {
    this._applyCharStart(d);
    const dur = toMs(d.duration) || toMs(d.effect === 'fade-in' ? 400 : 0);
    const start = this.time;
    return {
      kind: 'char', start, duration: dur,
      isDone: () => this.time - start >= dur || dur === 0,
      tick: () => {
        const c = this.chars.get(d.id); if (!c) return;
        if (dur > 0 && c.opacityT !== undefined) {
          c.opacity = lerp(c.opacityFrom ?? 0, c.opacityTo ?? 1, clamp((this.time - start) / dur, 0, 1));
        }
      },
      complete: () => { const c = this.chars.get(d.id); if (c) c.opacity = 1; },
    };
  }

  _taskSay(d) {
    const text = d.text || '';
    const typewriter = toMs(d.typewriter);
    const start = this.time;
    const totalMs = text.length * typewriter;
    const obj = {
      who: d.who || '', text, typewriter, start,
      reveal: 0, typingDone: false, advance: false,
    };
    this.lastSay = obj;
    this.skipRequested = false;
    return {
      kind: 'say', start, data: obj,
      duration: totalMs,
      isDone: () => {
        if (this.mode === 'deterministic') return obj.typingDone;
        return obj.typingDone && obj.advance;
      },
      tick: () => {
        if (!obj.typingDone) {
          obj.reveal = Math.min(text.length, Math.floor((this.time - start) / (typewriter || 1)));
          if (obj.reveal >= text.length) { obj.typingDone = true; obj.reveal = text.length; }
        }
      },
      complete: () => {},
    };
  }

  _taskCamera(d) {
    const duration = toMs(d.duration) || 1000;
    const start = this.time;
    const from = { x: this.camera.x, y: this.camera.y, zoom: this.camera.zoom };
    const to = {
      x: d.move?.x ?? this.camera.x, y: d.move?.y ?? this.camera.y,
      zoom: d.move?.zoom ?? this.camera.zoom,
    };
    const e = ease(d.easing);
    return {
      kind: 'camera', start, duration,
      isDone: () => this.time - start >= duration,
      tick: () => {
        const t = clamp((this.time - start) / duration, 0, 1);
        const k = e(t);
        this.camera.x = lerp(from.x, to.x, k);
        this.camera.y = lerp(from.y, to.y, k);
        this.camera.zoom = lerp(from.zoom, to.zoom, k);
      },
      complete: () => {
        this.camera.x = to.x; this.camera.y = to.y; this.camera.zoom = to.zoom;
      },
    };
  }

  _taskMove(d) {
    const duration = toMs(d.duration) || 500;
    const start = this.time;
    const id = (d.target || '').replace(/^char:/, '');
    const c = this.chars.get(id);
    const from = { x: c ? c.xFrac : (d.from?.x ?? 0.5) };
    const to = { x: d.to?.x ?? (d.to?.x ?? from.x) };
    const e = ease(d.easing);
    return {
      kind: 'move', start, duration,
      isDone: () => this.time - start >= duration,
      tick: () => {
        const k = e(clamp((this.time - start) / duration, 0, 1));
        if (c) c.xFrac = lerp(from.x, to.x, k);
      },
      complete: () => { if (c) c.xFrac = to.x; },
    };
  }

  _taskTween(d) {
    const duration = toMs(d.duration) || 500;
    const start = this.time;
    const id = (d.target || '').replace(/^char:/, '');
    const c = this.chars.get(id);
    const props = d.props || {};
    const from = { opacity: c ? c.opacity : 1, scaleX: c ? (c.scaleX || 1) : 1 };
    const to = { opacity: props.opacity ?? from.opacity, scaleX: props.scale ?? from.scaleX };
    const e = ease(d.easing);
    return {
      kind: 'tween', start, duration,
      isDone: () => this.time - start >= duration,
      tick: () => {
        const k = e(clamp((this.time - start) / duration, 0, 1));
        if (c) { c.opacity = lerp(from.opacity, to.opacity, k); c.scaleX = lerp(from.scaleX, to.scaleX, k); }
      },
      complete: () => { if (c) { c.opacity = to.opacity; c.scaleX = to.scaleX; } },
    };
  }

  _taskChoice(d) {
    const options = d.options || [];
    this.pendingChoice = { options, chosen: null, boxes: [] };
    // 确定性：自动选默认（meta.defaultBranch 或第一项）
    if (this.mode === 'deterministic') {
      const def = this.story.meta?.defaultBranch;
      let idx = 0;
      if (def != null) {
        const i = options.findIndex((o) => o.text === def);
        if (i >= 0) idx = i;
      }
      this.pendingChoice.chosen = idx; // 确定性：自动选择，不依赖音频（避免 autoplay 限制）
    }
    return {
      kind: 'choice', start: this.time,
      isDone: () => this.pendingChoice && this.pendingChoice.chosen != null,
      complete: () => this._resolveChoice(),
    };
  }

  _applyBgStart(d) {
    this._bgSrc = (d.src as string) || '';
    this.bg.prev = this.bg.cur;
    this._bg(d.src).then((img) => {
      this.bg.cur = img; this.bg.mix = 0;
      if (d.transition === 'fade') this.fade = { color: 'rgba(0,0,0,0)', a: 0 };
      else if (d.transition === 'black') this.fade = { color: 'rgba(0,0,0,1)', a: 1 };
    });
  }

  _applyCharStart(d) {
    const cfg = this.characters[d.id as string] || {};
    const color = d.color || cfg.color || '#8fd0ff';
    const frac = this._xPos(d.at);
    this._charSprite(d.id, d.expr, color).then((sprite) => {
      const from: Partial<SpriteRuntime> = this.chars.get(d.id as string) || {};
      this.chars.set(d.id, {
        id: d.id, sprite, expr: d.expr, color,
        xFrac: from.xFrac ?? frac, z: d.z ?? 10,
        opacity: d.effect === 'fade-in' ? 0 : 1,
        opacityFrom: 0, opacityTo: 1,
        scaleX: d.flip ? -1 : 1,
      });
    });
    this.lastSay = null;
  }

  _xPos(at) {
    if (typeof at === 'number') return at;
    if (at === 'left') return 0.18;
    if (at === 'right') return 0.82;
    return 0.5;
  }

  _applyBGM(d) {
    if (!this.audio.ctx && !this.audio.ensure) return;
    this._audio('bgm', d.src).then((buf) => {
      this.audio.setBGM(buf, { volume: d.volume ?? 0.6, fade: toMs(d.fade) || 800, loop: d.loop !== false });
    });
  }

  _applySFX(d) {
    this._audio('sfx', d.src).then((buf) => {
      this.audio.playSFX(buf, { volume: d.volume ?? 0.7, at: toMs(d.at), fade: toMs(d.fade) });
    });
  }

  _applyVoice(d) {
    this._audio('voice', d.src).then((buf) => {
      this.audio.playVoice(buf, { at: toMs(d.offset) });
    });
  }

  _applyEffect(d) {
    // 生成非阻塞叠加层，持续 duration（默认 3000）。d.name 为特效名（如 particle:rain）。
    const duration = toMs(d.duration) || 3000;
    const start = this.time;
    const params = d.params || {};
    const overlay = this._makeRain(start, duration, { ...params, count: params.count ?? 220 });
    overlay.effectName = d.name;
    this.overlays.push(overlay);
  }

  _taskEffect(d) {
    const duration = toMs(d.duration) || 3000;
    const start = this.time;
    this._applyEffect(d);
    const t = {
      kind: 'effect', start, duration, forced: false,
      isDone: () => t.forced || (this.time - start >= duration),
      complete: () => {},
    };
    return t;
  }

  _makeRain(start, duration, p): RainOverlay {
    const W = this.res.width, H = this.res.height;
    const drops = [];
    const n = p.count || 200;
    for (let i = 0; i < n; i++) {
      drops.push({
        x: Math.random() * W, y: Math.random() * H,
        len: 14 + Math.random() * 26, sp: (p.speed || 300) * (0.6 + Math.random() * 0.8),
        thick: 1 + Math.random() * 2,
      });
    }
    return { type: 'rain', start, duration, angle: Number(p.angle) || 0, drops };
  }

  _applySet(d) {
    const v = d.var; if (v == null) return;
    const cur = this.state.vars[v];
    if (d.op === 'toggle') this.state.vars[v] = !cur;
    else if (d.op === '+=') this.state.vars[v] = (Number(cur) || 0) + (Number(d.value) || 0);
    else if (d.op === '-=') this.state.vars[v] = (Number(cur) || 0) - (Number(d.value) || 0);
    else this.state.vars[v] = d.value;
  }

  _evalCond(cond) {
    if (cond == null) return true;
    if (typeof cond === 'boolean') return cond;
    if (typeof cond === 'string') {
      // 极简表达式：支持 var == 'x' / var == x / var
      const m = cond.match(/^\s*([\w$]+)\s*(==|!=|>=|<=|>|<)\s*(.+?)\s*$/);
      if (m) {
        const a = this.state.vars[m[1]];
        let b: string | number = m[3]; if (b.startsWith("'") || b.startsWith('"')) b = b.slice(1, -1); else b = Number(b);
        switch (m[2]) { case '==': return a == b; case '!=': return a != b; case '>': return a > b; case '<': return a < b; case '>=': return a >= b; case '<=': return a <= b; }
      }
      return !!this.state.vars[cond];
    }
    return !!cond;
  }

  _applyControl(d) {
    if (d.action === 'speed') this.speed = Number(d.value) || 1;
  }

  _resolveChoice() {
    const ch = this.pendingChoice; if (!ch || ch.chosen == null) return;
    const opt = ch.options[ch.chosen];
    if (opt?.set) for (const k of Object.keys(opt.set)) this.state.vars[k] = opt.set[k];
    this.pendingChoice = null;
    if (opt && opt.jump) this._gotoScene(opt.jump);
    // 若无 jump，则 continue（index 已在 spawn 时 advance）
  }

  _render() {
    const ctx = this.ctx, W = this.res.width, H = this.res.height;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (this.ended) this._drawEnd(ctx, W, H);

    // 世界（镜头）
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(this.camera.zoom, this.camera.zoom);
    ctx.translate(-W / 2 - this.camera.x, -H / 2 - this.camera.y);

    this._drawBg(ctx, W, H);
    this._drawChars(ctx, W, H);
    this._drawOverlays(ctx, W, H);
    ctx.restore();

    // UI（屏幕空间）
    this._drawFade(ctx, W, H);
    if (!this.domUI) { // DOM(Vue) 视图接管对白/选择/HUD；否则画布绘制（供导出/截图）
      this._drawDialogue(ctx, W, H);
      this._drawChoice(ctx, W, H);
      this._drawHud(ctx, W, H);
    }
  }

  _drawBg(ctx, W, H) {
    const bg = this.bg;
    if (bg.prev) this._drawCover(ctx, bg.prev, W, H, 1 - bg.mix);
    if (bg.cur) this._drawCover(ctx, bg.cur, W, H, bg.mix);
    else { ctx.fillStyle = '#0c1220'; ctx.fillRect(0, 0, W, H); }

  }
  _drawCover(ctx, src, W, H, alpha) {
    if (!src) return;
    ctx.globalAlpha = clamp(alpha, 0, 1);
    try {
      const sw = src.width, sh = src.height;
      const s = Math.max(W / sw, H / sh);
      const dw = sw * s, dh = sh * s;
      ctx.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh);
    } catch (e) { /* ignore */ }
    ctx.globalAlpha = 1;
  }

  _drawChars(ctx, W, H) {
    const list = [...this.chars.values()].sort((a, b) => (a.z || 0) - (b.z || 0));
    for (const c of list) {
      if (!c.sprite) continue;
      const sw = c.sprite.width || 256, sh = c.sprite.height || 256;
      const dh = H * 0.48; // 半身/全身高
      const dw = dh * (sw / sh);
      const cx = c.xFrac * W;
      const bx = cx - dw / 2;
      const by = H - 172 - dh; // 立绘底部悬于对话框上方（约 172px 高的对话区）
      // 脚下软阴影
      ctx.save();
      ctx.globalAlpha = (c.opacity || 1) * 0.25;
      ctx.fillStyle = '#43301f';
      ctx.beginPath();
      ctx.ellipse(cx, H - 6, dw * 0.32, 14, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
      // 立绘
      ctx.save();
      ctx.globalAlpha = c.opacity;
      ctx.translate(cx, 0);
      ctx.scale(c.scaleX || 1, 1);
      ctx.drawImage(c.sprite, -dw / 2, by, dw, dh);
      ctx.restore();
    }
  }

  _drawOverlays(ctx, W, H) {
    for (const o of this.overlays) {
      if (o.type !== 'rain') continue;
      ctx.lineCap = 'round';
      for (const d of o.drops) {
        const elapsed = (this.time - o.start) / 1000;
        const ty = ((d.y + d.sp * elapsed) % (H + 40)) - 20;
        const slant = d.sp * (o.angle || 0) * 0.0012;
        ctx.strokeStyle = 'rgba(200,225,255,0.62)';
        ctx.lineWidth = d.thick;
        ctx.beginPath();
        ctx.moveTo(d.x, ty);
        ctx.lineTo(d.x - slant - 2, ty + d.len);
        ctx.stroke();
      }
    }
  }

  _drawFade(ctx, W, H) {
    if (this.fade.a > 0) {
      ctx.globalAlpha = clamp(this.fade.a, 0, 1);
      ctx.fillStyle = this.fade.color;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  _drawDialogue(ctx, W, H) {
    if (!this.lastSay) return;
    const say = this.lastSay;
    const pad = 24;
    const boxH = 140;
    const x = pad, y = H - boxH - 24, w = W - pad * 2, h = boxH;
    ctx.fillStyle = 'rgba(255,250,240,0.92)';
    this._roundRect(ctx, x, y, w, h, 16); ctx.fill();
    ctx.strokeStyle = 'rgba(180,140,100,0.45)'; ctx.lineWidth = 1.5;
    this._roundRect(ctx, x, y, w, h, 16); ctx.stroke();
    // 名字
    if (say.who) {
      ctx.fillStyle = '#a0552f';
      ctx.font = '600 24px "Noto Sans CJK SC","Noto Sans SC","Microsoft YaHei","PingFang SC",sans-serif';
      ctx.fillText(say.who, x + 22, y + 36);
    }
    // 正文（打字机 + 换行）
    ctx.fillStyle = 'rgba(60,45,30,0.95)';
    ctx.font = '22px "Noto Sans CJK SC","Noto Sans SC","Microsoft YaHei","PingFang SC",sans-serif';
    this._drawWrapped(ctx, say.text, Math.min(say.reveal, say.text.length), x + 22, y + 72, w - 44, 34);
  }

  _drawWrapped(ctx, text, reveal, x, y, maxW, lineH) {
    const t = text.slice(0, reveal);
    let line = '', yy = y;
    for (const ch of t) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxW && line !== '') {
        ctx.fillText(line, x, yy); line = ch; yy += lineH;
      } else line = test;
    }
    if (line) ctx.fillText(line, x, yy);
  }

  _drawChoice(ctx, W, H) {
    if (!this.pendingChoice || this.pendingChoice.chosen != null) return;
    const opts = this.pendingChoice.options;
    const bw = 360, bh = 52, gap = 18;
    const x0 = (W - bw) / 2;
    const total = opts.length * (bh + gap) - gap;
    // 选项置于底部对话框上方，避免重叠
    const boxTop = H - 140 - 24; // 与 _drawDialogue 的 box 顶部对齐
    let y0 = boxTop - total - 44;
    if (y0 < 60) y0 = 60;
    this.pendingChoice.boxes = [];
    ctx.font = '20px "Noto Sans CJK SC","Noto Sans SC","Microsoft YaHei","PingFang SC","WenQuanYi Micro Hei",sans-serif';
    for (let i = 0; i < opts.length; i++) {
      const yy = y0 + i * (bh + gap);
      ctx.fillStyle = 'rgba(255,250,240,0.95)';
      this._roundRect(ctx, x0, yy, bw, bh, 12); ctx.fill();
      ctx.strokeStyle = 'rgba(180,140,100,0.55)'; ctx.lineWidth = 1;
      this._roundRect(ctx, x0, yy, bw, bh, 12); ctx.stroke();
      ctx.fillStyle = 'rgba(70,50,35,0.95)';
      ctx.fillText(opts[i].text, x0 + 24, yy + bh / 2 + 7);
      this.pendingChoice.boxes.push({ x: x0, y: yy, w: bw, h: bh });
    }
    ctx.fillStyle = 'rgba(160,120,85,0.7)';
    ctx.font = '16px "Noto Sans CJK SC","Noto Sans SC","Microsoft YaHei","PingFang SC","WenQuanYi Micro Hei",sans-serif';
    ctx.fillText('点击选择', x0 + bw - 64, y0 - 10);
  }

  _drawHud(ctx, W, H) {
    ctx.fillStyle = 'rgba(120,90,60,0.6)';
    ctx.font = '13px monospace';
    const s = this.state.stack[this.state.stack.length - 1];
    const sceneId = s && this.story ? Object.keys(this.story.scenes).find((k) => this.story.scenes[k] === s.arr) : '';
    ctx.fillText(`scene:${sceneId || '-'}  t:${Math.round(this.time)}ms  ${this.mode}  x${this.speed}`, 12, 22);
  }

  _drawEnd(ctx, W, H) {
    ctx.fillStyle = 'rgba(0,0,0,0)'; // 留空
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}
