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

// Ollama 本地模型配置
export const OLLAMA_MODELS = {
  WRITING: 'qwen3:1.7b' as string,    // 写小说专用
  VISION: 'moondream' as string,    // 识图专用
  CHAT: 'qwen2.5:1.5b' as string,  // 日常聊天
} as const;

const OLLAMA_FALLBACKS = {
  WRITING: ['qwen3:1.7b', 'dqnwrite', 'deepseek-r1:1.7b', 'qwen2.5:1.5b'],
  VISION: ['moondream', 'llava'],
  CHAT: ['qwen2.5:1.5b', 'qwen3:1.7b', 'deepseek-r1:1.7b'],
};

const OLLAMA_BASE = 'http://127.0.0.1:11434';

// 意图检测：判断用户消息类型
export function detectIntent(text: string, hasImage?: boolean): 'writing' | 'vision' | 'chat' {
  // 有图片 → 识图
  if (hasImage) return 'vision';
  
  // 写作相关关键词
  const writingKeywords = [
    '写', '创作', '续写', '章节', '大纲', '剧情', '角色', '小说',
    '故事', '对话', '描写', '场景', '结局', '开头', '伏笔',
    '设定', '世界观', '修改', '润色', '修改一下', '改一下'
  ];
  
  if (writingKeywords.some(kw => text.includes(kw))) {
    return 'writing';
  }
  
  // 默认日常聊天
  return 'chat';
}

// 调用 Ollama 本地模型
async function callOllama(
  model: string,
  messages: LLMMessage[],
  temperature: number = 0.8,
  maxTokens: number = 2048,
  images?: string[]  // base64 图片
): Promise<LLMResponse> {
  try {
    const body: any = {
      model,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      stream: false,
      options: {
        temperature,
        num_predict: maxTokens,
      },
    };
    
    // 如果有图片，添加到第一条消息
    if (images && images.length > 0 && body.messages.length > 0) {
      body.messages[0].images = images;
    }
    
    const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: (() => { const c = new AbortController(); setTimeout(() => c.abort(), 120000); return c.signal; })(),
    });
    
    if (!res.ok) {
      const err = await res.text();
      return { content: '', error: `Ollama 错误 ${res.status}: ${err}` };
    }
    
    const data = await res.json();
    return { content: data.message?.content || '', provider: `ollama-${model}` };
  } catch (e: any) {
    return { content: '', error: `Ollama 连接失败: ${e.message || e}` };
  }
}

// 检查 Ollama 是否可用
export async function checkOllamaAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, {
      signal: (() => { const c = new AbortController(); setTimeout(() => c.abort(), 3000); return c.signal; })(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// 获取 Ollama 已安装的模型列表
export async function getOllamaModels(): Promise<string[]> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.models?.map((m: any) => m.name) || [];
  } catch {
    return [];
  }
}

async function selectOllamaModel(intent: 'writing' | 'vision' | 'chat'): Promise<string | null> {
  const installed = await getOllamaModels();
  if (!installed.length) return null;
  const preferred = intent === 'writing'
    ? OLLAMA_FALLBACKS.WRITING
    : intent === 'vision'
      ? OLLAMA_FALLBACKS.VISION
      : OLLAMA_FALLBACKS.CHAT;
  for (const model of preferred) {
    const match = installed.find(item => item === model || item.startsWith(model + ':'));
    if (match) return match;
  }
  if (intent === 'vision') return null;
  const generalModel = installed.find(item => !item.includes('embed') && !item.includes('moondream') && !item.includes('llava'));
  return generalModel || installed[0] || null;
}

// 智能路由：根据意图选择模型
export async function chatCompletion(
  messages: LLMMessage[],
  options?: {
    intent?: 'writing' | 'vision' | 'chat';
    images?: string[];
    forceLocal?: boolean;
  }
): Promise<LLMResponse> {
  const settings = await getSettings() as any;
  const intent = options?.intent || detectIntent(messages[messages.length - 1]?.content || '');
  
  // 检查 Ollama 是否可用
  const ollamaAvailable = await checkOllamaAvailable();
  
  if (ollamaAvailable) {
    const model = await selectOllamaModel(intent);
    
    if (model) {
      const result = await callOllama(
        model,
        messages,
        settings.temperature || 0.8,
        settings.maxTokens || 2048,
        options?.images
      );
      if (!result.error) return result;
    }
  }
  
  // 降级到 DeepSeek 云端
  if (options?.forceLocal) {
    return { content: '', error: ollamaAvailable ? '本地模型调用失败，已阻止云端兜底。' : '敏感内容仅使用本地模型。请先启动 Ollama 并安装可用模型。' };
  }
  if (!settings.apiKey) {
    return { 
      content: '', 
      error: ollamaAvailable 
        ? 'Ollama 模型调用失败' 
        : '未配置 API Key，且 Ollama 不可用。请在设置中配置。' 
    };
  }

  if (intent === 'vision') {
    return { content: '', error: '未找到可用的本地识图模型。请先安装 moondream 或 llava。' };
  }
  
  return callDeepSeek(
    settings.baseUrl,
    settings.apiKey,
    intent === 'writing' ? (settings.model || 'deepseek-chat') : (settings.chatModel || settings.model || 'deepseek-chat'),
    messages,
    settings.temperature || 0.7,
    settings.maxTokens || 4096
  );
}

// 调用 DeepSeek 云端
async function callDeepSeek(
  baseUrl: string, apiKey: string, model: string,
  messages: LLMMessage[], temperature: number, maxTokens: number
): Promise<LLMResponse> {
  const url = `${baseUrl}/v1/chat/completions`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ 
        model, messages, temperature, max_tokens: maxTokens, 
        stream: false, frequency_penalty: 0.3, presence_penalty: 0.3 
      }),
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

// 查询 DeepSeek 余额
export async function checkBalance(): Promise<{ balance?: number; currency?: string; error?: string }> {
  try {
    const settings = await getSettings();
    if (!settings || !settings.apiKey) return { error: '未配置 API Key' };
    const res = await fetch('https://api.deepseek.com/user/balance', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + settings.apiKey, 'Content-Type': 'application/json' },
    });
    if (!res || !res.ok) return { error: '网络请求失败' };
    const data = await res.json();
    if (!data) return { error: '返回数据为空' };
    const list = data.balance_infos;
    if (list && list.length > 0 && list[0]) {
      const bal = Number(list[0].total_balance);
      if (!isNaN(bal)) return { balance: bal, currency: list[0].currency || 'CNY' };
    }
    return { error: '无法解析余额' };
  } catch (e) {
    return { error: '查询出错' };
  }
}

export async function checkApiKey(): Promise<{ valid: boolean; error?: string; provider?: string }> {
  const settings = await getSettings() as any;

  if (!settings.apiKey) return { valid: false, error: 'DeepSeek API Key 未配置。本地模型状态请看 Ollama 区域。' };
  try {
    const result = await callDeepSeek(
      settings.baseUrl,
      settings.apiKey,
      settings.chatModel || settings.model || 'deepseek-chat',
      [
        { role: 'system', content: '回复ok' },
        { role: 'user', content: 'ping' },
      ],
      0.1,
      10
    );
    if (result.error) return { valid: false, error: result.error };
    return { valid: true, provider: settings.chatModel || settings.model || 'deepseek-chat' };
  } catch (e: any) {
    return { valid: false, error: e.message };
  }
}

// ========== 嵌入模型：语义搜索 ==========

const OLLAMA_EMBED_MODEL = 'nomic-embed-text';

export async function getEmbedding(text: string): Promise<number[] | null> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OLLAMA_EMBED_MODEL, prompt: text }),
      signal: (() => { const c = new AbortController(); setTimeout(() => c.abort(), 30000); return c.signal; })(),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.embedding || null;
  } catch {
    return null;
  }
}

// 余弦相似度
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// 语义搜索：在文本块中找到与 query 最相关的片段
export async function semanticSearch(
  query: string,
  chunks: { text: string; embedding?: number[] }[],
  topK: number = 3
): Promise<{ text: string; score: number }[]> {
  const queryEmbedding = await getEmbedding(query);
  if (!queryEmbedding) return chunks.slice(0, topK).map(c => ({ text: c.text, score: 0 }));

  const scored = await Promise.all(
    chunks.map(async (chunk) => {
      let embedding = chunk.embedding;
      if (!embedding) {
        embedding = (await getEmbedding(chunk.text)) || undefined;
      }
      if (!embedding) return { text: chunk.text, score: 0 };
      return { text: chunk.text, score: cosineSimilarity(queryEmbedding, embedding) };
    })
  );

  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}
