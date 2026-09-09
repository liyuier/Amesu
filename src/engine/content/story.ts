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
// Amesu/src/story.js —— 内容编写 builder + 剧本 JSON 装载/归一
// 产出「可序列化」的 Story 数据：{ meta, start, scenes, labels, characters }
// 该数据与 JSON 数据轨等价，可被 runtime 消费。


import type { Directive, Story } from '../types/types.js';

export function loadStory(data) {
  if (!data) throw new Error('loadStory: no data');
  const scenes = {};
  const rawScenes = data.scenes || {};
  for (const id of Object.keys(rawScenes)) {
    const v = rawScenes[id];
    scenes[id] = Array.isArray(v) ? v : Object.keys(v).map((k) => ({ type: k, ...v[k] }));
  }
  const labels = Object.assign({}, data.labels || {});
  // scenes 里的 label 标记也记入 labels
  for (const id of Object.keys(scenes)) {
    for (const d of scenes[id]) {
      if (d && d.type === 'label' && d.name) labels[d.name] = labels[d.name] || id;
    }
  }
  return {
    meta: data.meta || {},
    start: data.start || '',
    scenes,
    labels,
    characters: data.characters || {},
  };
}

// 便利：把 builder 的结果直接给 runtime
