/*
 * Amesu —— 视觉小说演出引擎
 * Copyright (c) 2025 liyuier. Licensed under the MIT License (see LICENSE).
 * 版权/借鉴见 src/types.ts 头条。
 */
// 渲染层：纯绘制，由 engine.ts 通过 Object.assign 挂到 Engine 原型。
import type { Engine } from '../core/engine.js';
import { clamp, TAU } from '../platform/util.js';

export const renderer = {
  _drawDialogue(this: Engine, ctx, W, H) {
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
    else { ctx.fillStyle = '#0c1220'; ctx.fillRect(0, 0, W, H); }

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
,
  _drawHud(this: Engine, ctx, W, H) {
    ctx.fillStyle = 'rgba(120,90,60,0.6)';
    ctx.font = '13px monospace';
    const s = this.state.stack[this.state.stack.length - 1];
    const sceneId = s && this.story ? Object.keys(this.story.scenes).find((k) => this.story.scenes[k] === s.arr) : '';
    ctx.fillText(`scene:${sceneId || '-'}  t:${Math.round(this.time)}ms  ${this.mode}  x${this.speed}`, 12, 22);
  }
,
  _drawOverlays(this: Engine, ctx, W, H) {
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
,
  _drawChars(this: Engine, ctx, W, H) {
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
