/*
 * Amesu —— 视觉小说演出引擎
 * Copyright (c) 2025 liyuier. Licensed under the MIT License (see LICENSE).
 *
 * 版权声明（含设计借鉴来源）：见 src/types.ts 头条说明（受 Librian (MPL-2.0) 架构启发）。
 */
// tools/drive.ts —— 让引擎/演示网页可被自动化驱动的 CDP(Chrome DevTools Protocol) 驱动。
// 零依赖：Node 内置 WebSocket + fetch，与 chrome --remote-debugging-port 通讯。
// 用途：加载 demo、模拟点击、读取引擎运行态、截图，供自我验证与后续开发。
// 运行：node tools/drive.ts [url]   （Node 22.6+ 可直接跑 .ts；也可用 esbuild 打包）
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';

const CHROME = process.env.CHROME || '/usr/bin/google-chrome';

function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }

export interface RuntimeSnapshot {
  scene?: string | null;
  time?: number;
  ended?: boolean;
  mode?: string;
  speed?: number;
  paused?: boolean;
  activeTasks?: string[];
  overlays?: { type?: string; t?: number; dur?: number }[];
  audio?: { volume: number; muted: boolean };
  pendingChoice?: { chosen: number | null; options?: string[] };
  [k: string]: unknown;
}

export interface Driver {
  evalJs(expr: string): Promise<unknown>;
  waitReady(timeoutMs?: number): Promise<boolean>;
  state(): Promise<RuntimeSnapshot | null>;
  clickSel(sel: string): Promise<string>;
  clickCanvas(lx: number, ly: number): Promise<void>;
  screenshot(file: string): Promise<string>;
  close(): Promise<void>;
}

interface CdpMessage { id?: number; result?: Record<string, unknown>; error?: { message?: string }; }
interface CdpTarget { type?: string; webSocketDebuggerUrl: string; }

export async function openDemo(url: string, opts: { debugPort?: number } = {}): Promise<Driver & { send: (m: string, p?: Record<string, unknown>) => Promise<unknown> }> {
  const port = opts.debugPort || (9000 + Math.floor(Math.random() * 2000));
  const profile = fs.mkdtempSync('/tmp/amesu_cdp_');
  const chrome: ChildProcess = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--no-proxy-server', '--disable-gpu',
    '--disable-dev-shm-usage', '--hide-scrollbars', '--mute-audio', '--no-first-run',
    '--window-size=1360,920',
    `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`,
    'about:blank',
  ], { stdio: 'ignore' });

  let targets: CdpTarget[] | null = null;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json`);
      targets = (await r.json()) as CdpTarget[];
      if (targets && targets.length) break;
    } catch (e) { /* retry */ }
    await sleep(250);
  }
  if (!targets || !targets.length) throw new Error('无法连接 chrome 调试端口');
  const page = targets.find((t) => t.type === 'page') || targets[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise<void>((res, rej) => { ws.onopen = () => res(); ws.onerror = () => rej(new Error('ws error')); });

  let id = 0;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  ws.onmessage = (ev: MessageEvent) => {
    const msg = JSON.parse(String(ev.data)) as CdpMessage;
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)!;
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message || JSON.stringify(msg.error))) : resolve(msg.result);
    }
  };
  const send = (method: string, params: Record<string, unknown> = {}): Promise<unknown> => new Promise((resolve, reject) => {
    const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params }));
  });

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url });
  await sleep(1200);

  const drive = {
    ws, chrome, send,
    async evalJs(expr: string): Promise<unknown> {
      const r = (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })) as Record<string, unknown>;
      const ex = r.exceptionDetails as { text?: string } | undefined;
      if (ex) throw new Error('page eval error: ' + (ex.text || ''));
      const res = r.result as { value?: unknown } | undefined;
      return res ? res.value : undefined;
    },
    async waitReady(timeoutMs = 12000): Promise<boolean> {
      const t0 = Date.now();
      while (Date.now() - t0 < timeoutMs) {
        try { if (await drive.evalJs('window.__amuseReady === true')) return true; } catch (e) { /* ignore */ }
        await sleep(250);
      }
      throw new Error('引擎未就绪（超时）');
    },
    async state(): Promise<RuntimeSnapshot | null> { return (await drive.evalJs('window.engine ? window.engine.inspect() : null')) as RuntimeSnapshot | null; },
    async clickSel(sel: string): Promise<string> { return (await drive.evalJs(`(function(){const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return 'no such el'; e.click(); return e.id;})()`)) as string; },
    async clickCanvas(lx: number, ly: number): Promise<void> {
      const rect = (await drive.evalJs('(function(){const c=document.getElementById("stage"); const r=c.getBoundingClientRect(); return {l:r.left,t:r.top,w:r.width,h:r.height};})()')) as { l: number; t: number; w: number; h: number };
      const sx = rect.w / 1280, sy = rect.h / 720;
      const x = rect.l + lx * sx, y = rect.t + ly * sy;
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    },
    async screenshot(file: string): Promise<string> {
      const r = (await send('Page.captureScreenshot', { format: 'png' })) as { data: string };
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
      return file;
    },
    async close(): Promise<void> {
      try { ws.close(); } catch (e) { /* ignore */ }
      try { chrome.kill('SIGKILL'); } catch (e) { /* ignore */ }
      try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* ignore */ }
    },
  };
  return drive;
}

// —— 内置验证场景：自动跑一遍 demo、检查各项修复 ——
export async function runVerify(url: string): Promise<string[]> {
  const d = await openDemo(url);
  const out: string[] = [];
  const log = (s: string) => { out.push(s); console.log('[drive]', s); };
  try {
    await d.waitReady();
    await d.clickSel('#btnStart');
    await sleep(300);
    log('引擎已就绪，已开始');

    const clickAdvance = () => d.evalJs('window.engine.handleClick(640,360)');

    let st: RuntimeSnapshot | null = null, guard = 0, sawChoice = false;
    while (guard++ < 120) {
      st = await d.state();
      if (st?.pendingChoice && st.pendingChoice.chosen == null) { sawChoice = true; break; }
      if (st?.ended) { log(`提前结束 scene=${st.scene}`); break; }
      await clickAdvance();
      await sleep(50);
    }
    log(`到达选择=${sawChoice} scene=${st?.scene}`);
    await d.screenshot('/tmp/v1_choice.png');

    if (sawChoice) {
      const box = (await d.evalJs('(function(){const b=window.engine.pendingChoice&&window.engine.pendingChoice.boxes;return b&&b[0]?{x:b[0].x+b[0].w/2,y:b[0].y+b[0].h/2}:null;})()')) as { x: number; y: number } | null;
      if (box) await d.evalJs(`window.engine.handleClick(${box.x},${box.y})`);
      else await d.evalJs('if(window.engine.pendingChoice)window.engine.pendingChoice.chosen=0;');
      for (let i = 0; i < 20; i++) { await sleep(120); st = await d.state(); if (st?.overlays?.length) break; }
      log(`进入特效 scene=${st?.scene} overlays=${JSON.stringify(st?.overlays)} active=${JSON.stringify(st?.activeTasks)} ended=${st?.ended}`);
      await d.screenshot('/tmp/v2_rain.png');
      for (let i = 0; i < 12; i++) { await clickAdvance(); await sleep(40); }
      st = await d.state();
      log(`快速点击后 ended=${st?.ended} scene=${st?.scene} overlays=${JSON.stringify(st?.overlays)}`);
      await d.screenshot('/tmp/v3_afterspam.png');
      const okBlock = !(st?.ended === true && st?.scene === 'scene_play');
      log(`[检查] effect 阻塞过快点击：${okBlock ? '通过' : '未通过'} (scene=${st?.scene}, ended=${st?.ended})`);
    }
    await d.evalJs('window.engine.audio.ensure(); window.engine.toggleMute();');
    st = await d.state();
    log(`静音后 audio=${JSON.stringify(st?.audio)}`);
    await d.evalJs('window.engine.toggleMute(); window.engine.setVolume(0.4);');
    st = await d.state();
    log(`恢复+音量0.4 audio=${JSON.stringify(st?.audio)}`);
    const insp = await d.evalJs('document.querySelector(".frame") ? document.querySelector(".frame").childElementCount : -1');
    log(`交付物播放器已挂载（.frame 子元素数）=${insp}`);
    await d.screenshot('/tmp/v4_inspector.png');
  } finally {
    await d.close();
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.argv[2] || 'http://127.0.0.1:11491/';
  await runVerify(url);
}
