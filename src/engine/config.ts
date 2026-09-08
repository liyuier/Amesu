/*
 * Amesu —— 视觉小说演出引擎
 * Copyright (c) 2025 liuyier. Licensed under the MIT License (see LICENSE).
 * 版权/借鉴见 src/types.ts 头条。
 */
// 引擎统一样式/参数配置：把渲染、占位素材、粒子、默认值等所有可调项抽离到这份配置。
// 便于维护、插件覆盖、可视化调整。通过 createEngine({ config: {...} }) 传入（部分覆盖，自动深合并）。
export interface AmesuFonts {
  family: string;   // 字体族堆栈（canvas font-family）
  name: string;     // 对白名字字体（完整 css font 串）
  body: string;     // 对白正文字体
  choice: string;   // 选项字体
  hint: string;     // 提示字体
  mono: string;     // HUD 等宽字体
}

export interface AmesuColors {
  dialogueBg: string; dialogueBorder: string; dialogueBorderW: number; name: string; text: string;
  choiceBg: string; choiceBorder: string; choiceBorderW: number; choiceText: string; choiceHint: string;
  hud: string; fallbackBg: string; shadow: string;
  rain: string; rainAlpha: number;
  fadeIn: string; fadeOut: string;
  charDefault: string;
  bgPalettes: string[]; bgGlow: string; vinIn: string; vinOut: string;
  character: { skinBase: string; skinA: number; shirtBase: string; shirtA: number; hairBase: string; hairA: number; eye: string; eyeFill: string; mouth: string; highlight: string; };
}

export interface AmesuLayout {
  dialogue: { pad: number; boxH: number; bottom: number; radius: number; nameDX: number; nameDY: number; textDX: number; textDY: number; textPX: number; lineH: number };
  choice: { width: number; height: number; gap: number; topGap: number; radius: number; textDX: number; textDY: number; hintDX: number; hintDY: number; minY: number };
  hud: { x: number; y: number };
  sprite: { heightRatio: number; bottomReserve: number; shadowA: number; shadowW: number; shadowH: number; shadowDY: number };
}

export interface AmesuParticle { rain: { count: number; lenMin: number; lenVar: number; speed: number; speedVar: number; thickMin: number; thickVar: number; angleCoef: number; margin: number }[]; }

export interface AmesuPlaceholder { size: number; vignetteA: number; glowA: number; skinA: number; }

export interface AmesuDefaults { charColor: string; charW: number; charH: number; effectDuration: number; }

export interface AmesuConfig {
  fonts: AmesuFonts;
  colors: AmesuColors;
  layout: AmesuLayout;
  particle: AmesuParticle;
  placeholder: AmesuPlaceholder;
  defaults: AmesuDefaults;
}

const F = '"Noto Sans CJK SC","Noto Sans SC","Microsoft YaHei","PingFang SC",sans-serif';
const WQ = '"Noto Sans CJK SC","Noto Sans SC","Microsoft YaHei","PingFang SC","WenQuanYi Micro Hei",sans-serif';

export const DEFAULT_CONFIG: AmesuConfig = {
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
    sprite: { heightRatio: 0.48, bottomReserve: 172, shadowA: 0.25, shadowW: 0.32, shadowH: 14, shadowDY: 6 },
  },
  particle: {
    rain: [
      { count: 200, lenMin: 14, lenVar: 26, speed: 300, speedVar: 0.8, thickMin: 1, thickVar: 2, angleCoef: 0.0012, margin: 40 },
    ],
  },
  placeholder: { size: 256, vignetteA: 0.35, glowA: 0.10, skinA: 0.25 },
  defaults: { charColor: '#8fd0ff', charW: 520, charH: 760, effectDuration: 3000 },
};

function isObj(v: unknown): v is Record<string, unknown> { return !!v && typeof v === 'object' && !Array.isArray(v); }
function merge<T>(base: T, patch: unknown): T {
  if (!isObj(base) || !isObj(patch)) return (patch === undefined ? base : (patch as T));
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const k of Object.keys(patch)) {
    const b = (base as Record<string, unknown>)[k], p = patch[k];
    out[k] = isObj(b) && isObj(p) ? merge(b, p) : p;
  }
  return out as T;
}
export function mergeConfig(patch?: Partial<AmesuConfig> | null): AmesuConfig { return patch ? merge(DEFAULT_CONFIG, patch) : DEFAULT_CONFIG; }
