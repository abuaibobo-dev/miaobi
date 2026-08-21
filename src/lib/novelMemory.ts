function uid(): string { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
import type { NovelProject, Chapter, Character, CharacterDiff, Foreshadowing, MemoryChunk, MemorySnapshot } from '../types/novel';
import * as Store from './storage';

// ============================================================
// 六层记忆系统核心
// ============================================================

// L5: 全书设定
export async function getStoryBible(novelId: string): Promise<NovelProject | null> {
  const novels = await Store.getNovels();
  return novels.find(n => n.id === novelId) || null;
}

export async function createNovel(title: string, genre: string, synopsis: string, styleGuide: string = ''): Promise<NovelProject> {
  const novel: NovelProject = {
    id: uid(),
    title,
    genre,
    synopsis,
    styleGuide,
    totalVolumes: 1,
    currentVolume: 1,
    totalChapters: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await Store.saveNovel(novel);
  return novel;
}

export async function updateNovelBible(novelId: string, updates: Partial<NovelProject>): Promise<void> {
  const novels = await Store.getNovels();
  const idx = novels.findIndex(n => n.id === novelId);
  if (idx < 0) return;
  Object.assign(novels[idx], updates, { updatedAt: new Date().toISOString() });
  await Store.saveNovel(novels[idx]);
}

// ============================================================
// L0 + L1: 章节正文 + 单章摘要
// ============================================================

export async function addChapter(
  novelId: string,
  title: string,
  body: string,
  summary: string = ''
): Promise<Chapter> {
  const novel = await getStoryBible(novelId);
  const chNum = (novel?.totalChapters || 0) + 1;
  const volNum = novel?.currentVolume || 1;
  const chapter: Chapter = {
    id: uid(),
    novelId,
    volumeNumber: volNum,
    chapterNumber: chNum,
    title: title || `第${chNum}章`,
    body,
    summary,
    status: 'completed',
    wordCount: body.length,
    createdAt: new Date().toISOString(),
  };
  await Store.saveChapter(chapter);
  // 更新小说进度
  if (novel) {
    await updateNovelBible(novelId, { totalChapters: chNum, currentVolume: volNum });
  }
  return chapter;
}

export async function updateChapterSummary(chapterId: string, novelId: string, summary: string): Promise<void> {
  const chapters = await Store.getChapters(novelId);
  const idx = chapters.findIndex(c => c.id === chapterId);
  if (idx >= 0) {
    chapters[idx].summary = summary;
    await Store.saveChapter(chapters[idx]);
  }
}

// ============================================================
// 角色管理（Diff 机制）
// ============================================================

export async function upsertCharacter(
  novelId: string,
  name: string,
  traits: string,
  backstory: string,
  currentState: string,
  chapterNumber: number,
  dialogueStyle?: string
): Promise<Character> {
  const chars = await Store.getCharacters(novelId);
  const existing = chars.find(c => c.name === name);
  if (existing) {
    existing.traits = traits || existing.traits;
    existing.backstory = backstory || existing.backstory;
    existing.currentState = currentState || existing.currentState;
    if (dialogueStyle) existing.dialogueStyle = dialogueStyle;
    existing.lastAppearance = Math.max(existing.lastAppearance, chapterNumber);
    existing.updatedAt = new Date().toISOString();
    await Store.saveCharacter(existing);
    return existing;
  }
  const char: Character = {
    id: uid(),
    novelId,
    name,
    traits,
    backstory,
    currentState,
    dialogueStyle: dialogueStyle || '',
    firstAppearance: chapterNumber,
    lastAppearance: chapterNumber,
    status: 'active',
    updatedAt: new Date().toISOString(),
  };
  await Store.saveCharacter(char);
  return char;
}

export async function getActiveCharacters(novelId: string): Promise<Character[]> {
  const chars = await Store.getCharacters(novelId);
  return chars.filter(c => c.status === 'active');
}

// ============================================================
// 伏笔流转
// ============================================================

export async function addForeshadowing(
  novelId: string,
  title: string,
  description: string,
  chapterNumber: number,
  relatedCharacters: string[] = []
): Promise<Foreshadowing> {
  const fs: Foreshadowing = {
    id: uid(),
    novelId,
    title,
    description,
    plantedChapter: chapterNumber,
    resolvedChapter: null,
    status: 'planted',
    relatedCharacters,
    createdAt: new Date().toISOString(),
  };
  await Store.saveForeshadowing(fs);
  return fs;
}

export async function advanceForeshadowing(
  novelId: string,
  fsId: string,
  newStatus: Foreshadowing['status'],
  resolvedChapter?: number
): Promise<void> {
  const list = await Store.getForeshadowing(novelId);
  const idx = list.findIndex(f => f.id === fsId);
  if (idx < 0) return;
  list[idx].status = newStatus;
  if (resolvedChapter !== undefined) list[idx].resolvedChapter = resolvedChapter;
  await Store.saveForeshadowing(list[idx]);
}

export async function getActiveForeshadowing(novelId: string): Promise<Foreshadowing[]> {
  const list = await Store.getForeshadowing(novelId);
  return list.filter(f => f.status !== 'resolved' && f.status !== 'abandoned');
}

// ============================================================
// ★ 写前组装协议 — 六层上下文
// ============================================================

export async function assembleNovelContext(novelId: string, nextChapterNumber: number): Promise<string> {
  const parts: string[] = [];
  const novel = await getStoryBible(novelId);
  if (!novel) return '';

  // 1. L5: 全书设定
  parts.push(`📖 全书设定\n书名：${novel.title}\n类型：${novel.genre}\n简介：${novel.synopsis}\n风格：${novel.styleGuide || '未设定'}\n当前进度：第${novel.totalChapters}章 / 第${novel.currentVolume}卷`);

  // 2. L1: 最近 3-5 章摘要
  const recent = await Store.getRecentChapters(novelId, 5);
  if (recent.length > 0) {
    const summaryText = recent.filter(c => c.summary).map(c => `第${c.chapterNumber}章「${c.title}」: ${c.summary}`).join('\n');
    if (summaryText) parts.push(`📝 最近章节摘要\n${summaryText}`);
  }

  // 3. 上一章结尾
  if (recent.length > 0) {
    const last = recent[recent.length - 1];
    if (last.body) {
      parts.push(`🔚 上一章结尾（第${last.chapterNumber}章）\n${last.body.slice(-600)}`);
    }
  }

  // 4. 角色状态
  const chars = await getActiveCharacters(novelId);
  if (chars.length > 0) {
    const charText = chars.map(c => `- ${c.name}：${c.traits} | 当前：${c.currentState}`).join('\n');
    parts.push(`👥 出场角色\n${charText}`);
  }

  // 5. 活跃伏笔
  const fs = await getActiveForeshadowing(novelId);
  if (fs.length > 0) {
    const emoji: Record<string, string> = { planted: '🌱', developing: '🌿', resolving: '🔄' };
    const fsText = fs.map(f => `${emoji[f.status] || '❓'} ${f.title} [${f.status}]：${f.description}（第${f.plantedChapter}章）`).join('\n');
    parts.push(`🔮 活跃伏笔\n${fsText}`);
  }

  return parts.join('\n\n---\n\n');
}

// ============================================================
// ★ 生成 system prompt
// ============================================================

export async function buildSystemPrompt(novelId: string, nextChapterNumber: number, localModel = false): Promise<string> {
  const { WRITING_BIBLE } = await import('./writingGuide');
  const ctx = await assembleNovelContext(novelId, nextChapterNumber);
  return `你是一个专业的创意写作助手，服务于小说创作项目。

${WRITING_BIBLE}

每章目标字数：${localModel ? '900-1300字（手机本地模型限制，不要少于800字）' : '5000字左右（4500-5500字均可），不要少于4000字'}，写够就停。

核心规则：
1. 不要重复已写内容
2. 角色设定已冻结，不擅自修改
3. 伏笔必须回收
4. 保持文风一致
5. 每章结束后输出 JSON 更新指令

【对话规则】
- 每个角色的说话方式必须不同：用口癖、句式、语气词、用词习惯区分
- 角色 A 说话简短直接，角色 B 说话绕弯含蓄——这才是好对话
- 不要用"他说""她说"开头，用动作/表情/语气标签代替
- 对话中穿插微动作：端起杯子、转头看窗外、手指敲桌子
- 争吵场景用短句+打断，温情场景用长句+沉默

【创作纪律 — 极其重要】
- 绝对不要复读用户给出的关键词或提示词。用户说"月光"，你不要整段写月光。关键词只是灵感种子，不是内容本身。
- 每章必须引入至少2个全新元素：新场景、新角色、新物件、新冲突、新伏笔，不能只围绕已有内容打转。
- 情节必须有推进：每章结束时，故事状态必须和开头不同。如果删掉这一章不影响后续，说明这章没有存在价值。
- 对话不能千篇一律：不同角色说话方式必须不同，不能所有人说话风格一样。
- 禁止水字数：不要用大段环境描写凑字数，每一段环境描写都必须推动情节或暗示伏笔。
- 写到第3章以后，必须开始埋冲突和转折，不能一直平淡叙述。

【输出格式 — 严格遵守】
每次写完一章，输出必须包含三个部分，按顺序排列：

1. 【本章大纲】
在最开头输出本章大纲（100-200字），概括本章核心事件、角色发展、冲突转折。
格式：以"【本章大纲】"开头，后面跟大纲内容。

2. 正文
大纲之后空一行，直接写正文内容（${localModel ? '900-1300字' : '5000字左右'}）。

3. 【下一章预告】
正文写完后，输出下一章预告（100-150字），预告下一章的核心冲突、悬念、角色动向。
格式：以"【下一章预告】"开头，后面跟预告内容。
预告要有吸引力，让读者想继续看。

4. JSON 更新（保留）
预告之后，仍然输出 JSON 代码块用于数据追踪（summary/characterChanges/foreshadowing等）。

【重要】每章写完后，必须在最后输出一个完整的 JSON 代码块，格式必须严格如下（不要省略任何括号或逗号）：
\`\`\`json
{
  "summary": "本章200-400字内容摘要",
  "characterChanges": [
    {"name": "角色名", "field": "state", "oldValue": "变化前", "newValue": "变化后"}
  ],
  "newForeshadowing": [
    {"title": "伏笔标题", "description": "伏笔内容"}
  ],
  "resolvedForeshadowing": [],
  "nextChapterHint": "下一章建议方向"
}
\`\`\`
注意：JSON 必须以 { 开头，} 结尾，每个字段都要有值，不能省略。

---

${ctx || '全新开始，等待用户输入灵感。'}`;
}

export async function processPostWrite(
  novelId: string,
  chapterNumber: number,
  summary: string,
  characterChanges: Array<{ name: string; field: string; oldValue: string; newValue: string }>,
  newForeshadowing: Array<{ title: string; description: string }>,
  resolvedForeshadowing: string[]
): Promise<void> {
  // 更新摘要
  const chapters = await Store.getChapters(novelId);
  const ch = chapters.find(c => c.chapterNumber === chapterNumber);
  if (ch && summary) {
    ch.summary = summary;
    await Store.saveChapter(ch);
  }

  // 角色变化
  for (const change of characterChanges) {
    await upsertCharacter(novelId, change.name, '', '', change.newValue, chapterNumber);
  }

  // 新伏笔
  for (const fs of newForeshadowing) {
    await addForeshadowing(novelId, fs.title, fs.description, chapterNumber);
  }

  // 流转伏笔
  const allFs = await Store.getForeshadowing(novelId);
  for (const fsTitle of resolvedForeshadowing) {
    const found = allFs.find(f => f.title === fsTitle);
    if (found) {
      await advanceForeshadowing(novelId, found.id, 'resolved', chapterNumber);
    }
  }

  // 冻结 L1
  const chunk: MemoryChunk = {
    id: uid(),
    novelId,
    layer: 'L1',
    chapterFrom: chapterNumber,
    chapterTo: chapterNumber,
    volumeNumber: 1,
    content: summary,
    frozen: true,
    createdAt: new Date().toISOString(),
  };
  await Store.saveMemoryChunk(chunk);
}
