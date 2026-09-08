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

export interface AmesuAssets { bg: string; char: string; bgm: string; sfx: string; voice: string; }
export interface AmesuDefaults { charColor: string; charW: number; charH: number; effectDuration: number; }

/** 主题元规范（Theme 的 Schema）。所有可调项（字体/颜色/布局/粒子/占位/默认素材/默认值）都声明在此。 */
export interface AmesuConfig {
  fonts: AmesuFonts;
  colors: AmesuColors;
  layout: AmesuLayout;
  particle: AmesuParticle;
  placeholder: AmesuPlaceholder;
  assets: AmesuAssets;
  defaults: AmesuDefaults;
}

export function isObj(v: unknown): v is Record<string, unknown> { return !!v && typeof v === 'object' && !Array.isArray(v); }
export function mergeTheme(base: unknown, patch: unknown): AmesuConfig {
  const b = isObj(base) ? base : {};
  const p = isObj(patch) ? patch : {};
  const out: Record<string, unknown> = { ...b };
  for (const k of Object.keys(p)) {
    const bv = b[k], pv = p[k];
    out[k] = isObj(bv) && isObj(pv) ? mergeTheme(bv, pv) : pv;
  }
  return out as unknown as AmesuConfig;
}