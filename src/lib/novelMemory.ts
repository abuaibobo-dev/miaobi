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
  const chapters = await Store.getChapters(novelId);
  const chNum = Math.max(chapters.length, ...chapters.map(item => item.chapterNumber), novel?.totalChapters || 0) + 1;
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
    await updateNovelBible(novelId, { totalChapters: Math.max(chNum, novel.totalChapters || 0), currentVolume: volNum });
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
  const cleanTitle = title.trim();
  const existing = (await Store.getForeshadowing(novelId)).find(item => item.title.trim() === cleanTitle);
  if (existing) return existing;
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
  const novel = await getStoryBible(novelId);
  if (!novel) return '你是专业中文小说写作助手。';

  if (localModel) {
    const recent = (await Store.getRecentChapters(novelId, 2)).filter(item => item.summary);
    const context = recent.map(item => `第${item.chapterNumber}章：${item.summary}`).join('\n');
    return `你是手机本地小说写作助手。用简体中文续写，不要解释写作规则。
书名：${novel.title}；类型：${novel.genre}
简介：${(novel.synopsis || '').slice(0, 500)}
风格：${(novel.styleGuide || '自然、细腻').slice(0, 200)}
${context ? `最近剧情：\n${context.slice(0, 1200)}` : ''}

本次写第${nextChapterNumber}章，目标900-1300字。要求：
1. 直接推进新事件，不重复旧剧情。
2. 对话简短自然，描写具体，不堆砌形容词。
3. 输出顺序：先【本章大纲】80字以内；空一行写正文900-1300字；最后【下一章预告】80字以内。
4. 本地模式不要输出 JSON。`;
  }

  const { WRITING_BIBLE } = await import('./writingGuide');
  const ctx = await assembleNovelContext(novelId, nextChapterNumber);
  return `你是一个专业的创意写作助手，服务于小说创作项目。

${WRITING_BIBLE}

每章目标字数：5000字左右（4500-5500字均可），不要少于4000字，写够就停。
当前进度：第${nextChapterNumber - 1}章已完成，现在处理第${nextChapterNumber}章。
上下文记忆：
${ctx || '全新开始'}

核心规则：不重复已写内容；角色设定冻结；伏笔必须回收；文风一致；情节必须推进。
输出顺序：【本章大纲】100-200字 → 正文5000字左右 → 【下一章预告】100-150字 → JSON 更新代码块。`;
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
