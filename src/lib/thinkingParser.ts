export function parseThinking(content: string): { thinking: string; body: string } {
  let working = content;
  let thinking = '';

  const tagged = working.match(/<(?:think|thinking)>([\s\S]*?)(?:<\/(?:think|thinking)>|$)/i);
  if (tagged) {
    thinking = tagged[1].trim();
    working = working.replace(/<(?:think|thinking)>[\s\S]*?(?:<\/(?:think|thinking)>|$)/gi, '');
  }

  const marked = working.match(/🧠\s*思考中[：:]\s*\n([\s\S]*?)(?=\n\n|\n(?!(?:[-*•]|\d+\.|【)))|🧠\s*思考中[：:]\s*\n[\s\S]*$/i);
  if (marked) {
    thinking = [thinking, marked[1] || marked[0].replace(/^🧠\s*思考中[：:]\s*\n?/i, '')].filter(Boolean).join('\n');
    working = working.replace(/^🧠\s*思考中[：:]\s*\n[\s\S]*$/im, '');
  }

  return { thinking: thinking.trim(), body: working.trim() };
}
