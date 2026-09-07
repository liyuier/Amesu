# Amesu · 视觉小说演出引擎

> 一个为「演出效果 / 视频素材」而生的、基于 Web 前端(TypeScript)的视觉小说演出引擎。
> 你可能不是要做一个“能运行的游戏”，而是要一段**好看、可控、可复现的画面**——Amesu 把剧情编排成画面素材。

## 仓库内容（本仓库 = 引擎本体）

```
src/                 TypeScript 源码（esbuild 构建 → dist ESM）
  index.ts           公开导出 / 类型出口
  engine.ts          引擎核心类（生命周期/调度/交互/输出/检查器）
  types.ts           核心类型（Directive / Story / Project / Engine / Task …）
  util.ts            缓动/数学/时间
  story.ts           内容 builder + JSON 装载/归一
  placeholder.ts     默认素材（合成占位 + fallback）
  audio.ts           WebAudio（BGM 交叉淡化/主音量/静音）
tools/drive.mjs      CDP 自动化驱动（可自行操作演示页 / 验证）
package.json         npm run build / watch / typecheck
LICENSE              MIT
NOTICE               版权与 Librian(MPL-2.0) 归属声明
```

> `doc/`（设计/规格 + Librian 分析）与 `workspace/demo`（示例项目）在父项目 `/srv/dev/VisualNovelEngine` 下，**不在本 git 仓库内**。

## 快速开始

```bash
npm install
npm run build           # esbuild: src/index.ts -> dist/index.js
# 在父项目运行演示：
cd .. && node serve.js  # 绑定 0.0.0.0:11491
# 浏览器打开 http://<host>:11491/
```

页面上：开始/暂停/重播、速度、**交互/确定性**切换、录制 WebM、截图 PNG、**音量/静音**，以及一个可展开的**元素检查器**（查看引擎运行态每一层细节）。

> 调试入口：`?mode=deterministic&frame=<毫秒>` 确定性地渲染某一时刻；`?mode=interactive` 走交互回放。

## 为什么这样设计

- **双轨内容**：类型安全 TS/JS API + JSON(带 Schema)——既让 IDE 全程纠错，又让内容可序列化、可工具化。
- **确定性时间轴**：演出时钟与真实帧率解耦，预览=导出，稳定可复现（视频化核心）。
- **两种输出语义**：确定性导出（按预设速度、成片/素材）vs 交互录制（记录真实操作、演示）。
- **特效可跳过**：交互模式下单击即结束进行中的特效/打字机，不阻塞用户。
- **插件 + 预设**：高级能力做成插件（代码），常用效果做成预设（数据）。

架构灵感与合规：受 [Librian](https://github.com/RimoChan/Librian) (MPL-2.0, © RimoChan) 启发，详见 `NOTICE` 与父项目 `doc/Librian/`。

## 许可

MIT（见 LICENSE）。Librian 归属与合规见 NOTICE。
