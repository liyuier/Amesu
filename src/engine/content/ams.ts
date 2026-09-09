/*
 * Amesu 剧本脚本（.ams.md）—— Markdown 解析器 → Story IR。
 * 语法：
 *   ---                            frontmatter → meta(start/res/title)
 *   ## scene_id                    场景（一个文件可多个场景）
 *   ```bg/bgm/video/...  yaml  指令（YAML 配置，语言名=指令名）
 *   @名称(status) [fenced 文本块]   人物：出场/移动/表情 + 对白(status 可空, 可引用特效预设)
 *   > 文本                          旁白
 *   *choice* + [文本](场景) 列表      分支
 *   ![name](path)                   背景(快捷写法; 选项仍可用 yaml 块)
 * 产物: Story = { meta, start, scenes }（引擎直接消费）
 */
type D = { type: string; [k: string]: unknown };
type Story = { meta: Record<string, unknown>; start: string; scenes: Record<string, D[]>; labels?: Record<string, string> };

function parseJsonOrYaml(lang: string, body: string): Record<string, unknown> {
  // 兼容 JSON / 简单 yaml(key: value, 数组) —— 用一行 key: value 结构
  const out: Record<string, unknown> = {};
  const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const m = line.match(/^([A-Za-z0-9_\-]+):\s*(.*)$/);
    if (!m) continue;
    let val: unknown = m[2];
    if (/^\[.*\]$/.test(m[2])) val = m[2].slice(1, -1).split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, ''));
    else if (/^(true|false)$/.test(m[2])) val = m[2] === 'true';
    else if (/^-?\d+(\.\d+)?$/.test(m[2])) val = Number(m[2]);
    else val = m[2].replace(/^['"]|['"]$/g, '');
    out[m[1]] = val;
  }
  return out;
}

export function parseAms(md: string): Story {
  const lines = md.split(/\r?\n/);
  const meta: Record<string, unknown> = {};
  let start = 'scene_start';
  const scenes: Record<string, D[]> = {};
  let cur: D[] | null = null;
  let i = 0, n = lines.length, sceneCnt = 0;

  // frontmatter
  if (lines[0]?.trim() === '---') { let j = 1; while (j < n && lines[j].trim() !== '---') { const m = lines[j].match(/^(\w+):\s*(.*)$/); if (m) meta[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, ''); j++; } i = j + 1; }
  if (typeof meta.start === 'string') start = meta.start;

  // 收集 fenced blocks 的工具
  const blockAt = (k: number): { lang: string; body: string; end: number } | null => {
    const t = lines[k].trim();
    if (!t.startsWith('```')) return null;
    const lang = t.slice(3).trim();
    const body: string[] = []; let e = k + 1; while (e < n && !lines[e].trim().startsWith('```')) { body.push(lines[e]); e++; }
    return { lang, body: body.join('\n'), end: e };
  };

  for (; i < n; i++) {
    const t = lines[i].trim();
    if (!t) continue;
    if (t.startsWith('## ')) { const name = t.slice(3).trim(); cur = scenes[name] = []; sceneCnt++; continue; }
    if (t.startsWith('```')) {
      const b = blockAt(i); if (!b) continue;
      const cfg = parseJsonOrYaml(b.lang, b.body);
      if (b.lang && ['bg','cg','bgm','sfx','voice','video','shot','effect','camera','wait','hide','move','tween'].includes(b.lang)) cur?.push({ type: b.lang, ...cfg });
      i = b.end; continue;
    }
    if (t.startsWith('![')) { const m = t.match(/^!\[([^\]]*)\]\(([^)]+)\)/); if (m && cur) { cur.push({ type: 'bg', src: m[2], }); } continue; }
    if (t.startsWith('> ')) { if (cur) cur.push({ type: 'say', who: '', text: t.slice(2), typewriter: 40 }); continue; }
    if (t.startsWith('*choice*') || t.startsWith('* 选择*')) { const opts: { text: string; jump: string }[] = []; let k = i + 1; while (k < n) { const l = lines[k].trim(); const m = l.match(/^- \[([^\]]+)\]\(([^)]+)\)/); if (m) opts.push({ text: m[1], jump: m[2] }); else break; k++; } if (cur && opts.length) cur.push({ type: 'choice', options: opts }); i = k - 1; continue; }
    if (t.startsWith('@')) { const m = t.match(/^@([A-Za-z0-9_]+)(?:\(([^)]*)\))?\s*$/); if (m) { const id = m[1]; const status = m[2] || undefined; const nb = blockAt(i + 1); if (cur) cur.push({ type: 'char', id, ...(status ? { status } : {}) }); if (nb && (nb.lang === '' || nb.lang === 'text' || nb.lang === '台词')) { if (cur) cur.push({ type: 'say', who: id, text: nb.body, typewriter: 40 }); i = nb.end; } } continue; }
  }
  if (!sceneCnt) scenes[start] = scenes[start] || [];
  const first = Object.keys(scenes)[0] || start;
  return { meta, start: typeof meta.start === 'string' ? meta.start : (start || first), scenes };
}
