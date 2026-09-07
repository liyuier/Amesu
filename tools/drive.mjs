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
// tools/drive.mjs —— 让引擎/演示网页可被自动化驱动的 CDP(Chrome DevTools Protocol) 驱动。
// 零依赖：用 Node 内置 WebSocket + fetch 与 chrome --remote-debugging-port 通讯。
// 用途：加载 demo，模拟真实点击/读取引擎运行态/截图，用于自我验证与后续开发。
//
// 用法：
//   import { openDemo } from './drive.mjs';
//   const d = await openDemo('http://127.0.0.1:11491/');
//   await d.clickSel('#btnStart');          // 点“开始演出”
//   await d.waitReady();                    // 等待引擎就绪
//   await d.clickCanvas(640, 600);          // 点画面(逻辑坐标)推进/跳过
//   console.log(await d.state());           // 读取引擎 inspect() 快照
//   await d.screenshot('out.png');
//   d.close();
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const CHROME = process.env.CHROME || '/usr/bin/google-chrome';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

export async function openDemo(url, { debugPort = 0 } = {}) {
  const port = debugPort || (9000 + Math.floor(Math.random() * 2000));
  const profile = fs.mkdtempSync('/tmp/amesu_cdp_');
  const chrome = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--no-proxy-server', '--disable-gpu',
    '--disable-dev-shm-usage', '--hide-scrollbars', '--mute-audio', '--no-first-run',
    '--window-size=1360,920',
    `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`,
    'about:blank',
  ], { stdio: 'ignore' });

  // 等待调试端口可用
  let targets = null;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json`);
      targets = await r.json();
      if (targets && targets.length) break;
    } catch (e) { /* retry */ }
    await sleep(250);
  }
  if (!targets || !targets.length) throw new Error('无法连接 chrome 调试端口');
  const page = targets.find((t) => t.type === 'page') || targets[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params }));
  });

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url });
  await sleep(1200); // 等待页面与模块加载

  const drive = {
    ws, chrome, send,
    async evalJs(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error('page eval error: ' + (r.exceptionDetails.text || ''));
      return r.result ? r.result.value : undefined;
    },
    async waitReady(timeoutMs = 12000) {
      const t0 = Date.now();
      while (Date.now() - t0 < timeoutMs) {
        try { if (await drive.evalJs('window.__amuseReady === true')) return true; } catch (e) {}
        await sleep(250);
      }
      throw new Error('引擎未就绪（超时）');
    },
    async state() { return drive.evalJs('window.engine ? window.engine.inspect() : null'); },
    async clickSel(sel) { return drive.evalJs(`(function(){const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return 'no such el'; e.click(); return e.id;})()`); },
    // 画布逻辑坐标点击：换算到视口坐标，走真实 click 事件
    async clickCanvas(lx, ly) {
      const rect = await drive.evalJs('(function(){const c=document.getElementById("stage"); const r=c.getBoundingClientRect(); return {l:r.left,t:r.top,w:r.width,h:r.height};})()');
      const sx = rect.w / 1280, sy = rect.h / 720;
      const x = rect.l + lx * sx, y = rect.t + ly * sy;
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    },
    async screenshot(file) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
      return file;
    },
    async close() {
      try { ws.close(); } catch (e) {}
      try { chrome.kill('SIGKILL'); } catch (e) {}
      try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
    },
  };
  return drive;
}

// —— 内置验证场景：自动跑一遍 demo、检查各项修复 ——
export async function runVerify(url) {
  const d = await openDemo(url);
  const out = [];
  const log = (s) => { out.push(s); console.log('[drive]', s); };
  try {
    await d.waitReady();
    await d.clickSel('#btnStart');
    await sleep(300);
    log('引擎已就绪，已开始');

    const clickAdvance = async () => d.evalJs('window.engine.handleClick(640,360)');

    // 交互推进：反复点“推进”，直到出现选择
    let st, guard = 0, sawChoice = false;
    while (guard++ < 120) {
      st = await d.state();
      if (st.pendingChoice && st.pendingChoice.chosen == null) { sawChoice = true; break; }
      if (st.ended) { log(`提前结束 scene=${st.scene}`); break; }
      await clickAdvance();
      await sleep(50);
    }
    log(`到达选择=${sawChoice} scene=${st.scene}`);
    await d.screenshot('/tmp/v1_choice.png');

    if (sawChoice) {
      // 读取选项框并点击第一个（看看特效）——走真实命中路径
      const box = await d.evalJs('(function(){const b=window.engine.pendingChoice&&window.engine.pendingChoice.boxes;return b&&b[0]?{x:b[0].x+b[0].w/2,y:b[0].y+b[0].h/2}:null;})()');
      if (box) await d.evalJs(`window.engine.handleClick(${box.x},${box.y})`);
      else await d.evalJs('if(window.engine.pendingChoice)window.engine.pendingChoice.chosen=0;');

      // 等待雨（特效叠加层出现）
      for (let i = 0; i < 20; i++) { await sleep(120); st = await d.state(); if (st.overlays && st.overlays.length) break; }
      log(`进入特效 scene=${st.scene} overlays=${JSON.stringify(st.overlays)} active=${JSON.stringify(st.activeTasks)} ended=${st.ended}`);
      await d.screenshot('/tmp/v2_rain.png');

      // 模拟“点得太快”：反复点击推进，验证被 effect 阻塞、不会直接到结尾
      const before = st;
      for (let i = 0; i < 12; i++) { await clickAdvance(); await sleep(40); }
      st = await d.state();
      log(`快速点击后 ended=${st.ended} scene=${st.scene} overlays=${JSON.stringify(st.overlays)}`);
      await d.screenshot('/tmp/v3_afterspam.png');
      // effect 阻塞判定：快速点击不应让演出提前结束（应停留在 effect 播放阶段）
      const okBlock = !(st.ended === true && st.scene === 'scene_play');
      log(`[检查] effect 阻塞过快点击：${okBlock ? '通过' : '未通过'} (scene=${st.scene}, ended=${st.ended})`);
    }

    // 静音/音量
    await d.evalJs('window.engine.audio.ensure(); window.engine.toggleMute();');
    st = await d.state();
    log(`静音后 audio=${JSON.stringify(st.audio)}`);
    await d.evalJs('window.engine.toggleMute(); window.engine.setVolume(0.4);');
    st = await d.state();
    log(`恢复+音量0.4 audio=${JSON.stringify(st.audio)}`);
    const insp = await d.evalJs('document.getElementById("inspectContent").textContent.length');
    log(`检查器面板内容长度=${insp}`);
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
