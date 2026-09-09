# Amesu · 视觉小说演出引擎

> 一个基于 **Vite + Vue 3 + TypeScript** 的视觉小说演出引擎。它把一段“剧本”渲染成可控、可复现、可导出的画面（视频 / 帧序列），而非分发的游戏。

---

## 核心能力

- **确定性演出**：引擎按帧推进时序（移动 / 淡入淡出 / 交叉淡入 / 打字机 / 镜头 / 粒子），结果可复现、可导出。
- **三层动效归属**：**引擎**负责确定性补间；**主题**声明表现参数（时长 / 缓动 / 说话者如何呈现）；**呈现层**负责渲染（DOM / Canvas）。
- **双渲染器**：DOM（播放器，所见即所得）与 Canvas（`renderer.ts`，导出/截图）消费同一份 `SceneState`。
- **剧本双轨**：同一剧本可用 **JSON 数据**（`scenes/*.json`）或 **JS/TS API 脚本**（`story.scene(...).build()`）编写，二者等价。
- **完整指令**：背景交叉淡入、立绘出入场/移动/镜头排位、说话者明暗＋抖动、离场淡出、BGM/SFX 切换、选项分支、CG、HTML/视频叠加、相机、粒子/特效表、变量与跳转等。
- **模块化主题**：`theme` 声明字体/颜色/布局/素材/动效参数，可 `mergeTheme` 覆盖，一个项目一份配置。
- **插件与预设**：`createEngine({ plugins })` 扩展引擎；`presets` 提供可复用片段。
- **确定性导出**：Canvas 导出与 DOM 画面一致（含说话者明暗/尺寸）。

## 可视化编辑器

VSCode 式分栏：左侧活动条（素材 / 文件系统 / 检查器）+ 中央预览 + 底部**完整分支树**结点画布 + 右侧结点属性面板。

- **结点画布**：mermaid 自渲染，展示**全部场景**的分支树（顺序边 + choice 跳转边）、高亮当前步；点结点可在右侧编辑其 JSON、预览实时跳转。
- **素材面板**：按类型分组（图片/音频/视频），图片点击弹窗预览、视频居中弹窗播放、音频内联播放条；文件系统为 VSCode 式递归树。
- **双轨编辑**：JSON 剧本可直接编辑校验；脚本轨支持改文件即热重载（dev-server 监听 `.ts` → `/__reload` → 编辑器重开）。
- **控制栏**：播放/暂停、重播、**倍速**（对视频也生效）、交互/确定性模式、**音量滑条**、静音。
- **服务端 API**：`/api/fs/*` 自由浏览开发机目录、`/api/story` 转译脚本轨、`/api/save` 回写剧本、`/api/asset-list` 素材列表。

## 架构分层

| 层 | 职责 | 位置 |
|----|------|------|
| 引擎核心 | 调度 / 时钟 / 交互 / 状态 / 导出；框架无关、无 `any`、tsc 0 错误 | `src/engine/` |
| 播放器 | 将 `SceneState` 渲染为全 DOM | `src/components/Player.vue` |
| 呈现/导出 | Canvas 导出（与 DOM 一致） | `src/engine/render/` |
| 可视化编辑器 | 预览 + 控制 + 检查器 + 结点画布 + 剧本编辑 | `src/App.vue` + `src/components/` |
| 主题 | 表现参数/语义（字体、颜色、动效） | `src/engine/theme/` |

> 编辑器与播放器由 **Vue（`.vue` SFC）** 驱动；引擎逻辑收在 `src/engine/`，保持框架无关。

## 快速开始

```bash
npm install
npm run dev            # 编辑器 http://0.0.0.0:11491/（HMR）
npm run build          # vite build（编辑器）+ npm run lib（engine.js）
npm run typecheck      # tsc + vue-tsc
```

- 打开 `http://<host>:11491/` = 可视化编辑器；从“选择开发机目录”打开一个项目。
- 交付物 = **一个项目目录**（`config.json` + `scenes/` + `assets/`），由引擎 / 编辑器加载执行。

## 依赖

Vite · Vue 3 · TypeScript · `mermaid`（分支树自渲染）· `lucide-vue-next`（图标）· `vue-easy-lightbox`（图片大图）。

## 许可

MIT（见 LICENSE）。架构受 [Librian](https://github.com/RimoChan/Librian) (MPL-2.0, © RimoChan) 启发，合规见 NOTICE。
