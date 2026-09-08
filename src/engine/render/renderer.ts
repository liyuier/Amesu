/*
 * Amesu —— 视觉小说演出引擎
 * Copyright (c) 2025 liuyier. Licensed under the MIT License (see LICENSE).
 * 版权/借鉴见 src/types.ts 头条。
 */
// 渲染层：纯绘制，由 engine.ts 通过 Object.assign 挂到 Engine 原型。
// 所有字体/颜色/尺寸/粒子参数统一取自 this.config（见 ../config.ts），便于维护与插件/可视化覆盖。
import type { Engine } from '../core/engine.js';
import { clamp, TAU } from '../platform/util.js';

export const renderer = {
  _drawDialogue(this: Engine, ctx, W, H) {
    if (!this.lastSay) return;
    const say = this.lastSay;
    const L = this.config.layout.dialogue, C = this.config.colors;
    const pad = L.pad, boxH = L.boxH;
    const x = pad, y = H - boxH - L.bottom, w = W - pad * 2, h = boxH;
    ctx.fillStyle = C.dialogueBg;
    this._roundRect(ctx, x, y, w, h, L.radius); ctx.fill();
    ctx.strokeStyle = C.dialogueBorder; ctx.lineWidth = C.dialogueBorderW;
    this._roundRect(ctx, x, y, w, h, L.radius); ctx.stroke();
    // 名字
    if (say.who) {
      ctx.fillStyle = C.name;
      ctx.font = this.config.fonts.name;
      ctx.fillText(say.who, x + L.nameDX, y + L.nameDY);
    }
    // 正文（打字机 + 换行）
    ctx.fillStyle = C.text;
    ctx.font = this.config.fonts.body;
    this._drawWrapped(ctx, say.text, Math.min(say.reveal, say.text.length), x + L.textDX, y + L.textDY, w - L.textPX * 2, L.lineH);
  }
,
  _render(this: Engine) {
    const ctx = this.ctx, W = this.res.width, H = this.res.height;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (this.domScene && !this.exportMode) { return; } // DOM 视图：画布留空（场景/UI 由 DOM 呈现）
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
    if (!this.domUI || this.exportMode) { // DOM 视图接管对白/选择/HUD；导出/截图时画布绘制
      this._drawDialogue(ctx, W, H);
      this._drawChoice(ctx, W, H);
      this._drawHud(ctx, W, H);
    }
  }
,
  _drawBg(this: Engine, ctx, W, H) {
    const bg = this.bg;
    if (bg.prev) this._drawCover(ctx, bg.prev, W, H, 1 - bg.mix);
    if (bg.cur) this._drawCover(ctx, bg.cur, W, H, bg.mix);
    else { ctx.fillStyle = this.config.colors.fallbackBg; ctx.fillRect(0, 0, W, H); }
  }
,
  _roundRect(this: Engine, ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
,
  _drawChoice(this: Engine, ctx, W, H) {
    if (!this.pendingChoice || this.pendingChoice.chosen != null) return;
    const C = this.config.colors, L = this.config.layout.choice, D = this.config.layout.dialogue;
    const opts = this.pendingChoice.options;
    const bw = L.width, bh = L.height, gap = L.gap;
    const x0 = (W - bw) / 2;
    const total = opts.length * (bh + gap) - gap;
    // 选项置于底部对话框上方，避免重叠
    const boxTop = H - D.boxH - D.bottom;
    let y0 = boxTop - total - L.topGap;
    if (y0 < L.minY) y0 = L.minY;
    this.pendingChoice.boxes = [];
    ctx.font = this.config.fonts.choice;
    for (let i = 0; i < opts.length; i++) {
      const yy = y0 + i * (bh + gap);
      ctx.fillStyle = C.choiceBg;
      this._roundRect(ctx, x0, yy, bw, bh, L.radius); ctx.fill();
      ctx.strokeStyle = C.choiceBorder; ctx.lineWidth = C.choiceBorderW;
      this._roundRect(ctx, x0, yy, bw, bh, L.radius); ctx.stroke();
      ctx.fillStyle = C.choiceText;
      ctx.fillText(opts[i].text, x0 + L.textDX, yy + bh / 2 + L.textDY);
      this.pendingChoice.boxes.push({ x: x0, y: yy, w: bw, h: bh });
    }
    ctx.fillStyle = C.choiceHint;
    ctx.font = this.config.fonts.hint;
    ctx.fillText('点击选择', x0 + bw + L.hintDX, y0 + L.hintDY);
  }
,
  _drawHud(this: Engine, ctx, W, H) {
    ctx.fillStyle = this.config.colors.hud;
    ctx.font = this.config.fonts.mono;
    const s = this.state.stack[this.state.stack.length - 1];
    const sceneId = s && this.story ? Object.keys(this.story.scenes).find((k) => this.story.scenes[k] === s.arr) : '';
    ctx.fillText(`scene:${sceneId || '-'}  t:${Math.round(this.time)}ms  ${this.mode}  x${this.speed}`, this.config.layout.hud.x, this.config.layout.hud.y);
  }
,
  _drawOverlays(this: Engine, ctx, W, H) {
    const rainCfg = this.config.particle.rain[0];
    for (const o of this.overlays) {
      if (o.type !== 'rain') continue;
      ctx.lineCap = 'round';
      for (const d of o.drops) {
        const elapsed = (this.time - o.start) / 1000;
        const ty = ((d.y + d.sp * elapsed) % (H + rainCfg.margin)) - 20;
        const slant = d.sp * (o.angle || 0) * rainCfg.angleCoef;
        ctx.strokeStyle = this.config.colors.rain;
        ctx.lineWidth = d.thick;
        ctx.beginPath();
        ctx.moveTo(d.x, ty);
        ctx.lineTo(d.x - slant - 2, ty + d.len);
        ctx.stroke();
      }
    }
  }
,
  _drawChars(this: Engine, ctx, W, H) {
    const S = this.config.layout.sprite, C = this.config.colors;
    const list = [...this.chars.values()].sort((a, b) => (a.z || 0) - (b.z || 0));
    for (const c of list) {
      if (!c.sprite) continue;
      const sw = c.sprite.width || 256, sh = c.sprite.height || 256;
      const dh = H * S.heightRatio; // 半身/全身高
      const dw = dh * (sw / sh);
      const cx = c.xFrac * W;
      const bx = cx - dw / 2;
      const by = H - S.bottomReserve - dh; // 立绘底部悬于对话框上方
      // 脚下软阴影
      ctx.save();
      ctx.globalAlpha = (c.opacity || 1) * S.shadowA;
      ctx.fillStyle = C.shadow;
      ctx.beginPath();
      ctx.ellipse(cx, H - S.shadowDY, dw * S.shadowW, S.shadowH, 0, 0, TAU);
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
,
  _drawCover(this: Engine, ctx, src, W, H, alpha) {
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
,
  _drawFade(this: Engine, ctx, W, H) {
    if (this.fade.a > 0) {
      ctx.globalAlpha = clamp(this.fade.a, 0, 1);
      ctx.fillStyle = this.fade.color;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }
,
  _drawEnd(this: Engine, ctx, W, H) {
    ctx.fillStyle = 'rgba(0,0,0,0)'; // 留空
  }
,
  _drawWrapped(this: Engine, ctx, text, reveal, x, y, maxW, lineH) {
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
};
