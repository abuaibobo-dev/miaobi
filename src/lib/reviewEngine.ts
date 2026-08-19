/**
 * AI 审稿引擎 — 审查已写章节的质量
 */

import { chatCompletion, type LLMMessage } from './llm';
import { getStoryBible } from './novelMemory';
import { getChapters, getCharacters, getForeshadowing } from './storage';

export interface ReviewResult {
  overallScore: number;       // 0-100
  strengths: string[];        // 优点
  issues: string[];           // 问题
  suggestions: string[];      // 改进建议
  continuityIssues: string[]; // 连续性问题
  dialogueQuality: string;    // 对话质量评价
  pacingAnalysis: string;     // 节奏分析
  detailedFeedback: string;   // 详细反馈
}

/**
 * 审查指定章节
 */
export async function reviewChapter(
  novelId: string,
  chapterNumber: number
): Promise<ReviewResult | string> {
  const novel = await getStoryBible(novelId);
  const chapters = await getChapters(novelId);
  const chars = await getCharacters(novelId);
  const fs = await getForeshadowing(novelId);

  const chapter = chapters.find(c => c.chapterNumber === chapterNumber);
  if (!chapter) return `未找到第${chapterNumber}章`;

  const prevChapter = chapters.find(c => c.chapterNumber === chapterNumber - 1);
  const nextChapter = chapters.find(c => c.chapterNumber === chapterNumber + 1);

  const charList = chars.map(c => `${c.name}：${c.traits}，状态：${c.currentState}`).join('\n');
  const fsList = fs.filter(f => f.status !== 'resolved').map(f => `- ${f.title}（${f.status}）：${f.description}`).join('\n');

  const systemPrompt = `你是一位资深小说编辑，擅长发现作品中的问题并给出专业修改建议。

审查维度：
1. 【情节逻辑】事件因果是否合理，有无逻辑漏洞
2. 【角色一致性】角色行为是否符合其性格设定，有无OOC
3. 【对话质量】对话是否自然、有区分度、推动情节
4. 【节奏把控】是否有拖沓或跳跃，张弛是否得当
5. 【感官描写】是否有足够的感官细节，是否只是干巴巴的叙述
6. 【连续性】与前后章节是否衔接，有无矛盾
7. 【伏笔处理】是否有该埋未埋、该收未收的伏笔
8. 【字数与密度】内容密度是否够，有无水字数

请严格按以下 JSON 格式输出（不要输出其他内容）：
{
  "overallScore": 75,
  "strengths": ["优点1", "优点2"],
  "issues": ["问题1", "问题2"],
  "suggestions": ["建议1", "建议2"],
  "continuityIssues": ["连续性问题1"],
  "dialogueQuality": "对话质量评语",
  "pacingAnalysis": "节奏分析评语",
  "detailedFeedback": "200字以内的详细综合反馈"
}`;

  const userMsg = `书名：${novel?.title || '未命名'}
类型：${novel?.genre || ''}

角色设定：
${charList || '暂无'}

未回收伏笔：
${fsList || '暂无'}

${prevChapter ? `上一章（第${chapterNumber - 1}章）摘要：${prevChapter.summary}` : '这是第一章'}

--- 待审查内容 ---
第${chapterNumber}章 ${chapter.title}
字数：${chapter.wordCount}

${chapter.body}

${nextChapter ? `下一章（第${chapterNumber + 1}章）摘要：${nextChapter.summary}` : ''}

--- 审查完毕 ---`;

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMsg },
  ];

  const res = await chatCompletion(messages);
  if (res.error) return `审稿失败：${res.error}`;

  // 尝试解析 JSON
  try {
    const jsonMatch = res.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as ReviewResult;
    }
  } catch {}

  // JSON 解析失败，返回原始文本
  return res.content;
}

/**
 * 全书审稿（抽查最近 3 章）
 */
export async function reviewNovel(novelId: string): Promise<string> {
  const chapters = await getChapters(novelId);
  if (chapters.length === 0) return '暂无章节可审查';

  const recent = chapters.slice(-3);
  const results: string[] = [];

  for (const ch of recent) {
    const result = await reviewChapter(novelId, ch.chapterNumber);
    if (typeof result === 'string') {
      results.push(`## 第${ch.chapterNumber}章 ${ch.title}\n${result}`);
    } else {
      results.push(`## 第${ch.chapterNumber}章 ${ch.title}（${result.overallScore}/100）
优点：${result.strengths.join('、')}
问题：${result.issues.join('、')}
建议：${result.suggestions.join('、')}
${result.detailedFeedback}`);
    }
  }

  return results.join('\n\n---\n\n');
}
