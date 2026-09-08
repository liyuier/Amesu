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
// Amesu/src/audio.js —— WebAudio 后台音乐 / 音效 / 语音 管理
// 负责懒初始化 AudioContext、BGM 交叉淡化、短音效一次性播放、主音量/静音。

export class AudioManager {
  ctx!: AudioContext | null;
  bgmNode!: AudioBufferSourceNode | null;
  bgmGain!: GainNode | null;
  master!: GainNode | null;
  volume = 1;
  muted = false;
  constructor() {
    this.ctx = null;
    this.bgmNode = null;
    this.bgmGain = null;
    this.master = null;          // 主音量节点
    this.volume = 1;             // 0..1
    this.muted = false;
  }

  suspend() { try { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); } catch (e) { /* */ } }
  resume() { try { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); } catch (e) { /* */ } }
  ensure() {
    if (!this.ctx) {
      const AW = window as Window & { webkitAudioContext?: typeof AudioContext };
      const AC = window.AudioContext || AW.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this._applyVolume();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  _applyVolume() {
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
  }

  setVolume(v) { this.volume = clamp01(v); this._applyVolume(); }
  getVolume() { return this.muted ? 0 : this.volume; }
  setMuted(m) { this.muted = !!m; this._applyVolume(); }
  toggleMute() { this.setMuted(!this.muted); return this.muted; }
  isMuted() { return this.muted; }

  // 连接到一个统一主节点
  _pipe(node) { return node.connect(this.master); }

  // 播放 BGM；交叉淡化到新曲。buffer 为 AudioBuffer。
  setBGM(buffer, { loop = true, volume = 0.6, fade = 800 } = {}) {
    const ctx = this.ensure();
    if (this.bgmGain) {
      const old = this.bgmGain, oldSrc = this.bgmNode;
      old.gain.setValueAtTime(old.gain.value, ctx.currentTime);
      old.gain.linearRampToValueAtTime(0, ctx.currentTime + fade / 1000);
      setTimeout(() => { try { oldSrc.stop(); } catch (e) { /* */ } }, fade + 60);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = loop;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + fade / 1000);
    src.connect(gain);
    this._pipe(gain);
    src.start();
    this.bgmNode = src;
    this.bgmGain = gain;
  }

  stopBGM(fade = 400) {
    if (!this.bgmGain) return;
    const ctx = this.ctx, old = this.bgmGain, oldSrc = this.bgmNode;
    old.gain.setValueAtTime(old.gain.value, ctx.currentTime);
    old.gain.linearRampToValueAtTime(0, ctx.currentTime + fade / 1000);
    setTimeout(() => { try { oldSrc.stop(); } catch (e) { /* */ } }, fade + 60);
    this.bgmNode = null; this.bgmGain = null;
  }

  playSFX(buffer, { volume = 0.7, fade = 60, at = 0 } = {}) {
    if (!buffer) return;
    const ctx = this.ensure();
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    gain.gain.setValueAtTime(volume, ctx.currentTime + at / 1000);
    src.connect(gain);
    this._pipe(gain);
    src.start(ctx.currentTime + at / 1000);
  }

  playVoice(buffer, { volume = 0.8, at = 0 } = {}) {
    this.playSFX(buffer, { volume, at });
  }

  sfxClick() { /* 由引擎在交互时演奏 */ }
}

function clamp01(v) { return Math.max(0, Math.min(1, Number(v) || 0)); }
