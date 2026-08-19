/**
 * 场景扩写器 — 把简短骨架扩写成完整场景
 */
import { chatCompletion, type LLMMessage } from './llm';

export async function expandScene(
  novelId: string,
  skeleton: string,
  targetWords: number = 2000
): Promise<string> {
  const systemPrompt = `你是一位专业的场景扩写专家。你的任务是把一段简短的场景骨架扩写成细腻、完整、有画面感的场景描写。

扩写原则：
1. 保留骨架中的核心事件和人物，不要改变情节走向
2. 补充感官细节：视觉（光影/色彩）、听觉（环境音）、触觉（温度/质感）、嗅觉（气味）
3. 补充微动作：手指的动作、眼神的变化、呼吸的节奏
4. 补充环境氛围：天气、光线、时间、空间感
5. 补充内心活动：角色在想什么、感受到什么
6. 对话要自然，穿插动作描写，不要连续对话超过3句不加描写
7. 用具体的细节替代抽象的描述（"紧张"→"手指无意识地绞着衣角"）

输出要求：
- 直接输出扩写后的场景正文，不要加任何解释或前言
- 目标字数：${targetWords}字左右
- 保持文学性，不要写成流水账`;

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `请扩写以下场景骨架：\n\n${skeleton}` },
  ];

  const res = await chatCompletion(messages);
  return res.error ? `扩写失败：${res.error}` : res.content;
}
