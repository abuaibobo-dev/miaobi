import { getSettings } from './storage';
import { INTIMATE_SYSTEM_PROMPT, INTIMATE_USER_PREFIX, shouldUseLocalModel } from './intimatePrompt';

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
    const ollamaResult = await callOllama(settings.ollamaUrl, settings.ollamaModel, buildLocalPrompt(messages));
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
  const lastUserMsg = messages.filter(m => m.role === 'user').pop();
  const text = lastUserMsg?.content || '';
  return shouldUseLocalModel(text);
}

/**
 * 为本地模型构建专属 prompt（敏感内容用文学级 prompt）
 */
function buildLocalPrompt(messages: LLMMessage[]): LLMMessage[] {
  const lastUserMsg = messages.filter(m => m.role === 'user').pop();
  const userText = lastUserMsg?.content || '';
  
  if (shouldUseLocalModel(userText)) {
    // 敏感内容：用专属 prompt 替换 system prompt
    const nonSystemMsgs = messages.filter(m => m.role !== 'system');
    return [
      { role: 'system', content: INTIMATE_SYSTEM_PROMPT },
      ...nonSystemMsgs.slice(0, -1),
      { role: 'user', content: INTIMATE_USER_PREFIX + userText },
    ];
  }
  return messages;
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
      signal: (() => { const c = new AbortController(); setTimeout(() => c.abort(), 120000); return c.signal; })(),
    });
    if (!res.ok) {
      const err = await res.text();
      return { content: '', error: `Ollama ${res.status}: ${err}` };
    }
    const data = await res.json();
    // 清理 Ollama 输出中的性能日志
    let content = data.message?.content || '';
    content = content.replace(/slot\s+print_timing:.*?\n/g, '');
    content = content.replace(/srv\s+update_slots:.*?\n/g, '');
    content = content.replace(/\[GIN\].*?\n/g, '');
    content = content.replace(/graphs reused =.*?\n/g, '');
    content = content.replace(/release:.*?\n/g, '');
    content = content.trim();
    return { content };
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

  // 先试 Ollama
  if (settings.ollamaModel && settings.ollamaUrl) {
    try {
      const res = await fetch(`${settings.ollamaUrl}/api/tags`, { signal: (() => { const c = new AbortController(); setTimeout(() => c.abort(), 5000); return c.signal; })() });
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
