import { getSettings } from './storage';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  thinking?: string;
  error?: string;
  provider?: string;
}

export interface StreamOptions {
  intent?: 'writing' | 'vision' | 'chat';
  images?: string[];
  forceLocal?: boolean;
  signal?: AbortSignal;
  onProvider?: (provider: string) => void;
  onContent?: (delta: string) => void;
  onThinking?: (delta: string) => void;
}

type Intent = NonNullable<StreamOptions['intent']>;

const OLLAMA_BASE = 'http://127.0.0.1:11434';
const PREFERRED_MODELS: Record<Intent, string[]> = {
  writing: ['qwen3:1.7b', 'dqnwrite', 'deepseek-r1:1.7b', 'qwen2.5:1.5b'],
  vision: ['moondream', 'llava'],
  chat: ['qwen2.5:1.5b', 'qwen3:1.7b', 'deepseek-r1:1.7b'],
};

function withTimeout(signal: AbortSignal | undefined, milliseconds: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), milliseconds);
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort);
  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    },
  };
}

export function detectIntent(text: string, hasImage?: boolean): Intent {
  if (hasImage) return 'vision';
  const keywords = ['写','创作','续写','章节','大纲','剧情','角色','小说','故事','对话','描写','场景','结局','开头','伏笔','设定','世界观','修改','润色'];
  return keywords.some(keyword => text.includes(keyword)) ? 'writing' : 'chat';
}

export async function checkOllamaAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: withTimeout(undefined, 2500).signal });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getOllamaModels(): Promise<string[]> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: withTimeout(undefined, 4000).signal });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.models) ? data.models.map((item: any) => String(item.name)) : [];
  } catch {
    return [];
  }
}

async function selectOllamaModel(intent: Intent): Promise<string | null> {
  const installed = await getOllamaModels();
  if (!installed.length) return null;
  for (const preferred of PREFERRED_MODELS[intent]) {
    const match = installed.find(item => item === preferred || item.startsWith(`${preferred}:`));
    if (match) return match;
  }
  if (intent === 'vision') return null;
  return installed.find(item => !/embed|moondream|llava/i.test(item)) || installed[0];
}

export async function getActiveModelInfo(intent: Intent = 'chat'): Promise<{ provider: 'local' | 'deepseek'; label: string } | null> {
  const localModel = await selectOllamaModel(intent);
  if (localModel && await checkOllamaAvailable()) return { provider: 'local', label: localModel };
  const settings = await getSettings() as any;
  if (settings.apiKey && intent !== 'vision') {
    const model = intent === 'writing' ? settings.model || 'deepseek-chat' : settings.chatModel || settings.model || 'deepseek-chat';
    return { provider: 'deepseek', label: model };
  }
  return null;
}

function xhrStream(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  onChunk: (text: string, xhr: XMLHttpRequest) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    Object.entries(headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));
    let cursor = 0;

    const abort = () => xhr.abort();
    signal?.addEventListener('abort', abort);

    xhr.onprogress = () => {
      const text = xhr.responseText.slice(cursor);
      cursor = xhr.responseText.length;
      if (text) onChunk(text, xhr);
    };
    xhr.onload = () => {
      signal?.removeEventListener('abort', abort);
      if (xhr.status >= 200 && xhr.status < 300) {
        const tail = xhr.responseText.slice(cursor);
        if (tail) onChunk(tail, xhr);
        resolve();
      } else {
        let message = xhr.responseText || `HTTP ${xhr.status}`;
        try { message = JSON.parse(message).error || message; } catch {}
        reject(new Error(message));
      }
    };
    xhr.onerror = () => {
      signal?.removeEventListener('abort', abort);
      reject(new Error('网络连接失败'));
    };
    xhr.onabort = () => {
      signal?.removeEventListener('abort', abort);
      resolve();
    };
    xhr.timeout = 180000;
    xhr.ontimeout = () => reject(new Error('请求超时'));
    xhr.send(JSON.stringify(body));
  });
}

async function streamOllama(
  model: string,
  messages: LLMMessage[],
  temperature: number,
  maxTokens: number,
  images: string[] | undefined,
  options: StreamOptions,
  callbacks: Pick<StreamOptions, 'onProvider' | 'onContent' | 'onThinking'>,
): Promise<string> {
  let content = '';
  let buffer = '';
  callbacks.onProvider?.(`本地 · ${model}`);
  await xhrStream(
    `${OLLAMA_BASE}/api/chat`,
    {},
    {
      model,
      messages: images?.length ? [{ ...messages[0], images }, ...messages.slice(1)] : messages,
      stream: true,
      options: { temperature, num_predict: maxTokens },
    },
    chunk => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          if (data.error) throw new Error(data.error);
          const reasoning = data.message?.thinking || data.message?.reasoning || '';
          if (reasoning) options.onThinking?.(reasoning);
          const delta = data.message?.content || '';
          if (delta) {
            content += delta;
            options.onContent?.(delta);
          }
        } catch (error) {
          if ((error as Error).message !== 'Unexpected end of JSON input') throw error;
        }
      }
    },
    options.signal,
  );
  return content;
}

async function streamDeepSeek(
  messages: LLMMessage[],
  temperature: number,
  maxTokens: number,
  options: StreamOptions,
  callbacks: Pick<StreamOptions, 'onProvider' | 'onContent' | 'onThinking'>,
): Promise<string> {
  const settings = await getSettings() as any;
  const intent = options.intent || detectIntent(messages[messages.length - 1]?.content || '');
  const model = intent === 'writing' ? settings.model || 'deepseek-chat' : settings.chatModel || settings.model || 'deepseek-chat';
  callbacks.onProvider?.(`云端 · ${model}`);

  let content = '';
  let buffer = '';
  await xhrStream(
    `${settings.baseUrl}/v1/chat/completions`,
    { Authorization: `Bearer ${settings.apiKey}` },
    { model, messages, temperature, max_tokens: maxTokens, stream: true, frequency_penalty: 0.3, presence_penalty: 0.3 },
    chunk => {
      buffer += chunk.replace(/\r/g, '');
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';
      for (const part of parts) {
        for (const line of part.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const data = JSON.parse(payload);
            const delta = data.choices?.[0]?.delta || {};
            const reasoning = delta.reasoning_content || delta.reasoning || '';
            if (reasoning) {
              options.onThinking?.(reasoning);
            }
            if (delta.content) {
              content += delta.content;
              options.onContent?.(delta.content);
            }
          } catch {}
        }
      }
    },
    options.signal,
  );
  return content;
}

export async function streamChatCompletion(messages: LLMMessage[], options: StreamOptions = {}): Promise<LLMResponse> {
  const settings = await getSettings() as any;
  const intent = options.intent || detectIntent(messages[messages.length - 1]?.content || '');
  const temperature = settings.temperature ?? 0.8;
  const maxTokens = settings.maxTokens ?? 4096;

  if (await checkOllamaAvailable()) {
    const model = await selectOllamaModel(intent);
    if (model) {
      let receivedOutput = false;
      const localOptions: StreamOptions = {
        ...options,
        onContent: delta => {
          receivedOutput = true;
          options.onContent?.(delta);
        },
        onThinking: delta => {
          receivedOutput = true;
          options.onThinking?.(delta);
        },
      };
      try {
        const content = await streamOllama(model, messages, temperature, maxTokens, options.images, localOptions, localOptions);
        if (content.trim()) return { content, provider: `local:${model}` };
        if (options.forceLocal) {
          return { content: '', error: '本地模型返回为空，请重试或换一个已安装模型。', provider: `local:${model}` };
        }
      } catch (error) {
        if (receivedOutput || options.forceLocal) {
          return { content: '', error: `本地模型中断：${(error as Error).message}`, provider: `local:${model}` };
        }
      }
    }
    if (options.forceLocal) {
      return { content: '', error: '本地模型不可用。成人文学内容只在本机处理，不会发送到云端。' };
    }
  } else if (options.forceLocal) {
    return { content: '', error: 'Ollama 未运行。成人文学内容只在本机处理，请先启动本地模型。' };
  }

  if (!settings.apiKey) return { content: '', error: '本地模型不可用，且未配置 DeepSeek API Key。' };
  if (intent === 'vision') return { content: '', error: '识图需要本地视觉模型，例如 moondream 或 llava。' };

  try {
    const content = await streamDeepSeek(messages, temperature, maxTokens, options, options);
    return { content, provider: `cloud:${options.intent === 'writing' ? settings.model || 'deepseek-chat' : settings.chatModel || settings.model || 'deepseek-chat'}` };
  } catch (error) {
    return { content: '', error: `DeepSeek 调用失败：${(error as Error).message}` };
  }
}

export async function chatCompletion(messages: LLMMessage[], options: Omit<StreamOptions, 'signal'> = {}): Promise<LLMResponse> {
  return streamChatCompletion(messages, options);
}

export async function checkBalance(): Promise<{ balance?: number; currency?: string; error?: string }> {
  try {
    const settings = await getSettings() as any;
    if (!settings.apiKey) return { error: '未配置 API Key' };
    const res = await fetch('https://api.deepseek.com/user/balance', {
      method: 'GET',
      headers: { Authorization: `Bearer ${settings.apiKey}` },
      signal: withTimeout(undefined, 12000).signal,
    });
    if (!res.ok) return { error: `查询失败（${res.status}）` };
    const data = await res.json();
    const item = data.balance_infos?.[0];
    const balance = Number(item?.total_balance);
    if (Number.isFinite(balance)) return { balance, currency: item.currency || 'CNY' };
    return { error: '无法解析余额' };
  } catch {
    return { error: '查询超时或网络异常' };
  }
}

export async function checkApiKey(): Promise<{ valid: boolean; error?: string; provider?: string }> {
  const info = await getActiveModelInfo('chat');
  if (!info) return { valid: false, error: '本地模型和 DeepSeek 均不可用' };
  if (info.provider === 'local') return { valid: true, provider: info.label };
  const settings = await getSettings() as any;
  try {
    const result = await streamChatCompletion(
      [{ role: 'user', content: 'ping' }],
      { intent: 'chat', onProvider: () => {} },
    );
    if (result.error) return { valid: false, error: result.error };
    return { valid: true, provider: settings.chatModel || settings.model || 'deepseek-chat' };
  } catch (error) {
    return { valid: false, error: (error as Error).message };
  }
}

export async function getEmbedding(text: string): Promise<number[] | null> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'nomic-embed-text', prompt: text }),
      signal: withTimeout(undefined, 30000).signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.embedding || null;
  } catch {
    return null;
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  a.forEach((value, index) => {
    dot += value * b[index];
    normA += value ** 2;
    normB += b[index] ** 2;
  });
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function semanticSearch(query: string, chunks: { text: string; embedding?: number[] }[], topK = 3) {
  const queryEmbedding = await getEmbedding(query);
  if (!queryEmbedding) return chunks.slice(0, topK).map(chunk => ({ text: chunk.text, score: 0 }));
  const scored = [];
  for (const chunk of chunks) {
    const embedding = chunk.embedding || await getEmbedding(chunk.text) || undefined;
    scored.push({ text: chunk.text, score: embedding ? cosineSimilarity(queryEmbedding, embedding) : 0 });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}
