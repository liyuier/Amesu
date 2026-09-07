// 项目加载器：让用户【选择本地目录】作为工作目录。
// 兼容性：优先用 File System Access API（仅安全上下文 HTTPS/localhost）；否则用 <input type=file webkitdirectory>（任何上下文、含内网 HTTP）。
// 读取 config.json + scenes/*.json + assets/**，build 出可被引擎消费的 Project + resolveAsset(objectURL)。
import { ref, type Ref } from 'vue';
import type { Project, Story } from '@engine';

export interface LoadedProject { project: Project; assetMap: Record<string, string>; resolveAsset: (src: string) => string; }

// —— 最小化 FileSystem 句柄类型（避免 any）——
interface FSEntity { kind: 'file' | 'directory'; name: string; }
interface FSFile extends FSEntity { getFile(): Promise<File>; }
interface FSDir extends FSEntity { values(): AsyncIterableIterator<FSEntity>; getFileHandle(n: string): Promise<FSFile>; getDirectoryHandle(n: string): Promise<FSDir>; }

function relPath(f: File): string {
  // webkitRelativePath 形如 '我的项目/scenes/demo.json' -> 去掉首段根目录
  const p = f.webkitRelativePath || f.name;
  const parts = p.split('/');
  return parts.length > 1 ? parts.slice(1).join('/') : p;
}

export function useProject() {
  const loaded: Ref<LoadedProject | null> = ref(null);
  const name = ref('');
  const error = ref('');

  // —— 方式 A：file input（任何上下文，通用）——
  async function openFromFiles(files: FileList | null): Promise<void> {
    error.value = '';
    if (!files || !files.length) { error.value = '没有选择文件。'; return; }
    const list = Array.from(files);
    name.value = list[0].webkitRelativePath.split('/')[0] || '项目';
    const byRel: Record<string, File> = {};
    for (const f of list) byRel[relPath(f)] = f;
    try {
      const cfg = byRel['config.json']; if (!cfg) throw new Error('目录内缺少 config.json');
      const config = JSON.parse(await cfg.text());
      const sceneFiles = Object.entries(byRel)
        .filter(([k]) => k.startsWith('scenes/') && k.endsWith('.json'))
        .map(([, f]) => f);
      let story: Story | null = null;
      const whole = sceneFiles.find((f) => /scenes\/(demo|story)\.json$/.test(relPath(f)));
      if (whole) story = JSON.parse(await whole.text()) as Story;
      else {
        const m: Record<string, unknown[]> = {};
        for (const f of sceneFiles) {
          const data = JSON.parse(await f.text()) as Partial<Story> & { scenes?: Record<string, unknown[]>; [k: string]: unknown };
          const nm = f.name.replace(/\.json$/, '');
          Object.assign(m, (data.scenes ?? { [nm]: [] }) as Record<string, unknown[]>);
        }
        story = { meta: config, start: 'scene_start', scenes: m, labels: {} };
      }
      const assetMap: Record<string, string> = {};
      for (const [k, f] of Object.entries(byRel)) if (k.startsWith('assets/')) assetMap[k.slice(7)] = URL.createObjectURL(f);
      const project: Project = { meta: { ...config, resolution: (config as { resolution?: unknown }).resolution }, scripts: story ?? { meta: config, start: 'scene_start', scenes: {}, labels: {} }, characters: (config as { characters?: unknown }).characters };
      loaded.value = { project, assetMap, resolveAsset: (src) => assetMap[src] ?? '' };
    } catch (e) { error.value = '读取工作目录失败：' + ((e as Error).message || String(e)); }
  }

  // —— 方式 B：File System Access API（仅安全上下文）——
  async function openViaHandle(dir: FSDir): Promise<void> {
    name.value = dir.name;
    const readText = async (d: FSDir, n: string) => (await (await d.getFileHandle(n)).getFile()).text();
    const walkAssets = async (d: FSDir, rel: string, map: Record<string, string>): Promise<void> => {
      for await (const ent of d.values()) {
        if (ent.kind === 'directory') await walkAssets(ent as FSDir, rel + ent.name + '/', map);
        else if (ent.kind === 'file') map[rel + ent.name] = URL.createObjectURL(await (ent as FSFile).getFile());
      }
    };
    const config = JSON.parse(await readText(dir, 'config.json'));
    let story: Story | null = null;
    let scenesDir: FSDir | null = null;
    try { scenesDir = await dir.getDirectoryHandle('scenes'); } catch { /* 无 scenes 目录 */ }
    if (scenesDir) {
      const fs: string[] = [];
      for await (const e of scenesDir.values()) if (e.kind === 'file' && e.name.endsWith('.json')) fs.push(e.name);
      const whole = fs.find((f) => f === 'demo.json' || f === 'story.json');
      if (whole) story = JSON.parse(await readText(scenesDir, whole)) as Story;
      else { const m: Record<string, unknown[]> = {}; for (const n of fs) Object.assign(m, ((JSON.parse(await readText(scenesDir, n)) as Partial<Story>).scenes ?? { [n.replace(/\.json$/, '')]: [] })); story = { meta: config, start: 'scene_start', scenes: m, labels: {} }; }
    }
    const assetMap: Record<string, string> = {};
    try { await walkAssets(await dir.getDirectoryHandle('assets'), '', assetMap); } catch { /* 无 assets */ }
    const project: Project = { meta: { ...config, resolution: (config as { resolution?: unknown }).resolution }, scripts: story ?? { meta: config, start: 'scene_start', scenes: {}, labels: {} }, characters: (config as { characters?: unknown }).characters };
    loaded.value = { project, assetMap, resolveAsset: (src) => assetMap[src] ?? '' };
  }

  // —— 入口：安全上下文且有 API 则用目录选择；否则触发 file input（App 里绑定的隐藏 input）——
  function openDir(): void {
    error.value = '';
    const w = window as unknown as { isSecureContext?: boolean; showDirectoryPicker?: () => Promise<FSDir> };
    if (w.isSecureContext && w.showDirectoryPicker) {
      w.showDirectoryPicker().then(openViaHandle).catch(() => { /* 用户取消 */ });
    } else {
      const input = document.getElementById('dir-input') as HTMLInputElement | null;
      if (input) input.click(); else error.value = '未找到目录选择入口。';
    }
  }

  return { loaded, name, error, openDir, openFromFiles };
}
