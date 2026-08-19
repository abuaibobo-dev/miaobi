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

  // ★ 智能路由：检测内容敏感度，决定用哪个模型
  const shouldUseLocal = settings.ollamaModel && settings.ollamaUrl && isSensitiveContent(messages);

  if (shouldUseLocal) {
    // 敏感内容 → 本地 Ollama（无审查）
    const ollamaResult = await callOllama(settings.ollamaUrl, settings.ollamaModel, messages);
    if (!ollamaResult.error) {
      return { ...ollamaResult, provider: `ollama/${settings.ollamaModel}` };
    }
    console.log('Ollama failed, falling back to DeepSeek:', ollamaResult.error);
  }

  // 日常内容 → DeepSeek 云端（质量最好）
  if (!settings.apiKey) {
    return { content: '', error: '未配置 API Key。请在设置中填写 DeepSeek API Key 或配置 Ollama 本地模型。' };
  }
  return callDeepSeek(settings.baseUrl, settings.apiKey, settings.model, messages, settings.temperature, settings.maxTokens);
}

/**
 * 检测对话是否涉及敏感内容（亲密/激情/成人场景）
 */
function isSensitiveContent(messages: LLMMessage[]): boolean {
  const keywords = ['亲密', '激情', '床', '吻', '拥抱', '身体', '肌肤', '温度', '呼吸', '缠绵',
    '脱', '衣服', '裸', '欲望', '欲望', '情欲', '缠绵', '翻云覆雨', '云雨', '鱼水之欢',
    '胸', '腰', '腿', '唇', '舌头', '抚摸', '触碰', '摩擦', '挑逗', '诱惑',
    '做爱', '性爱', '上床', '同床', '缠绵', '温存', '床戏', '激情戏'];
  const lastUserMsg = messages.filter(m => m.role === 'user').pop();
  const lastSystemMsg = messages.filter(m => m.role === 'system').pop();
  const text = (lastUserMsg?.content || '') + (lastSystemMsg?.content || '');
  return keywords.some(k => text.includes(k));
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
      body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, stream: false, frequency_penalty: 0.3, presence_penalty: 0.3 }),
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
