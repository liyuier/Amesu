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
// Amesu/src/util.js —— 通用工具：缓动、数学、时间
// 纯函数、无 DOM 依赖，可被 Node 单测。

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const TAU = Math.PI * 2;

// 缓动函数：输入 0..1，输出 0..1
export const Easing = {
  linear: (t) => t,
  'ease-out': (t) => 1 - Math.pow(1 - t, 3),
  'ease-in': (t) => Math.pow(t, 3),
  'ease-in-out': (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  quad: (t) => t * t,
};

// 解析缓动名（含默认）
export const ease = (name) => Easing[name] || Easing.linear;

// 把字符串或数字解析为毫秒；支持 "1200" / 1200 / "1.2s"
export const toMs = (v) => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    let n = parseFloat(v);
    if (v.trim().endsWith('s')) n *= 1000;
    return isNaN(n) ? 0 : n;
  }
  return 0;
};

// 简单颜色混合（hex -> hex），用于占位渐变
export const mixHex = (a, b, t) => {
  const pa = hexToRgb(a), pb = hexToRgb(b);
  const r = Math.round(lerp(pa[0], pb[0], t));
  const g = Math.round(lerp(pa[1], pb[1], t));
  const bl = Math.round(lerp(pa[2], pb[2], t));
  return `rgb(${r},${g},${bl})`;
};

export const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

// 伪随机（可复现），基于字符串 seed
export const seededRng = (seedStr) => {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    return ((h >>> 0) % 1000) / 1000;
  };
};
