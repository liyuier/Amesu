/*
 * Amesu —— 视觉小说演出引擎
 * Copyright (c) 2025 liyuier. Licensed under the MIT License (see LICENSE).
 * 版权/借鉴见 src/types.ts 头条。
 */
// 指令处理层：把一条 directive 转成调度任务/状态改写，由 engine.ts Object.assign 挂到原型。
import type { Engine } from '../core/engine.js';
import { toMs, ease, lerp, clamp } from '../platform/util.js';
import type { Task, RainOverlay, Directive, SpriteRuntime } from '../types/types.js';

export const commands = {
  _spawn(this: Engine, d) {
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
,
  _taskTime(this: Engine, kind, duration) {
    const start = this.time;
    return {
      kind, start, duration,
      isDone: () => this.time - start >= duration,
      complete: () => {},
    };
  }
,
  _taskBg(this: Engine, d) {
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
,
  _taskChar(this: Engine, d) {
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
,
  _taskSay(this: Engine, d) {
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
,
  _taskCamera(this: Engine, d) {
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
,
  _taskMove(this: Engine, d) {
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
,
  _taskTween(this: Engine, d) {
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
,
  _taskChoice(this: Engine, d) {
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
,
  _taskEffect(this: Engine, d) {
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
,
  _applyBgStart(this: Engine, d) {
    this._bgSrc = (d.src as string) || '';
    this.bg.prev = this.bg.cur;
    this._bg(d.src).then((img) => {
      this.bg.cur = img; this.bg.mix = 0;
      if (d.transition === 'fade') this.fade = { color: 'rgba(0,0,0,0)', a: 0 };
      else if (d.transition === 'black') this.fade = { color: 'rgba(0,0,0,1)', a: 1 };
    });
  }
,
  _applyCharStart(this: Engine, d) {
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
,
  _xPos(this: Engine, at) {
    if (typeof at === 'number') return at;
    if (at === 'left') return 0.18;
    if (at === 'right') return 0.82;
    return 0.5;
  }
,
  _applyBGM(this: Engine, d) {
    if (!this.audio.ctx && !this.audio.ensure) return;
    this._audio('bgm', d.src).then((buf) => {
      this.audio.setBGM(buf, { volume: d.volume ?? 0.6, fade: toMs(d.fade) || 800, loop: d.loop !== false });
    });
  }
,
  _applySFX(this: Engine, d) {
    this._audio('sfx', d.src).then((buf) => {
      this.audio.playSFX(buf, { volume: d.volume ?? 0.7, at: toMs(d.at), fade: toMs(d.fade) });
    });
  }
,
  _applyVoice(this: Engine, d) {
    this._audio('voice', d.src).then((buf) => {
      this.audio.playVoice(buf, { at: toMs(d.offset) });
    });
  }
,
  _applyEffect(this: Engine, d) {
    // 生成非阻塞叠加层，持续 duration（默认 3000）。d.name 为特效名（如 particle:rain）。
    const duration = toMs(d.duration) || 3000;
    const start = this.time;
    const params = d.params || {};
    const overlay = this._makeRain(start, duration, { ...params, count: params.count ?? 220 });
    overlay.effectName = d.name;
    this.overlays.push(overlay);
  }
,
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
,
  _applySet(this: Engine, d) {
    const v = d.var; if (v == null) return;
    const cur = this.state.vars[v];
    if (d.op === 'toggle') this.state.vars[v] = !cur;
    else if (d.op === '+=') this.state.vars[v] = (Number(cur) || 0) + (Number(d.value) || 0);
    else if (d.op === '-=') this.state.vars[v] = (Number(cur) || 0) - (Number(d.value) || 0);
    else this.state.vars[v] = d.value;
  }
,
  _evalCond(this: Engine, cond) {
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
,
  _applyControl(this: Engine, d) {
    if (d.action === 'speed') this.speed = Number(d.value) || 1;
  }
,
  _resolveChoice(this: Engine) {
    const ch = this.pendingChoice; if (!ch || ch.chosen == null) return;
    const opt = ch.options[ch.chosen];
    if (opt?.set) for (const k of Object.keys(opt.set)) this.state.vars[k] = opt.set[k];
    this.pendingChoice = null;
    if (opt && opt.jump) this._gotoScene(opt.jump);
    // 若无 jump，则 continue（index 已在 spawn 时 advance）
  }
};
