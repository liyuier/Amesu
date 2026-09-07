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
// Amesu/src/placeholder.js —— 默认素材包（占位版）
// 当真实素材文件缺失时，用程序化方式合成占位背景 / 立绘 / 音频，
// 使 demo 「开箱即跑」。正式引擎会替换为真实默认素材包文件，
// 但占位合成可长期保留作为 fallback（与设计文档 §3.9 对应）。

import { mixHex, seededRng, TAU } from './util.js';

// ---------- 背景 ----------
// 根据资源名生成一张确定性的暮色/夜景渐变背景
export function makeBackground(name, w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const seed = seededRng(String(name));
  const palettes = ['#0b1a2e', '#1b2f4d', '#2a3f5f', '#0e2233', '#1a1f33'];
  const top = palettes[Math.floor(seed() * palettes.length)];
  const bot = mixHex('#0c1220', top, 0.5);
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bot);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);

  // 微光星点（确定性伪随机，避免闪烁）
  const n = Math.floor((w * h) / 22000);
  for (let i = 0; i < n; i++) {
    const x = seed() * w, y = seed() * h * 0.55;
    const r = 0.4 + seed() * 1.4;
    g.fillStyle = `rgba(255,255,255,${0.05 + seed() * 0.25})`;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
  }

  // 底部地平线亮带（营造“城市夜”氛围）
  g.fillStyle = 'rgba(255,180,120,0.10)';
  g.fillRect(0, h * 0.72, w, h * 0.28);

  // 轻微暗角
  const vig = g.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, h * 0.85);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.35)');
  g.fillStyle = vig;
  g.fillRect(0, 0, w, h);
  return c;
}

// ---------- 立绘 ----------
// 一个简单的、可辨识的占位人物，带表情；按 id 赋色，按 expr 变表情
const EXPR_MOUTH = {
  happy: (g, x, y) => { g.beginPath(); g.arc(x, y, 26, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); },
  sad:   (g, x, y) => { g.beginPath(); g.arc(x, y + 18, 22, 1.15 * Math.PI, 1.85 * Math.PI); g.stroke(); },
  angry: (g, x, y) => { g.moveTo(x - 22, y - 4); g.lineTo(x + 22, y + 6); },
  normal:(g, x, y) => { g.beginPath(); g.moveTo(x - 22, y); g.lineTo(x + 22, y); g.stroke(); },
};
const EXPR_EYES = {
  happy: (g, x, y) => { g.beginPath(); g.arc(x - 20, y, 8, 0, Math.PI, true); g.arc(x + 20, y, 8, 0, Math.PI, true); g.stroke(); },
  sad:   (g, x, y) => { g.beginPath(); g.arc(x - 20, y, 8, 0, Math.PI); g.arc(x + 20, y, 8, 0, Math.PI); g.stroke(); },
  angry: (g, x, y) => { g.moveTo(x - 28, y - 6); g.lineTo(x - 12, y + 2); g.moveTo(x + 28, y - 6); g.lineTo(x + 12, y + 2); },
  normal:(g, x, y) => { g.beginPath(); g.arc(x - 20, y, 7, 0, TAU); g.arc(x + 20, y, 7, 0, TAU); g.fill(); },
};

export function makeCharacter(id, expr, color, w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const cx = w / 2;
  const base = color || '#8fd0ff';
  const seed = seededRng(String(id));

  // 身体（长袍/大衣）
  g.fillStyle = base;
  g.beginPath();
  g.moveTo(cx - w * 0.34, h);
  g.quadraticCurveTo(cx, h * 0.36, cx + w * 0.34, h);
  g.closePath();
  g.fill();

  // 头部
  const headY = h * 0.30, headR = w * 0.20;
  const skin = mixHex('#f2d6c0', base, 0.25);
  g.fillStyle = skin;
  g.beginPath();
  g.arc(cx, headY, headR, 0, TAU);
  g.fill();

  // 头发
  g.fillStyle = mixHex('#222933', base, 0.5);
  g.beginPath();
  g.arc(cx, headY - headR * 0.18, headR * 1.05, Math.PI, TAU);
  g.fill();

  // 表情
  g.strokeStyle = '#3a2a22';
  g.lineWidth = Math.max(3, w * 0.012);
  g.lineCap = 'round';
  const mouthFn = EXPR_MOUTH[expr] || EXPR_MOUTH.normal;
  const eyesFn = EXPR_EYES[expr] || EXPR_EYES.normal;
  g.fillStyle = '#2a1c16';
  g.strokeStyle = '#2a1c16';
  eyesFn(g, cx, headY - headR * 0.12);
  g.strokeStyle = '#6b4a3a';
  mouthFn(g, cx, headY + headR * 0.5);

  // 轮廓
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 2;
  g.strokeRect(0.5, 0.5, w - 1, h - 1);

  // 轻微随机色斑避免太呆板
  g.fillStyle = 'rgba(255,255,255,0.05)';
  g.beginPath(); g.arc(cx + (seed() - 0.5) * w * 0.3, h * 0.8, w * 0.12, 0, TAU); g.fill();
  return c;
}

// ---------- 音频 ----------
// 合成一段循环 BGM（温和小和弦 pad）
export function makeBGM(ctx) {
  const sr = ctx.sampleRate;
  const dur = 4; // 4 秒循环
  const buffer = ctx.createBuffer(2, sr * dur, sr);
  const notes = [220, 277.18, 329.63, 440]; // A, C#, E, A
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const t = i / sr;
      const beat = Math.floor(t / 2); // 2 秒一个和弦
      const f = notes[(beat + ch) % notes.length];
      const env = Math.min(1, (t % 2) * 4) * Math.min(1, 2 - (t % 2) * 2);
      let s = 0;
      for (const det of [0, 2, -2]) {
        s += Math.sin(TAU * (f + det) * t) * 0.33;
      }
      data[i] = s * env * 0.16;
    }
  }
  return buffer;
}

// 一段短音效（点击 / 确认）
export function makeSFX(ctx, kind = 'click') {
  const sr = ctx.sampleRate;
  const dur = 0.12;
  const buffer = ctx.createBuffer(1, sr * dur, sr);
  const data = buffer.getChannelData(0);
  if (kind === 'chime') {
    for (let i = 0; i < data.length; i++) {
      const t = i / sr;
      data[i] = Math.sin(TAU * 880 * t) * Math.exp(-t * 30) * 0.3;
    }
  } else {
    for (let i = 0; i < data.length; i++) {
      const t = i / sr;
      data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 60) * 0.25;
    }
  }
  return buffer;
}

// 语音（软音调占位）
export function makeVoice(ctx) {
  const sr = ctx.sampleRate;
  const dur = 0.9;
  const buffer = ctx.createBuffer(1, sr * dur, sr);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    const f = 440 + Math.sin(TAU * 4 * t) * 30;
    data[i] = Math.sin(TAU * f * t) * Math.exp(-t * 4) * 0.2;
  }
  return buffer;
}
