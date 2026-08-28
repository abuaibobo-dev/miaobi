export function parseThinking(content: string): { thinking: string; body: string } {
  let working = content;
  let thinking = '';

  const tagged = working.match(/<(?:think|thinking)>([\s\S]*?)(?:<\/(?:think|thinking)>|$)/i);
  if (tagged) {
    thinking = tagged[1].trim();
    working = working.replace(/<(?:think|thinking)>[\s\S]*?(?:<\/(?:think|thinking)>|$)/gi, '');
  }

  const marked = working.match(/🧠\s*思考中[：:]\s*\n([\s\S]*?)(?=\n\n|\n(?!(?:[-*•]|\d+\.|【)))/i);
  if (marked) {
    thinking = [thinking, marked[1].trim()].filter(Boolean).join('\n');
    working = working.replace(/🧠\s*思考中[：:]\s*\n[\s\S]*?(?=\n\n|\n(?!(?:[-*•]|\d+\.|【)))/i, '');
  }

  return { thinking: thinking.trim(), body: working.trim() };
}
