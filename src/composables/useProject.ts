// 项目加载器：让用户【选择本地目录】作为工作目录（File System Access API）。
// 读取 config.json + scenes/*.json + assets/，build 出可被引擎消费的 Project + resolveAsset。
import { ref, type Ref } from 'vue';
import type { Project, Story } from '@engine';

// —— 最小化的 FileSystem 句柄类型（避免 any）——
interface FSHandle { kind: 'file' | 'directory'; name: string; }
interface FSFileHandle extends FSHandle { getFile(): Promise<File>; }
interface FSDirHandle extends FSHandle { values(): AsyncIterableIterator<FSHandle>; getFileHandle(n: string): Promise<FSFileHandle>; getDirectoryHandle(n: string): Promise<FSDirHandle>; }

export interface LoadedProject { project: Project; assetMap: Record<string, string>; resolveAsset: (src: string) => string; }

async function readText(dir: FSDirHandle, name: string): Promise<string> {
  const fh = await dir.getFileHandle(name); return await (await fh.getFile()).text();
}
async function walkAssets(dir: FSDirHandle, rel: string, map: Record<string, string>): Promise<void> {
  for await (const ent of dir.values()) {
    if (ent.kind === 'directory') await walkAssets(ent as FSDirHandle, rel + ent.name + '/', map);
    else if (ent.kind === 'file') { map[rel + ent.name] = URL.createObjectURL(await (ent as FSFileHandle).getFile()); }
  }
}

export function useProject() {
  const loaded: Ref<LoadedProject | null> = ref(null);
  const name = ref('');
  const error = ref('');

  async function openDir(): Promise<void> {
    error.value = '';
    const w = window as unknown as { showDirectoryPicker?: () => Promise<FSDirHandle> };
    if (!w.showDirectoryPicker) { error.value = '需要基于 Chromium 的浏览器（File System Access API）才能选择目录。'; return; }
    try {
      const dir = await w.showDirectoryPicker();
      const config = JSON.parse(await readText(dir, 'config.json'));

      // 剧本：优先读取一个「整份 Story」文件（demo.json / story.json），否则把 scenes/*.json 合并为场景
      let story: Story | null = null;
      let scenesDir: FSDirHandle | null = null;
      try { scenesDir = await dir.getDirectoryHandle('scenes'); } catch { /* 无 scenes 目录 */ }
      if (scenesDir) {
        const files: string[] = [];
        for await (const ent of scenesDir.values()) if (ent.kind === 'file' && ent.name.endsWith('.json')) files.push(ent.name);
        const whole = files.find((f) => f === 'demo.json' || f === 'story.json');
        if (whole) story = JSON.parse(await readText(scenesDir, whole)) as Story;
        else {
          const scenes: Record<string, unknown[]> = {};
          const hasStart = files.some((f) => f === 'scene_start.json');
          for (const n of files) {
            const data = JSON.parse(await readText(scenesDir, n)) as Partial<Story> & Record<string, unknown>;
            const sos = (data.scenes ?? { [n.replace('.json', '')]: [] }) as Record<string, unknown[]>;
            Object.assign(scenes, sos);
          }
          story = { meta: config, start: hasStart ? 'scene_start' : 'scene_start', scenes, labels: {} };
        }
      }

      const assetMap: Record<string, string> = {};
      try { await walkAssets(await dir.getDirectoryHandle('assets'), '', assetMap); } catch { /* 无 assets 目录 */ }

      const project: Project = {
        meta: { ...config, resolution: config.resolution },
        scripts: story ?? { meta: config, start: 'scene_start', scenes: {}, labels: {} },
        characters: config.characters,
      };
      loaded.value = { project, assetMap, resolveAsset: (src) => assetMap[src] ?? '' };
      name.value = dir.name;
    } catch (e) { error.value = '打开工作目录失败：' + ((e as Error).message || String(e)); }
  }

  return { loaded, name, error, openDir };
}
