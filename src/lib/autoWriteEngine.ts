/**
 * 全自动写小说工作流引擎（多智能体协同架构）
 * 
 * 参考 NovelScribe / AutoNovel / ElyHa 的设计理念：
 * - 多智能体分工：规划师 → 作家 → 编辑 → 连续性检查员
 * - 一键自主写作：用户只需输入灵感，AI自动完成全部流程
 * - 超长篇支持：分卷架构，每卷独立管理
 * - 节点式剧情：关键转折点标记，保证情节连贯
 */

import { chatCompletion, type LLMMessage } from './llm';
import {
  addChapter,
  getStoryBible,
  assembleNovelContext,
} from './novelMemory';
import {
  getChapters,
  getCharacters,
  getForeshadowing,
  saveChapter,
} from './storage';

// ============================================================
// 类型定义
// ============================================================

export interface Outline {
  title: string;
  genre: string;
  totalVolumes: number;
  totalChapters: number;
  themes: string[];
  worldSetting: string;
  chapterOutlines: ChapterOutline[];
}

export interface ChapterOutline {
  chapterNumber: number;
  volumeNumber: number;
  title: string;
  summary: string;
  keyEvents: string[];
  characters: string[];
  foreshadowing: string[];
  emotionalTone: string;
  turningPoint: string;      // 本章转折点
}

export interface ReviewResult {
  score: number;
  issues: string[];
  suggestions: string[];
}

export interface AutoWriteProgress {
  phase: 'outline' | 'writing' | 'reviewing' | 'continuity' | 'complete';
  currentChapter: number;
  totalChapters: number;
  currentVolume: number;
  chapterTitle: string;
  chapterProgress: number;
  overallProgress: number;
  status: string;
  agentLog: AgentLogEntry[];
  errors: string[];
}

export interface AgentLogEntry {
  agent: string;
  action: string;
  timestamp: string;
}

export interface AutoWriteCallbacks {
  onProgress?: (progress: AutoWriteProgress) => void;
  onChapterComplete?: (chapterNumber: number, title: string) => void;
  onReviewComplete?: (chapterNumber: number, score: number) => void;
  onAgentLog?: (agent: string, action: string) => void;
  onError?: (error: string) => void;
}

// ============================================================
// 智能体 1：规划师 Agent — 生成大纲
// ============================================================

export async function plannerAgent(
  novelId: string,
  userPrompt: string,
  callbacks?: AutoWriteCallbacks
): Promise<Outline | string> {
  const log = (action: string) => {
    callbacks?.onAgentLog?.('📋 规划师', action);
    callbacks?.onProgress?.({
      phase: 'outline',
      currentChapter: 0,
      totalChapters: 0,
      currentVolume: 1,
      chapterTitle: '',
      chapterProgress: 0,
      overallProgress: 0,
      status: action,
      agentLog: [],
      errors: [],
    });
  };

  log('正在分析用户灵感...');

  const novel = await getStoryBible(novelId);
  const systemPrompt = `你是一位专业的小说策划编辑（规划师Agent），擅长构建引人入胜的故事大纲。

你的任务是根据用户的灵感/设定，生成一份完整的小说大纲。

大纲要求：
1. 总章节数 15-50 章（支持多卷架构）
2. 每卷 10-15 章，每卷有独立的小高潮和卷终悬念
3. 每章有：标题、摘要、关键事件、出场角色、伏笔、情绪基调、转折点
4. 角色要有清晰的成长弧线，不能扁平化
5. 伏笔要前后呼应，不能有遗漏
6. 情绪起伏：每 3-5 章一个小高潮，每卷末一个大高潮
7. 章节间必须有递进关系，不能原地踏步
8. 标记出关键转折点（Plot Points），这些是故事走向改变的地方

输出格式（严格 JSON）：
{
  "title": "小说标题",
  "genre": "类型",
  "totalVolumes": 3,
  "totalChapters": 30,
  "themes": ["主题1", "主题2"],
  "worldSetting": "世界观设定（150-250字）",
  "chapterOutlines": [
    {
      "chapterNumber": 1,
      "volumeNumber": 1,
      "title": "章节标题",
      "summary": "本章要写什么（100-150字）",
      "keyEvents": ["事件1", "事件2"],
      "characters": ["角色1", "角色2"],
      "foreshadowing": ["伏笔1"],
      "emotionalTone": "情绪基调",
      "turningPoint": "本章转折点描述"
    }
  ]
}`;

  log('正在构思故事结构...');

  const userMsg = `小说基本信息：
- 书名：${novel?.title || '待定'}
- 类型：${novel?.genre || '未指定'}
- 简介：${novel?.synopsis || userPrompt}
- 风格：${novel?.styleGuide || '自然流畅'}

用户灵感/补充设定：
${userPrompt}

请生成完整大纲。`;

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMsg },
  ];

  log('正在生成章节大纲...');
  const res = await chatCompletion(messages);
  if (res.error) return `大纲生成失败：${res.error}`;

  try {
    const jsonMatch = res.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      log(`大纲完成：${JSON.parse(jsonMatch[0]).totalChapters} 章`);
      return JSON.parse(jsonMatch[0]) as Outline;
    }
  } catch {
    return '大纲解析失败，请重试';
  }

  return '无法解析大纲，请重试';
}

// ============================================================
// 智能体 2：作家 Agent — 写作章节
// ============================================================

async function writerAgent(
  novelId: string,
  chapterOutline: ChapterOutline,
  callbacks?: AutoWriteCallbacks
): Promise<{ body: string; error?: string }> {
  const log = (action: string) => {
    callbacks?.onAgentLog?.('✍️ 作家', action);
  };

  log(`开始写第${chapterOutline.chapterNumber}章「${chapterOutline.title}」`);

  const novel = await getStoryBible(novelId);
  const ctx = await assembleNovelContext(novelId, chapterOutline.chapterNumber);

  const systemPrompt = `你是一位专业的长篇小说作家（作家Agent），正在创作一部${novel?.genre || '小说'}。

当前任务：写第${chapterOutline.chapterNumber}章「${chapterOutline.title}」（第${chapterOutline.volumeNumber}卷）

本章大纲：
${chapterOutline.summary}

关键事件：
${chapterOutline.keyEvents.map(e => `- ${e}`).join('\n')}

出场角色：
${chapterOutline.characters.join('、')}

本章要埋的伏笔：
${chapterOutline.foreshadowing.length > 0 ? chapterOutline.foreshadowing.map(f => `- ${f}`).join('\n') : '无'}

情绪基调：${chapterOutline.emotionalTone}
转折点：${chapterOutline.turningPoint}

写作要求：
1. 字数：4000-5000字
2. 严格遵循大纲，不要偏离
3. 每个角色的说话方式必须不同
4. 每段至少 2 种感官描写
5. 对话穿插动作，不用"他说""她说"
6. 开头不要重复上一章结尾
7. 结尾留钩子
8. 保持与前文的一致性
9. 必须包含转折点内容

${ctx}`;

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `请开始写第${chapterOutline.chapterNumber}章。只输出正文，不要输出任何其他内容。` },
  ];

  log('正在创作...');
  const res = await chatCompletion(messages);
  if (res.error) return { body: '', error: res.error };

  let body = res.content.trim();
  body = body.replace(/^第?\d+章[：:].*\n*/m, '');
  body = body.replace(/^#{1,3}\s*第?\d+章.*\n*/m, '');

  log(`完成，${body.length} 字`);
  return { body };
}

// ============================================================
// 智能体 3：编辑 Agent — 审查修订
// ============================================================

async function editorAgent(
  novelId: string,
  chapterNumber: number,
  body: string,
  callbacks?: AutoWriteCallbacks
): Promise<{ revisedBody: string; score: number; review: ReviewResult }> {
  const log = (action: string) => {
    callbacks?.onAgentLog?.('📝 编辑', action);
  };

  log(`审查第${chapterNumber}章...`);

  const novel = await getStoryBible(novelId);
  const chapters = await getChapters(novelId);
  const chars = await getCharacters(novelId);
  const fs = await getForeshadowing(novelId);

  const chapter = chapters.find(c => c.chapterNumber === chapterNumber);
  const prevChapter = chapters.find(c => c.chapterNumber === chapterNumber - 1);

  const charList = chars.map(c => `${c.name}：${c.traits}，状态：${c.currentState}`).join('\n');
  const fsList = fs.filter(f => f.status !== 'resolved').map(f => `- ${f.title}：${f.description}`).join('\n');

  const reviewPrompt = `你是一位资深小说编辑（编辑Agent），擅长发现作品中的问题并给出专业修改建议。

审查维度：
1. 情节逻辑 — 事件因果是否合理
2. 角色一致性 — 角色行为是否符合性格设定
3. 对话质量 — 是否自然、有区分度
4. 节奏把控 — 是否有拖沓或跳跃
5. 感官描写 — 是否有足够细节
6. 连续性 — 与前文是否衔接

请严格按 JSON 格式输出：
{
  "score": 75,
  "issues": ["问题1", "问题2"],
  "suggestions": ["建议1", "建议2"]
}

书名：${novel?.title || ''}
角色：${charList || '暂无'}
伏笔：${fsList || '暂无'}
${prevChapter ? `上一章摘要：${prevChapter.summary}` : '这是第一章'}

待审查内容：
${body}`;

  const messages: LLMMessage[] = [
    { role: 'user', content: reviewPrompt },
  ];

  const res = await chatCompletion(messages);
  
  let review: ReviewResult = { score: 60, issues: [], suggestions: [] };
  try {
    const jsonMatch = res.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      review = JSON.parse(jsonMatch[0]);
    }
  } catch {}

  log(`审查完成：${review.score}/100`);

  // 如果分数低于 65，进行修订
  if (review.score < 65) {
    log(`得分偏低，正在自动修订...`);

    const revisePrompt = `你是一位专业的小说编辑。请根据审查意见修订以下章节。

审查结果：
- 总分：${review.score}/100
- 问题：${review.issues.join('、')}
- 建议：${review.suggestions.join('、')}

修订要求：
1. 保留原有优点
2. 修复所有问题
3. 采纳所有建议
4. 保持字数 4000-5000 字
5. 不改变情节走向，只改善写作质量

原文：
${body}

请输出修订后的完整章节正文。只输出正文。`;

    const reviseRes = await chatCompletion([
      { role: 'user', content: revisePrompt },
    ]);

    if (!reviseRes.error && reviseRes.content) {
      log('修订完成');
      return {
        revisedBody: reviseRes.content.trim(),
        score: Math.min(review.score + 15, 95),
        review,
      };
    }
  }

  return { revisedBody: body, score: review.score, review };
}

// ============================================================
// 智能体 4：连续性检查 Agent — 跨章一致性
// ============================================================

async function continuityAgent(
  novelId: string,
  chapterNumber: number,
  callbacks?: AutoWriteCallbacks
): Promise<string[]> {
  const log = (action: string) => {
    callbacks?.onAgentLog?.('🔍 连续性', action);
  };

  // 只在每 5 章或关键章节做连续性检查
  if (chapterNumber % 5 !== 0 && chapterNumber > 3) {
    return [];
  }

  log(`检查第${chapterNumber}章连续性...`);

  const chapters = await getChapters(novelId);
  const recent = chapters.slice(-5);

  if (recent.length < 2) return [];

  const summaries = recent.map(c => `第${c.chapterNumber}章「${c.title}」：${c.summary}`).join('\n');

  const checkPrompt = `你是一位连续性编辑（连续性Agent），专门检查小说的前后一致性。

请检查以下最近章节的连续性，找出矛盾或遗漏：

${summaries}

检查维度：
1. 角色状态是否连续（不能突然出现又消失）
2. 时间线是否合理
3. 伏笔是否有遗忘
4. 情节是否有矛盾

如果有问题，输出 JSON 数组：["问题1", "问题2"]
如果没有问题，输出空数组：[]

只输出 JSON，不要输出其他内容。`;

  const messages: LLMMessage[] = [
    { role: 'user', content: checkPrompt },
  ];

  const res = await chatCompletion(messages);
  
  try {
    const jsonMatch = res.content.match(/\[[\s\S]*?\]/);
    if (jsonMatch) {
      const issues = JSON.parse(jsonMatch[0]);
      if (issues.length > 0) {
        log(`发现 ${issues.length} 个连续性问题`);
      }
      return issues;
    }
  } catch {}

  return [];
}

// ============================================================
// 主流程：全自动写作
// ============================================================

export async function autoWriteNovel(
  novelId: string,
  outline: Outline,
  callbacks?: AutoWriteCallbacks,
  startFromChapter: number = 1
): Promise<{ success: boolean; chaptersWritten: number; errors: string[]; continuityIssues: string[] }> {
  const errors: string[] = [];
  const allContinuityIssues: string[] = [];
  let chaptersWritten = 0;
  const totalChapters = outline.chapterOutlines.length;

  for (const chapterOutline of outline.chapterOutlines) {
    if (chapterOutline.chapterNumber < startFromChapter) continue;

    try {
      callbacks?.onProgress?.({
        phase: 'writing',
        currentChapter: chapterOutline.chapterNumber,
        totalChapters,
        currentVolume: chapterOutline.volumeNumber,
        chapterTitle: chapterOutline.title,
        chapterProgress: 0,
        overallProgress: Math.round(((chapterOutline.chapterNumber - 1) / totalChapters) * 100),
        status: `第${chapterOutline.chapterNumber}章「${chapterOutline.title}」`,
        agentLog: [],
        errors,
      });

      // 作家 Agent：写作
      const { body, error: writeError } = await writerAgent(
        novelId,
        chapterOutline,
        callbacks
      );

      if (writeError || !body) {
        const errMsg = `第${chapterOutline.chapterNumber}章写作失败：${writeError || '空内容'}`;
        errors.push(errMsg);
        callbacks?.onError?.(errMsg);
        continue;
      }

      // 保存章节
      await addChapter(
        novelId,
        chapterOutline.title,
        body,
        chapterOutline.summary
      );

      chaptersWritten++;
      callbacks?.onChapterComplete?.(chapterOutline.chapterNumber, chapterOutline.title);

      callbacks?.onProgress?.({
        phase: 'writing',
        currentChapter: chapterOutline.chapterNumber,
        totalChapters,
        currentVolume: chapterOutline.volumeNumber,
        chapterTitle: chapterOutline.title,
        chapterProgress: 50,
        overallProgress: Math.round((chapterOutline.chapterNumber / totalChapters) * 100),
        status: `第${chapterOutline.chapterNumber}章写作完成，正在审查...`,
        agentLog: [],
        errors,
      });

      // 编辑 Agent：审查修订
      const { revisedBody, score } = await editorAgent(
        novelId,
        chapterOutline.chapterNumber,
        body,
        callbacks
      );

      // 如果有修订，更新章节
      if (revisedBody !== body) {
        const chapters = await getChapters(novelId);
        const ch = chapters.find(c => c.chapterNumber === chapterOutline.chapterNumber);
        if (ch) {
          ch.body = revisedBody;
          ch.wordCount = revisedBody.length;
          await saveChapter(ch);
        }
      }

      callbacks?.onReviewComplete?.(chapterOutline.chapterNumber, score);

      // 连续性 Agent：检查
      const continuityIssues = await continuityAgent(novelId, chapterOutline.chapterNumber, callbacks);
      allContinuityIssues.push(...continuityIssues);

      callbacks?.onProgress?.({
        phase: 'writing',
        currentChapter: chapterOutline.chapterNumber,
        totalChapters,
        currentVolume: chapterOutline.volumeNumber,
        chapterTitle: chapterOutline.title,
        chapterProgress: 100,
        overallProgress: Math.round((chapterOutline.chapterNumber / totalChapters) * 100),
        status: `第${chapterOutline.chapterNumber}章完成（${score}分）`,
        agentLog: [],
        errors,
      });

    } catch (e: any) {
      const errMsg = `第${chapterOutline.chapterNumber}章异常：${e.message}`;
      errors.push(errMsg);
      callbacks?.onError?.(errMsg);
    }
  }

  callbacks?.onProgress?.({
    phase: 'complete',
    currentChapter: totalChapters,
    totalChapters,
    currentVolume: 0,
    chapterTitle: '',
    chapterProgress: 100,
    overallProgress: 100,
    status: `全部完成！共写${chaptersWritten}章`,
    agentLog: [],
    errors,
  });

  return {
    success: errors.length === 0,
    chaptersWritten,
    errors,
    continuityIssues: allContinuityIssues,
  };
}

// ============================================================
// 辅助
// ============================================================

export async function getAutoWriteStatus(novelId: string): Promise<{
  totalChapters: number;
  completedChapters: number;
  lastChapter: number;
} | null> {
  const novel = await getStoryBible(novelId);
  const chapters = await getChapters(novelId);
  
  if (!novel) return null;

  return {
    totalChapters: novel.totalChapters,
    completedChapters: chapters.length,
    lastChapter: chapters.length > 0 ? chapters[chapters.length - 1].chapterNumber : 0,
  };
}
