/*
 * Amesu —— 视觉小说演出引擎
 * Copyright (c) 2025 liuyier. Licensed under the MIT License (see LICENSE).
 */
// 预设：一组可复用的演出片段（directive 数组），供 JSON/脚本轨引用，避免重复书写常见效果。
import type { Directive } from './types/types.js';

export const presets = {
  charFadeIn(id: string, at = 0.5): Directive[] {
    return [{ type: 'char', id, at, expr: 'normal', z: 10, effect: 'fade-in', duration: 500 }];
  },
  twoShot(a: string, b: string): Directive[] {
    return [{ type: 'shot', ids: [a, b] }];
  },
  bgFade(src: string, pos = '50% 50%'): Directive[] {
    return [{ type: 'bg', src, transition: 'fade', duration: 900, pos }];
  },
  speakerEffectNote(note = '说话者明暗+抖动'): Directive[] {
    return [{ type: 'say', who: '', text: `（效果：${note}。）`, typewriter: 40 }];
  },
};
