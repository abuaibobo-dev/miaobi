import { getSettings } from './storage';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  error?: string;
  provider?: string;
}

/**
 * 智能路由：Ollama 优先 → DeepSeek 云端
 */
export async function chatCompletion(messages: LLMMessage[]): Promise<LLMResponse> {
  const settings = await getSettings() as any;

  // ★ 优先尝试 Ollama 本地
  if (settings.ollamaModel && settings.ollamaUrl) {
    const ollamaResult = await callOllama(settings.ollamaUrl, settings.ollamaModel, messages);
    if (!ollamaResult.error) {
      return { ...ollamaResult, provider: `ollama/${settings.ollamaModel}` };
    }
    // Ollama 失败，降级到 DeepSeek
    console.log('Ollama failed, falling back to DeepSeek:', ollamaResult.error);
  }

  // DeepSeek 云端
  if (!settings.apiKey) {
    return { content: '', error: '未配置 API Key。请在设置中填写 DeepSeek API Key 或配置 Ollama 本地模型。' };
  }
  return callDeepSeek(settings.baseUrl, settings.apiKey, settings.model, messages, settings.temperature, settings.maxTokens);
}

/**
 * 调用 Ollama 本地模型
 */
async function callOllama(baseUrl: string, model: string, messages: LLMMessage[]): Promise<LLMResponse> {
  try {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: false,
      }),
      signal: AbortSignal.timeout(120000),
    });
    if (!res.ok) {
      const err = await res.text();
      return { content: '', error: `Ollama ${res.status}: ${err}` };
    }
    const data = await res.json();
    return { content: data.message?.content || '' };
  } catch (e: any) {
    return { content: '', error: `Ollama 连接失败: ${e.message}` };
  }
}

/**
 * 调用 DeepSeek 云端（兼容 OpenAI 格式）
 */
async function callDeepSeek(
  baseUrl: string, apiKey: string, model: string,
  messages: LLMMessage[], temperature: number, maxTokens: number
): Promise<LLMResponse> {
  const url = `${baseUrl}/v1/chat/completions`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, stream: false }),
      signal: AbortSignal.timeout(120000),
    });
    if (!res.ok) {
      const err = await res.text();
      return { content: '', error: `API 错误 ${res.status}: ${err}` };
    }
    const data = await res.json();
    return { content: data.choices?.[0]?.message?.content || '' };
  } catch (e: any) {
    return { content: '', error: `网络错误: ${e.message || e}` };
  }
}

/**
 * 检查 API 连接
 */
export async function checkApiKey(): Promise<{ valid: boolean; error?: string; provider?: string }> {
  const settings = await getSettings() as any;

  // 先试 Ollama
  if (settings.ollamaModel && settings.ollamaUrl) {
    try {
      const res = await fetch(`${settings.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        return { valid: true, provider: `ollama/${settings.ollamaModel}` };
      }
    } catch {}
  }

  // 再试 DeepSeek
  if (!settings.apiKey) return { valid: false, error: '未配置 API Key' };
  try {
    const result = await chatCompletion([
      { role: 'system', content: '回复ok' },
      { role: 'user', content: 'ping' },
    ]);
    if (result.error) return { valid: false, error: result.error };
    return { valid: true, provider: result.provider || 'deepseek' };
  } catch (e: any) {
    return { valid: false, error: e.message };
  }
}
