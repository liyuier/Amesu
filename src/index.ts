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
// Amesu/src/index.js —— 引擎公开入口
// 对应 doc/02-API参考.md 的导出清单。

export { createEngine } from './engine.js';
export { story, loadStory, storyToStory } from './story.js';
export { Easing, clamp, lerp } from './util.js';
export { makeBackground, makeCharacter, makeBGM, makeSFX, makeVoice } from './placeholder.js';
export { AudioManager } from './audio.js';
export { createPlayer, readScene } from './ui.js';
