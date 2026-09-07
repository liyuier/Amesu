// 项目加载器（服务端）：编辑器在【开发机】上运行，这里列出开发机上的项目目录并读取。
// 用户从下拉里选一个「开发环境项目」；服务端(Vite middleware)负责：列项目(/api/projects)、
// 读配置与剧本(/api/project)、转译脚本轨剧情(/api/story)、暴露素材(/api/asset/*)。
import { ref, type Ref } from 'vue';
import type { Project, Story } from '@engine';

export interface ProjectItem { name: string; track: 'json' | 'script'; }
export interface LoadedProject { project: Project; assetBase: string; }

export function useProject() {
  const projects: Ref<ProjectItem[]> = ref([]);
  const loaded: Ref<LoadedProject | null> = ref(null);
  const name = ref('');
  const error = ref('');

  async function loadProjects(): Promise<void> {
    error.value = '';
    try { const r = await fetch('/api/projects'); projects.value = (await r.json()) as ProjectItem[]; }
    catch (e) { error.value = '加载项目列表失败：' + ((e as Error).message || String(e)); }
  }

  async function openProject(name0: string): Promise<void> {
    error.value = '';
    try {
      const res = await fetch('/api/project?name=' + encodeURIComponent(name0));
      if (!res.ok) throw new Error('加载项目失败');
      const data = (await res.json()) as { name: string; track: 'json' | 'script'; meta: Record<string, unknown>; story?: Story; storyModule?: string; assetBase: string };
      let story: Story | null = null;
      if (data.track === 'script' && data.storyModule) story = (((await import(data.storyModule)) as { default?: Story }).default) ?? null;
      else if (data.story) story = data.story as Story;
      const meta = { ...data.meta, resolution: (data.meta as { resolution?: unknown }).resolution } as Record<string, unknown>;
      const project: Project = { meta, scripts: story ?? { meta, start: 'scene_start', scenes: {}, labels: {} }, characters: (meta as { characters?: unknown }).characters };
      loaded.value = { project, assetBase: data.assetBase };
      name.value = data.name;
    } catch (e) { error.value = '打开失败：' + ((e as Error).message || String(e)); }
  }

  return { projects, loaded, name, error, loadProjects, openProject };
}
