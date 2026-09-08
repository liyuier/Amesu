// 项目加载器（服务端）：编辑器在【开发机】上运行，用户通过【服务端目录浏览器】自由选择目录。
// 服务端(Vite middleware)：/api/fs/list 列目录、/api/project 读项目、/api/story 转译脚本轨、/api/asset 暴露素材。
import { ref, type Ref } from 'vue';
import type { Project, Story, CharacterDef } from '@engine';

export interface LoadedProject { project: Project; assetBase: string; }

export function useProject() {
  const loaded: Ref<LoadedProject | null> = ref(null);
  const name = ref('');
  const error = ref('');

  async function openProject(path: string): Promise<void> {
    error.value = '';
    try {
      const res = await fetch('/api/project?path=' + encodeURIComponent(path));
      if (!res.ok) throw new Error((await res.text()) || '加载项目失败');
      const data = (await res.json()) as { path: string; track: 'json' | 'script'; meta: Record<string, unknown>; story?: Story; storyModule?: string; assetBase: string };
      let story: Story | null = null;
      if (data.track === 'script' && data.storyModule) story = (((await import(data.storyModule)) as { default?: Story }).default) ?? null;
      else if (data.story) story = data.story as Story;
      const meta = { ...data.meta, resolution: (data.meta as { resolution?: unknown }).resolution } as Record<string, unknown>;
      const project: Project = { meta, scripts: story ?? { meta, start: 'scene_start', scenes: {}, labels: {} }, characters: ((meta as { characters?: Record<string, CharacterDef> }).characters) ?? {} };
      loaded.value = { project, assetBase: data.assetBase };
      name.value = data.path;
    } catch (e) { error.value = '打开失败：' + ((e as Error).message || String(e)); }
  }

  return { loaded, name, error, openProject };
}
