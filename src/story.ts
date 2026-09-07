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

const D = (type, attrs = {}) => ({ type, ...attrs });

class SceneBuilder {
  _dirs!: any[];
  constructor(dirs) { this._dirs = dirs; }
  bg(src, o = {}) { this._dirs.push(D('bg', { src, ...o })); return this; }
  char(id, o = {}) { this._dirs.push(D('char', { id, ...o })); return this; }
  say(who, text, o = {}) { this._dirs.push(D('say', { who, text, ...o })); return this; }
  voice(src, o = {}) { this._dirs.push(D('voice', { src, ...o })); return this; }
  bgm(src, o = {}) { this._dirs.push(D('bgm', { src, ...o })); return this; }
  sfx(src, o = {}) { this._dirs.push(D('sfx', { src, ...o })); return this; }
  move(target, o = {}) { this._dirs.push(D('move', { target, ...o })); return this; }
  tween(target, props, o = {}) { this._dirs.push(D('tween', { target, props, ...o })); return this; }
  effect(name, o = {}) { this._dirs.push(D('effect', { name, ...o })); return this; }
  camera(o = {}) { this._dirs.push(D('camera', { ...o })); return this; }
  wait(duration) { this._dirs.push(D('wait', { duration })); return this; }
  parallel(children) { this._dirs.push(D('parallel', { children })); return this; }
  choice(options) { this._dirs.push(D('choice', { options })); return this; }
  jump(to) { this._dirs.push(D('jump', { to })); return this; }
  label(name) { this._dirs.push(D('label', { name })); return this; }
  set(v, o = {}) { this._dirs.push(D('set', { var: v, ...o })); return this; }
  ifx(cond, then, els) { this._dirs.push(D('if', { cond, then, else: els })); return this; }
  include(path) { this._dirs.push(D('include', { path })); return this; }
  control(action, value) { this._dirs.push(D('control', { action, value })); return this; }
  raw(d) { this._dirs.push(d); return this; }
}

class StoryBuilder {
  _data!: any;
  constructor(meta) {
    this._data = { meta: meta || {}, start: '', scenes: {}, labels: {}, characters: {} };
  }
  meta(m) { this._data.meta = { ...this._data.meta, ...m }; return this; }
  start(id) { this._data.start = id; return this; }
  scene(id, fn) {
    const dirs = [];
    fn(new SceneBuilder(dirs));
    this._data.scenes[id] = dirs;
    return this;
  }
  label(name, sceneId) { this._data.labels[name] = sceneId; return this; }
  characters(c) { this._data.characters = { ...this._data.characters, ...c }; return this; }
  build() { return this._data; }
}

export const story = {
  create(meta) { return new StoryBuilder(meta); },
  meta(meta) { return new StoryBuilder(meta); },
};

// 从 JSON（数据轨）装载并归一，校验结构；返回规范 Story
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
export function storyToStory(builderOrObj) {
  if (builderOrObj && typeof builderOrObj.build === 'function') return loadStory(builderOrObj.build());
  return loadStory(builderOrObj);
}
