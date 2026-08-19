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



  // 日常内容 → DeepSeek 云端（质量最好）
  if (!settings.apiKey) {
    return { content: '', error: '未配置 API Key。请在设置中填写 DeepSeek API Key 或配置 Ollama 本地模型。' };
  }
  return callDeepSeek(settings.baseUrl, settings.apiKey, settings.model, messages, settings.temperature, settings.maxTokens);
}

/**
 * 检测对话是否涉及敏感内容（亲密/激情/成人场景）
 */


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
      signal: (() => { const c = new AbortController(); setTimeout(() => c.abort(), 120000); return c.signal; })(),
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

/**
 * 查询 DeepSeek 余额
 */
export async function checkBalance(): Promise<{ balance?: number; currency?: string; error?: string }> {
  const settings = await getSettings() as any;
  if (!settings.apiKey) return { error: '未配置 API Key' };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch('https://api.deepseek.com/user/balance', {
      headers: { 'Authorization': `Bearer ${settings.apiKey}` },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const data = await res.json();
    const info = data.balance_infos?.[0];
    if (info) {
      return { balance: info.total_balance, currency: info.currency || 'CNY' };
    }
    return { error: '无法解析余额数据' };
  } catch (e: any) {
    return { error: e.message || '查询失败' };
  }
}

export async function checkApiKey(): Promise<{ valid: boolean; error?: string; provider?: string }> {
  const settings = await getSettings() as any;

  // DeepSeek
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
