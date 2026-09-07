# Amesu · 视觉小说演出引擎

> 一个原生 **Vite + Vue 3 + TypeScript** 的视觉小说演出引擎。可能你不是要做一个“游戏”，而是要一段**好看、可控、可复现的画面**。

## 架构分层（三件事，别混）

| 层 | 是什么 | 在哪 |
|----|--------|------|
| **引擎核心** | 调度/时钟/交互/状态/导出；框架无关、强类型、无 `any` | `src/engine/`（core/commands/render/types/content/platform） |
| **播放器** | 把 `SceneState` 渲染成【全 DOM】（交付物画面，可 F12 逐项检查） | `src/components/Player.vue`（Vue 第一公民） |
| **可视化编辑器** | 预览 + 控制栏 + 元素检查器 + 场景编辑（外部工具，**原生 Vue**） | `index.html` + `src/App.vue` + `src/components/*.vue` |
| **交付物项目** | 仅静态项目数据（=“游戏存档”，由引擎/编辑器加载执行） | `workspace/demo/`（config/scenes/assets） |

> 编辑器完全由 **Vue（.vue SFC）** 驱动；引擎逻辑收在 `src/engine/` 子模块；**剧本支持 JS/TS 脚本与 JSON 双轨**。

## 仓库内容（引擎 + 编辑器）

```
index.html             编辑器页（Vite 入口，服务在端口根）
vite.config.ts         Vite + @vitejs/plugin-vue；publicDir 暴露交付物 /demo
src/
  main.ts              Vue 入口（createApp(App)）
  App.vue              编辑器布局（左面板 + 右预览）
  components/Player.vue 播放器（SceneState → 全 DOM）
  components/Toolbar.vue 控制栏
  components/Inspector.vue 元素检查器
  story.demo.ts        用「类型安全 JS/TS API」定义剧本的示例（与 JSON 双轨）
  style.css            编辑器 + 播放器样式
  engine/              引擎库（框架无关、无 any、tsc 0 错误）
    index.ts           引擎导出；core/、commands/、render/、types/、content/、platform/ 子目录
tools/drive.ts         CDP 自动化驱动；tools/dev-server.ts（静态+SSE 热重载+编辑器页）
dist/                  vite build → app/ ；npm run lib → engine.js
LICENSE / NOTICE / package.json / tsconfig.json
```

> `doc/` 与 `workspace/demo`（交付物项目）在父项目 `/srv/dev/VisualNovelEngine` 下，**不在本 git 仓库内**。

## 快速开始

```bash
npm install
npm run dev            # Vite dev：编辑器服务在 http://0.0.0.0:11491/（HMR 热重载）
npm run build          # vite build（编辑器）+ npm run lib（engine.js）
npm run typecheck      # 引擎库 tsc（编辑器 .vue 用 vue-tsc）
```

- 打开 `http://<host>:11491/` = **可视化编辑器**（预览播放器 `/demo` 项目）。
- 交付物项目数据在 `/demo/*`（config/scenes/assets），静态；改它 → Vite HMR 即时刷新。

## 为什么这样设计

- **Vue 是第一公民**：编辑器与播放器都是 `.vue` SFC；引擎保持框架无关、强类型（无 `any`）。
- **双轨剧本**：JS/TS 脚本（`story.demo.ts`）与 JSON（`demo.json`）等价，`createEngine` 均可消费。
- **状态即快照**：引擎产出类型化 `SceneState`，DOM(播放器) 渲染、Canvas(renderer) 导出。
- **特效可跳过 / 双渲染器 / 热重载**：交互、导出、开发体验兼顾。
- 架构灵感与合规：受 [Librian](https://github.com/RimoChan/Librian) (MPL-2.0, © RimoChan) 启发，详见 `NOTICE`。

## 许可

MIT（见 LICENSE）。Librian 归属与合规见 NOTICE。
