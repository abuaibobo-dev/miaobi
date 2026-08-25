// Free AI providers for adult content - no API key needed
// Groq/SambaNova run Llama 3 with fewer content restrictions

export interface FreeProvider {
  name: string;
  baseUrl: string;
  model: string;
}

export const FREE_PROVIDERS: FreeProvider[] = [
  { name: 'Groq (Llama 3)', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.1-8b-instant' },
  { name: 'SambaNova', baseUrl: 'https://api.sambanova.ai/v1', model: 'Meta-Llama-3.1-8B-Instruct' },
  { name: 'Cerebras', baseUrl: 'https://api.cerebras.ai/v1', model: 'llama-3.1-8b' },
];

export async function tryFreeProviders(
  messages: { role: string; content: string }[],
  onProvider?: (name: string) => void
): Promise<{ content: string; provider: string } | null> {
  for (const provider of FREE_PROVIDERS) {
    try {
      onProvider?.(provider.name);
      const res = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: provider.model,
          messages,
          max_tokens: 3000,
          temperature: 0.8,
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) continue;
      const data = await res.json().catch(() => null);
      const content = String(data?.choices?.[0]?.message?.content || '');
      if (content.length > 10) return { content, provider: provider.name };
    } catch { continue; }
  }
  return null;
}
