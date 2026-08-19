/**
 * 矛盾冲突引擎 — 自动生成角色间的冲突场景
 */

import { chatCompletion, type LLMMessage } from './llm';
import { getStoryBible } from './novelMemory';
import { getCharacters, getForeshadowing } from './storage';

/**
 * 生成冲突场景
 */
export async function generateConflict(
  novelId: string,
  characterA: string,
  characterB: string,
  conflictType?: string
): Promise<string> {
  const novel = await getStoryBible(novelId);
  const chars = await getCharacters(novelId);
  const fs = await getForeshadowing(novelId);

  const charA = chars.find(c => c.name === characterA);
  const charB = chars.find(c => c.name === characterB);

  const charDescA = charA ? `【${charA.name}】性格：${charA.traits}，当前状态：${charA.currentState}` : `【${characterA}】`;
  const charDescB = charB ? `【${charB.name}】性格：${charB.traits}，当前状态：${charB.currentState}` : `【${characterB}】`;

  const activeFs = fs.filter(f => f.status !== 'resolved' && f.status !== 'abandoned');
  const fsDesc = activeFs.length > 0
    ? `\n未回收伏笔：\n${activeFs.map(f => `- ${f.title}：${f.description}`).join('\n')}`
    : '';

  const conflictHint = conflictType ? `\n冲突类型偏好：${conflictType}` : '';

  const systemPrompt = `你是一个专业的小说矛盾设计专家。你的任务是为两个角色设计一场具体、真实、有张力的冲突场景。

要求：
1. 冲突必须源于角色的性格差异或立场对立，不能凭空制造
2. 冲突要有层次：暗流→爆发→余波，不能只有一句吵架
3. 冲突中要推动情节：冲突后关系必须发生变化（和好/决裂/产生新秘密）
4. 写出具体的对话片段（至少 6-8 轮对话）
5. 穿插动作描写和心理活动
6. 结尾留一个转折或悬念

输出格式：
## 冲突场景：[标题]

### 背景铺垫
[2-3段，写冲突前的氛围和导火索]

### 冲突爆发
[具体对话+动作+心理，至少6-8轮]

### 余波
[冲突后的变化，关系走向]

### 推荐后续
[这个冲突可以引出什么新情节]`;

  const userMsg = `小说设定：${novel?.title || '未命名'}（${novel?.genre || ''}）
${charDescA}
${charDescB}
${fsDesc}
${conflictHint}

请为这两个角色设计一场冲突场景。`;

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMsg },
  ];

  const res = await chatCompletion(messages);
  return res.error ? `生成失败：${res.error}` : res.content;
}

/**
 * 生成角色矛盾列表（多选冲突类型）
 */
export function getConflictTypes(): Array<{ key: string; label: string; desc: string }> {
  return [
    { key: 'misunderstanding', label: '误会', desc: '信息不对称导致的误解' },
    { key: 'jealousy', label: '嫉妒', desc: '对某人/某物的占有欲' },
    { key: 'ideology', label: '立场对立', desc: '价值观/目标的根本冲突' },
    { key: 'secret', label: '秘密暴露', desc: '隐藏的秘密被发现' },
    { key: 'betrayal', label: '背叛', desc: '信任被打破' },
    { key: 'competition', label: '竞争', desc: '争夺同一个目标' },
    { key: 'duty', label: '责任冲突', desc: '个人情感 vs 职责义务' },
    { key: 'past', label: '旧怨', desc: '过去的恩怨重新浮现' },
  ];
}
