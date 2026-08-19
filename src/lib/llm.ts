import { getSettings } from './storage';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  error?: string;
}

/**
 * 调用 DeepSeek API（兼容 OpenAI 格式）
 */
export async function chatCompletion(messages: LLMMessage[]): Promise<LLMResponse> {
  const settings = await getSettings();
  if (!settings.apiKey) {
    return { content: '', error: '未配置 API Key，请在设置中填写 DeepSeek API Key。' };
  }

  const url = `${settings.baseUrl}/v1/chat/completions`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        messages,
        temperature: settings.temperature,
        max_tokens: settings.maxTokens,
        stream: false,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return { content: '', error: `API 错误 ${res.status}: ${err}` };
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    return { content };
  } catch (e: any) {
    return { content: '', error: `网络错误: ${e.message || e}` };
  }
}

/**
 * 流式调用（SSE）
 */
export async function* chatStream(messages: LLMMessage[]): AsyncGenerator<string, void, unknown> {
  const settings = await getSettings();
  if (!settings.apiKey) {
    yield '❌ 未配置 API Key';
    return;
  }

  const url = `${settings.baseUrl}/v1/chat/completions`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        messages,
        temperature: settings.temperature,
        max_tokens: settings.maxTokens,
        stream: true,
      }),
    });

    if (!res.ok) {
      yield `❌ API 错误 ${res.status}`;
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') return;
          try {
            const json = JSON.parse(data);
            const token = json.choices?.[0]?.delta?.content;
            if (token) yield token;
          } catch {}
        }
      }
    }
  } catch (e: any) {
    yield `❌ 网络错误: ${e.message || e}`;
  }
}

/**
 * 检查 API Key 是否有效
 */
export async function checkApiKey(): Promise<{ valid: boolean; balance?: number; error?: string }> {
  const settings = await getSettings();
  if (!settings.apiKey) return { valid: false, error: '未配置 API Key' };

  try {
    const res = await chatCompletion([
      { role: 'system', content: '回复ok' },
      { role: 'user', content: 'ping' },
    ]);
    if (res.error) return { valid: false, error: res.error };
    return { valid: true };
  } catch (e: any) {
    return { valid: false, error: e.message };
  }
}
