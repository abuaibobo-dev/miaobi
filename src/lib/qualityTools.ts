/**
 * 质量工具集 — 情绪曲线 / 重复检测 / 一致性检查
 */
import { chatCompletion, type LLMMessage } from './llm';
import { getStoryBible } from './novelMemory';
import { getChapters, getCharacters } from './storage';

/**
 * 情绪曲线分析 — 分析每章的情绪走向
 */
export async function analyzeEmotionCurve(novelId: string): Promise<string> {
  const chapters = await getChapters(novelId);
  if (chapters.length < 2) return '至少需要2章才能分析情绪曲线';

  const summaries = chapters.map(ch => `第${ch.chapterNumber}章：${ch.summary || '(无摘要)'}`).join('\n');

  const systemPrompt = `你是文学评论家，擅长分析小说的情绪节奏。

请分析以下章节的情绪曲线，为每章标注：
- 主导情绪（1-2个词，如：紧张、温馨、悲伤、愤怒、期待、绝望、平静）
- 情绪强度（1-10分）
- 节奏类型（铺垫/上升/高潮/回落/转折）

然后给出整体评价：
- 情绪是否有起伏（不能一直平淡）
- 高潮分布是否合理（不能全在前面或全在后面）
- 有没有"情绪断崖"（突然从高潮跌到平淡，没有过渡）
- 改进建议

输出格式：
| 章节 | 情绪 | 强度 | 节奏 |
|------|------|------|------|
| 第1章 | 紧张→期待 | 6→4 | 铺垫 |
...

整体评价：...
改进建议：...`;

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `书名：${(await getStoryBible(novelId))?.title || ''}\n\n章节摘要：\n${summaries}` },
  ];

  const res = await chatCompletion(messages);
  return res.error ? `分析失败：${res.error}` : res.content;
}

/**
 * 重复检测 — 找出词汇和句式重复
 */
export async function detectRepetition(novelId: string, chapterNumber?: number): Promise<string> {
  const chapters = await getChapters(novelId);
  let text = '';

  if (chapterNumber) {
    const ch = chapters.find(c => c.chapterNumber === chapterNumber);
    if (!ch) return `未找到第${chapterNumber}章`;
    text = ch.body;
  } else {
    // 分析最近3章
    const recent = chapters.slice(-3);
    text = recent.map(ch => ch.body).join('\n\n');
  }

  if (!text || text.length < 200) return '内容太少，无法分析';

  const systemPrompt = `你是文本分析专家，擅长发现写作中的重复问题。

请分析以下文本，找出：
1. 高频重复词汇（出现超过5次的词，排除"的""了""是"等虚词）
2. 重复句式（相同的句型结构反复出现）
3. 重复意象（同一个比喻/描写反复使用）
4. 重复情节模式（类似的场景/冲突反复出现）

对于每个问题，给出：
- 具体示例（原文引用）
- 出现次数
- 替换建议

输出格式：
## 重复词汇
| 词汇 | 次数 | 替换建议 |
|------|------|----------|

## 重复句式
| 句式 | 出现位置 | 改写建议 |
|------|----------|----------|

## 重复意象
...

## 总体评价
[一段话总结重复程度和改进方向]`;

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: text.slice(0, 6000) },
  ];

  const res = await chatCompletion(messages);
  return res.error ? `检测失败：${res.error}` : res.content;
}

/**
 * 一致性检查 — 检查角色在不同章节中的行为是否一致
 */
export async function checkConsistency(novelId: string): Promise<string> {
  const novel = await getStoryBible(novelId);
  const chapters = await getChapters(novelId);
  const chars = await getCharacters(novelId);

  if (chapters.length < 2) return '至少需要2章才能检查一致性';

  const charList = chars.map(c => `${c.name}：性格[${c.traits}]，当前状态[${c.currentState}]，状态[${c.status}]`).join('\n');
  const summaries = chapters.map(ch => `第${ch.chapterNumber}章：${ch.summary || '(无摘要)'}`).join('\n');

  const systemPrompt = `你是小说 continuity editor（连续性编辑），专门检查角色和情节的一致性问题。

请检查以下内容：
1. 【角色一致性】角色在不同章节中的行为是否符合其性格设定
2. 【状态连续性】角色的状态变化是否合理，有无突然变化没有交代
3. 【时间线一致性】事件发生的先后顺序是否合理
4. 【设定一致性】世界观设定有无前后矛盾
5. 【伏笔一致性】已埋下的伏笔有无遗忘或矛盾

对于每个问题，给出：
- 具体问题描述
- 涉及的章节
- 严重程度（🔴严重/🟡一般/🟢轻微）
- 修复建议

输出格式：
## 一致性检查报告

### 🔴 严重问题
...

### 🟡 一般问题
...

### 🟢 轻微问题
...

### ✅ 通过项
...

### 总体评价
...`;

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `书名：${novel?.title || ''}，类型：${novel?.genre || ''}

角色设定：
${charList || '暂无'}

章节摘要：
${summaries}` },
  ];

  const res = await chatCompletion(messages);
  return res.error ? `检查失败：${res.error}` : res.content;
}
