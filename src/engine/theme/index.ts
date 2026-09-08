/*
 * Amesu —— 视觉小说演出引擎
 * Copyright (c) 2025 liuyier. Licensed under the MIT License (see LICENSE).
 * 版权/借鉴见 src/types.ts 头条。
 */
// 主题层：定义【元规范】（types.ts 的 AmesuConfig），再以不同【主题】填充实际内容。
// 引擎自带一套基础主题（base）；项目可在工程文件里引用引擎主题，或声明自己的主题/覆盖。
import { mergeTheme, isObj, type AmesuConfig } from './types.js';
import { baseTheme } from './base.js';

export type { AmesuConfig, AmesuFonts, AmesuColors, AmesuLayout, AmesuParticle, AmesuPlaceholder, AmesuAssets, AmesuDefaults } from './types.js';
export { baseTheme as DEFAULT_CONFIG } from './base.js';
export { mergeTheme, isObj } from './types.js';

// 引擎内置主题表：key 为主题名；value 为主题配置（可被项目“引用”并叠加覆盖）。
export const themes: Record<string, AmesuConfig> = {
  base: baseTheme,
  default: baseTheme,
};
export const DEFAULT_THEME = 'base';
export { baseTheme };

export type ThemeRef = string | { name?: string; overrides?: Partial<AmesuConfig> } | Partial<AmesuConfig>;

// 取主题：string => 按名查表；{ name, overrides } => 基础主题+覆盖；plain 对象 => base+覆盖。
export function resolveTheme(ref?: ThemeRef | null): AmesuConfig {
  if (!ref) return baseTheme;
  if (typeof ref === 'string') return themes[ref] ?? baseTheme;
  if (isObj(ref)) {
    const name = (ref as { name?: unknown }).name;
    const overrides = (ref as { overrides?: unknown }).overrides;
    if (typeof name === 'string' || (overrides !== undefined && isObj(overrides))) {
      const base = typeof name === 'string' ? (themes[name] ?? baseTheme) : baseTheme;
      return overrides !== undefined && isObj(overrides) ? mergeTheme(base, overrides) : base;
    }
    return mergeTheme(baseTheme, ref); // 视为对 base 的覆盖
  }
  return baseTheme;
}
