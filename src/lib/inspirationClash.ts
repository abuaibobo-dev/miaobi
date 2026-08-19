/**
 * 灵感碰撞 — 输入关键词，生成多个创意方向
 */
import { chatCompletion, type LLMMessage } from './llm';

export async function clashIdeas(
  keywords: string,
  genre?: string
): Promise<string> {
  const systemPrompt = `你是一个创意策划专家。用户给你几个关键词，你要生成5个完全不同的创意方向。

每个方向必须：
1. 有一个抓人的标题
2. 有3-5句核心概念描述
3. 和其他方向完全不同（不要换汤不换药）
4. 有可执行性，不是空洞的概念
5. 至少有1个方向是出人意料的、反常规的

输出格式：
## 创意碰撞：[关键词]

### 💡 方向一：[标题]
[3-5句描述]

### 💡 方向二：[标题]
[3-5句描述]

...以此类推，共5个方向

### 🎯 我的推荐
[推荐其中一个，说明为什么]`;

  const userMsg = `关键词：${keywords}${genre ? `\n类型偏好：${genre}` : ''}

请给我5个创意方向。`;

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMsg },
  ];

  const res = await chatCompletion(messages);
  return res.error ? `生成失败：${res.error}` : res.content;
}
