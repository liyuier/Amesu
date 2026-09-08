/*
 * Amesu —— 视觉小说演出引擎
 * Copyright (c) 2025 liuyier. Licensed under the MIT License (see LICENSE).
 * 版权/借鉴见 src/types.ts 头条。
 */
// 引擎自带的基础主题（themes.base）：一套完整的默认取值。
// 元规范见 ./types.ts（AmesuConfig）；此文件提供“具体内容”。项目可在 config.json 的 theme 里引用或覆盖它。
import type { AmesuConfig } from './types.js';

const F = '"Noto Sans CJK SC","Noto Sans SC","Microsoft YaHei","PingFang SC",sans-serif';
const WQ = '"Noto Sans CJK SC","Noto Sans SC","Microsoft YaHei","PingFang SC","WenQuanYi Micro Hei",sans-serif';

export const baseTheme: AmesuConfig = {
  fonts: {
    family: F,
    name: '600 24px ' + F,
    body: '22px ' + F,
    choice: '20px ' + WQ,
    hint: '16px ' + WQ,
    mono: '13px monospace',
  },
  colors: {
    dialogueBg: 'rgba(255,250,240,0.92)', dialogueBorder: 'rgba(180,140,100,0.45)', dialogueBorderW: 1.5, name: '#a0552f', text: 'rgba(60,45,30,0.95)',
    choiceBg: 'rgba(255,250,240,0.95)', choiceBorder: 'rgba(180,140,100,0.55)', choiceBorderW: 1, choiceText: 'rgba(70,50,35,0.95)', choiceHint: 'rgba(160,120,85,0.7)',
    hud: 'rgba(120,90,60,0.6)', fallbackBg: '#0c1220', shadow: '#43301f',
    rain: 'rgba(200,225,255,0.62)', rainAlpha: 0.62,
    fadeIn: 'rgba(0,0,0,0)', fadeOut: 'rgba(0,0,0,1)',
    charDefault: '#8fd0ff',
    bgPalettes: ['#0b1a2e', '#1b2f4d', '#2a3f5f', '#0e2233', '#1a1f33'], bgGlow: 'rgba(255,180,120,0.10)', vinIn: 'rgba(0,0,0,0)', vinOut: 'rgba(0,0,0,0.35)',
    character: { skinBase: '#f2d6c0', skinA: 0.25, shirtBase: '#222933', shirtA: 0.5, hairBase: '#222933', hairA: 0.5, eye: '#3a2a22', eyeFill: '#2a1c16', mouth: '#6b4a3a', highlight: 'rgba(255,255,255,0.05)' },
  },
  layout: {
    dialogue: { pad: 24, boxH: 140, bottom: 24, radius: 16, nameDX: 22, nameDY: 36, textDX: 22, textDY: 72, textPX: 22, lineH: 34 },
    choice: { width: 360, height: 52, gap: 18, topGap: 44, radius: 12, textDX: 24, textDY: 7, hintDX: -64, hintDY: -10, minY: 60 },
    hud: { x: 12, y: 22 },
    sprite: { heightRatio: 0.42, bottomReserve: 172, shadowA: 0.25, shadowW: 0.32, shadowH: 14, shadowDY: 6 },
  },
  particle: {
    rain: [
      { count: 200, lenMin: 14, lenVar: 26, speed: 300, speedVar: 0.8, thickMin: 1, thickVar: 2, angleCoef: 0.0012, margin: 40 },
    ],
  },
  placeholder: { size: 256, vignetteA: 0.35, glowA: 0.10, skinA: 0.25 },
  assets: { bg: 'bg/city_warm.jpg', char: 'char/kokoro.jpg', charTalk: 'char/kokoro.jpg', bgm: 'audio/bgm/JieWang-piano.mp3', sfx: 'audio/sfx/click.wav', voice: 'audio/voice/voice.wav' },
  effect: {
    character: { move: { duration: 900 }, enter: { duration: 400 }, exit: { duration: 300 } },
    speaker: { treatment: 'gray', grayFilter: 'grayscale(0.85) brightness(0.72)', dimOpacity: 0.72, spriteSuffix: 'talk' },
    transition: { crossfade: 800 },
    tags: { hit: 'brightness(1.9) saturate(0.2) contrast(1.4) hue-rotate(-30deg)', joy: 'brightness(1.35) saturate(1.9) hue-rotate(12deg)', shock: 'brightness(2) contrast(1.8) hue-rotate(28deg)', 'hurt': 'grayscale(.7) brightness(1.5) contrast(1.2)' },
  },
  defaults: { charColor: '#8fd0ff', charW: 520, charH: 760, effectDuration: 3000 },
};
