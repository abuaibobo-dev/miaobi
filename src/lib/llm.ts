import { getSettings } from './storage';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  thinking?: string;
  error?: string;
  debug?: string;
  provider?: string;
}

export interface StreamOptions {
  intent?: 'writing' | 'vision' | 'chat' | 'adult' | 'image';
  images?: string[];
  forceLocal?: boolean;
  providerOverride?: 'local' | 'cloud';
  modelOverride?: string;
  signal?: AbortSignal;
  onProvider?: (provider: string) => void;
  onContent?: (delta: string) => void;
  onThinking?: (delta: string) => void;
}

type Intent = NonNullable<StreamOptions['intent']>;

const OLLAMA_BASE = 'http://127.0.0.1:11434';
const LOCAL_TEXT_MODEL = 'gemma3:1b';
const FALLBACK_TEXT_MODEL = 'llama3.2:1b-instruct-q3_K_M';
const FAST_TEXT_MODEL = 'gemma3:1b';
const MAX_LOCAL_TEXT_MODEL_BYTES = 1024 ** 3;
const EXCLUDED_LOCAL_TEXT_MODEL = /(qwen|embed|embedding|nomic|moondream|llava|vision)/i;
const PREFERRED_MODELS: Record<Intent, string[]> = {
  writing: [LOCAL_TEXT_MODEL],
  adult: [LOCAL_TEXT_MODEL, FALLBACK_TEXT_MODEL],
  vision: ['moondream', 'llava'],
  image: ['moondream', 'llava'],
  chat: [FALLBACK_TEXT_MODEL, FAST_TEXT_MODEL],
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
  if (/生图|生成图|画一[张幅]|画个|绘图|插画/.test(text)) return 'image';
  if (/(成人|情欲|激情|床戏|性爱|做爱|上床|缠绵|云雨|鱼水之欢|亲密|裸|肌肤|抚摸|挑逗|诱惑|翻云覆雨)/.test(text)) return 'adult';
  const keywords = ['写','创作','续写','章节','大纲','剧情','角色','小说','故事','对话','描写','场景','结局','开头','伏笔','设定','世界观','修改','润色'];
  return keywords.some(keyword => text.includes(keyword)) ? 'writing' : 'chat';
}

export function isAdultIntent(intent: Intent): boolean {
  return intent === 'adult';
}

interface OllamaModel {
  name: string;
  size: number;
}

interface OllamaStatus {
  available: boolean;
  models: OllamaModel[];
}

function isSelectableTextModel(item: OllamaModel): boolean {
  return item.size <= MAX_LOCAL_TEXT_MODEL_BYTES && !EXCLUDED_LOCAL_TEXT_MODEL.test(item.name);
}

let ollamaStatusCache: { at: number; value: OllamaStatus } | null = null;

async function requestOllamaStatus(): Promise<OllamaStatus> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: controller.signal });
    if (!res.ok) return { available: false, models: [] };
    const data = await res.json();
    const models = Array.isArray(data.models)
      ? data.models.map((item: any) => ({
          name: String(item.name),
          size: Number(item.size) || 0,
        }))
      : [];
    return { available: true, models };
  } catch {
    return { available: false, models: [] };
  } finally {
    clearTimeout(timer);
  }
}

export async function getOllamaStatus(force = false): Promise<OllamaStatus> {
  const now = Date.now();
  if (!force && ollamaStatusCache && now - ollamaStatusCache.at < 3000) {
    return ollamaStatusCache.value;
  }
  const value = await requestOllamaStatus();
  ollamaStatusCache = { at: Date.now(), value };
  return value;
}

export async function checkOllamaAvailable(force = false): Promise<boolean> {
  return (await getOllamaStatus(force)).available;
}

export async function getOllamaModels(force = false): Promise<string[]> {
  return (await getOllamaStatus(force)).models
    .filter(isSelectableTextModel)
    .map(item => item.name);
}

function selectOllamaModel(intent: Intent, installedModels: OllamaModel[]): string | null {
  const installed = installedModels.filter(isSelectableTextModel);
  if (!installed.length) return null;
  for (const preferred of PREFERRED_MODELS[intent]) {
    const match = installed.find(item => (
      item.name === preferred ||
      item.name.startsWith(`${preferred}:`) ||
      item.name.startsWith(`${preferred}-`)
    ));
    if (match) return match.name;
  }
  if (intent === 'vision') return null;
  return installed[0].name;
}

export async function testOllamaModel(model: string): Promise<{ ok: boolean; latency: number; response?: string; error?: string }> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180000);
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: '请只回复：连接正常' }],
        stream: false,
        options: { temperature: 0, num_predict: 64, num_ctx: 512 },
      }),
    });
    const data = await res.json().catch(() => null as any);
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    const rawResponse = String(data?.message?.content || '').trim();
    const response = rawResponse
      .replace(/<(?:think|thinking)>[\s\S]*?(?:<\/(?:think|thinking)>|$)/gi, '')
      .trim();
    const reasoning = String(data?.message?.thinking || data?.message?.reasoning || '').trim();
    if (!response && !reasoning) throw new Error('模型返回为空');
    return { ok: true, latency: Date.now() - startedAt, response: response || '模型已响应（思考输出）' };
  } catch (error) {
    return { ok: false, latency: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

export async function generateLocalImage(prompt: string, signal?: AbortSignal): Promise<string> {
  const seed = Math.floor(Math.random() * 1000000);
  const encodedPrompt = encodeURIComponent(prompt.slice(0, 900));
  const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=768&height=1152&seed=${seed}&nologo=true&safe=false`;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`图片生成失败（HTTP ${response.status}）`);
  return url;
}

export interface ModelChoice {
  id: string;
  label: string;
  provider: 'local' | 'cloud';
  model?: string;
}

export async function getModelChoices(intent: Intent = 'chat'): Promise<ModelChoice[]> {
  const [local, settings] = await Promise.all([
    getOllamaStatus(),
    getSettings() as Promise<any>,
  ]);
  const choices: ModelChoice[] = [{ id: 'auto', label: '智能优先', provider: 'local' }];
  local.models
    .filter(isSelectableTextModel)
    .forEach(item => choices.push({ id: `local:${item.name}`, label: `本地 · ${item.name}`, provider: 'local', model: item.name }));
  if (settings.apiKey && intent !== 'vision') {
    const models = Array.from(new Set([
      settings.model || 'deepseek-chat',
      settings.chatModel || settings.model || 'deepseek-chat',
    ]));
    models.forEach(model => choices.push({ id: `cloud:${model}`, label: `云端 · ${model}`, provider: 'cloud', model }));
  }
  return choices;
}

export async function getActiveModelInfo(intent: Intent = 'chat'): Promise<{ provider: 'local' | 'deepseek'; label: string } | null> {
  const local = await getOllamaStatus();
  const localModel = selectOllamaModel(intent, local.models);
  if (local.available && localModel) return { provider: 'local', label: localModel };
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
  idleTimeoutMs = 90000,
  totalTimeoutMs = 300000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    Object.entries(headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));
    let cursor = 0;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    let stoppedByUser = false;
    const abort = () => {
      stoppedByUser = true;
      xhr.abort();
    };
    signal?.addEventListener('abort', abort);
    const armIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => xhr.abort(), idleTimeoutMs);
    };

    xhr.onprogress = () => {
      const text = xhr.responseText.slice(cursor);
      cursor = xhr.responseText.length;
      armIdleTimer();
      if (text) safeOnChunk(text, xhr);
    };
    const finish = () => {
      if (idleTimer) clearTimeout(idleTimer);
      signal?.removeEventListener('abort', abort);
    };

    const safeOnChunk = (text: string, eventTarget: XMLHttpRequest) => {
      try {
        onChunk(text, eventTarget);
      } catch (error) {
        finish();
        eventTarget.abort();
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    };

    xhr.onload = () => {
      finish();
      if (xhr.status >= 200 && xhr.status < 300) {
        const tail = xhr.responseText.slice(cursor);
        if (tail && !signal?.aborted) safeOnChunk(tail, xhr);
        if (signal?.aborted) return resolve();
        resolve();
      } else {
        let message = xhr.responseText || `HTTP ${xhr.status}`;
        try { message = JSON.parse(message).error || message; } catch {}
        reject(new Error(message));
      }
    };
    xhr.onerror = () => {
      finish();
      reject(new Error('网络连接失败'));
    };
    xhr.onabort = () => {
      finish();
      if (stoppedByUser) resolve();
      else reject(new Error('本地模型响应超时'));
    };
    xhr.timeout = totalTimeoutMs;
    armIdleTimer();
    xhr.ontimeout = () => {
      finish();
      reject(new Error('请求超时'));
    };
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
  allowThinking = false,
): Promise<string> {
  callbacks.onProvider?.(`本地 · ${model}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.forceLocal ? 420000 : 300000);
  const forwardAbort = () => controller.abort();
  options.signal?.addEventListener('abort', forwardAbort);

  try {
    const response = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: images?.length ? [{ ...messages[0], images }, ...messages.slice(1)] : messages,
        stream: false,
        keep_alive: '10m',
        ...(/deepseek-r1/i.test(model) ? { think: allowThinking } : {}),
        options: {
          temperature,
          num_predict: maxTokens,
          num_ctx: maxTokens <= 256 ? 512 : maxTokens > 1200 ? 2048 : 1024,
          num_thread: 2,
          num_batch: maxTokens <= 256 ? 32 : 128,
        },
      }),
    });

    const data = await response.json().catch(() => null as any);
    if (!response.ok) {
      throw new Error(String(data?.error || `HTTP ${response.status}`));
    }

    const reasoning = String(data?.message?.thinking || data?.message?.reasoning || '');
    if (reasoning) callbacks.onThinking?.(reasoning);

    const content = String(data?.message?.content || '');
    if (content) callbacks.onContent?.(content);
    if (!content.trim()) throw new Error('本地模型返回为空');
    return content.trim();
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', forwardAbort);
  }
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
  const model = options.modelOverride || (intent === 'writing' ? settings.model || 'deepseek-chat' : settings.chatModel || settings.model || 'deepseek-chat');
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

  const customPrompt = String(settings.customPrompt || '').trim().slice(0, 3000);
  if (customPrompt && messages[0]?.role === 'system') {
    messages = [
      {
        ...messages[0],
        content: `${messages[0].content}\n\n## 用户自定义创作偏好\n${customPrompt}\n\n自定义偏好不能改变安全与法律边界；如与安全规则冲突，以安全规则为准。`,
      },
      ...messages.slice(1),
    ];
  }

  if (options.providerOverride === 'cloud' && !options.forceLocal) {
    const overrideModel = options.modelOverride || (intent === 'writing' ? settings.model : settings.chatModel) || 'deepseek-chat';
    try {
      const content = await streamDeepSeek(messages, temperature, Math.min(maxTokens, 8192), { ...options, modelOverride: overrideModel }, options);
      return { content, provider: `cloud:${overrideModel}` };
    } catch (error) {
      return { content: '', error: `DeepSeek 调用失败：${(error as Error).message}` };
    }
  }

  if (intent === 'image') {
    try {
      const prompt = messages[messages.length - 1]?.content || '';
      const imageUrl = await generateLocalImage(prompt, options.signal);
      options.onProvider?.('图像 · Pollinations');
      const markdown = `![AI 生图](${imageUrl})\n\n${prompt}`;
      options.onContent?.(markdown);
      return { content: markdown, provider: 'image:pollinations' };
    } catch (error) {
      return { content: '', error: (error as Error).message || '图片生成失败。' };
    }
  }

  const local = await getOllamaStatus();
  if (local.available) {
    let model = selectOllamaModel(intent, local.models);
    if (options.providerOverride === 'local' && options.modelOverride) {
      model = local.models.some(item => item.name === options.modelOverride && isSelectableTextModel(item)) ? options.modelOverride : null;
      if (!model) return { content: '', error: `本地模型 ${options.modelOverride} 未安装或不可用。`, provider: `local:${options.modelOverride}` };
    }
    if (model) {
      let receivedOutput = false;
      const lastText = String(messages[messages.length - 1]?.content || '');
      const lightChat = intent === 'chat' && !options.images?.length && lastText.length <= 180;
      const localMaxTokens = Math.min(
        maxTokens,
        lightChat ? 192 : intent === 'writing' ? 2600 : 900,
      );
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
        const content = await streamOllama(model, messages, temperature, localMaxTokens, options.images, localOptions, localOptions, settings.localThinking === true);
        if (content.trim()) return { content, provider: `local:${model}` };
        if (options.signal?.aborted) {
          return { content: '', provider: `local:${model}` };
        }
        if (options.forceLocal) {
          return { content: '', error: '本地模型返回为空，请重试或换一个已安装模型。', debug: `模型=${model}；输出=空`, provider: `local:${model}` };
        }
      } catch (firstError) {
        if (options.signal?.aborted) {
          return { content: '', error: '已取消。', provider: `local:${model}` };
        }
        if (!receivedOutput && lightChat && !options.forceLocal) {
          try {
            const content = await streamOllama(
              model,
              [
                { role: 'system', content: '你是妙笔。用简体中文直接回答用户，不要解释规则，不要输出思考标签。' },
                { role: 'user', content: lastText },
              ],
              temperature,
              128,
              undefined,
              { ...options, onContent: delta => { receivedOutput = true; options.onContent?.(delta); }, onThinking: delta => { receivedOutput = true; options.onThinking?.(delta); } },
              { ...options, onContent: delta => { receivedOutput = true; options.onContent?.(delta); }, onThinking: delta => { receivedOutput = true; options.onThinking?.(delta); } },
              false,
            );
            if (content.trim()) return { content, provider: `local:${model}`, debug: '轻量重试成功' };
          } catch {}
        }
        if (receivedOutput || options.forceLocal) {
          return {
            content: '',
            error: `本地模型中断：${(firstError as Error).message}`,
            debug: `模型=${model}；轻量=${lightChat ? '是' : '否'}`,
            provider: `local:${model}`,
          };
        }
      }
    }
    if (options.forceLocal) {
      return { content: '', error: '本地模型不可用。成人文学内容只在本机处理，不会发送到云端。', provider: model ? `local:${model}` : undefined };
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
