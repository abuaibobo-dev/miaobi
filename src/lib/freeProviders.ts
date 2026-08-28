import { getSettings, saveSettings } from './storage';

// Free AI providers for adult content - fewer content restrictions
// Groq/SambaNova/Cerebras require free API keys (register at their sites)

export interface FreeProvider {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  settingsKey: string;
}

export const FREE_PROVIDERS: FreeProvider[] = [
  { id: 'groq', name: 'Groq (Qwen 3.6)', baseUrl: 'https://api.groq.com/openai/v1', model: 'qwen/qwen3.6-27b', settingsKey: 'groqKey' },
  { id: 'sambanova', name: 'SambaNova (DeepSeek)', baseUrl: 'https://api.sambanova.ai/v1', model: 'DeepSeek-V3.1', settingsKey: 'sambanovaKey' },
  { id: 'cerebras', name: 'Cerebras', baseUrl: 'https://api.cerebras.ai/v1', model: 'llama-3.1-8b', settingsKey: 'cerebrasKey' },
];

let _injectedKeys: Record<string, string> | null = null;
async function getInjectedKeys(): Promise<Record<string, string>> {
  if (_injectedKeys) return _injectedKeys;
  try {
    const mod = await import('../config/keys');
    _injectedKeys = mod.INJECTED_KEYS || {};
  } catch { _injectedKeys = {}; }
  return _injectedKeys || {};
}

export async function getFreeProviderKeys(): Promise<Record<string, string>> {
  const settings = await getSettings() as any;
  const injected = await getInjectedKeys();
  return {
    groq: settings.groqKey || injected.groq || '',
    sambanova: settings.sambanovaKey || injected.sambanova || '',
    cerebras: settings.cerebrasKey || injected.cerebras || '',
  };
}

export async function saveFreeProviderKeys(keys: Record<string, string>): Promise<void> {
  const settings = await getSettings() as any;
  await saveSettings({ ...settings, groqKey: keys.groq || '', sambanovaKey: keys.sambanova || '', cerebrasKey: keys.cerebras || '' } as any);
}

export async function hasFreeProviderKeys(): Promise<boolean> {
  const keys = await getFreeProviderKeys();
  return !!(keys.groq || keys.sambanova || keys.cerebras);
}

export async function tryFreeProviders(
  messages: { role: string; content: string }[],
  onProvider?: (name: string) => void
): Promise<{ content: string; provider: string } | null> {
  const keys = await getFreeProviderKeys();
  for (const provider of FREE_PROVIDERS) {
    const apiKey = keys[provider.id];
    if (!apiKey) continue; // skip providers without configured key
    try {
      onProvider?.(provider.name);
      const res = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: provider.model,
          messages,
          max_tokens: 3000,
          temperature: 0.8,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) continue;
      const data = await res.json().catch(() => null);
      const content = String(data?.choices?.[0]?.message?.content || '');
      if (content.length > 10) return { content, provider: provider.name };
    } catch { continue; }
  }
  return null;
}
