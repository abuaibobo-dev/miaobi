/**
 * 从 AI 回复中解析思考过程
 * 格式：🧠 思考中：\n- 步骤1\n- 步骤2\n\n正文...
 */
export function parseThinking(content: string): { thinking: string; body: string } {
  const thinkMatch = content.match(/🧠\s*思考中[：:]\s*\n([\s\S]*?)(?=\n\n|$)/);
  if (thinkMatch) {
    const thinking = thinkMatch[1].trim();
    const body = content.slice(thinkMatch.index! + thinkMatch[0].length).trim();
    return { thinking, body };
  }
  // fallback: 没有思考标记就返回原文
  return { thinking: '', body: content };
}
