/**
 * 妙笔 Agent Engine
 * 基于 Pi Agent Architecture (earendil-works/pi)
 * 直接嵌入 React Native，无需 Termux
 */

import { chatCompletion, detectIntent } from './llm';

export interface AgentTool {
  name: string;
  description: string;
  params: string[];
  execute: (params: Record<string, string>) => Promise<any>;
}

export interface AgentSession {
  id: string;
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  toolsUsed: { tool: string; params: any; result: any }[];
  stepCount: number;
}

const MAX_STEPS = 6;

const SYSTEM_PROMPT = `你是妙笔AI Agent。你可以使用工具来帮助用户。

当你需要调用工具时，在回复中包含：
{"tool_call":{"name":"工具名","params":{"参数":"值"}}}

可用工具：
- web_search: 搜索网页 {"query":"关键词"}
- search_books: 搜索书籍 {"query":"书名"}
- save_memory: 保存记忆 {"key":"键","value":"值"}
- load_memory: 读取记忆 {"key":"键"}

规则：
- 每次只调用一个工具
- 不需要工具时直接回复
- 用简体中文
- 先思考再行动`;

// 工具注册表
const tools: Record<string, AgentTool> = {
  web_search: {
    name: 'web_search',
    description: '搜索网页',
    params: ['query'],
    execute: async (params) => {
      try {
        const query = encodeURIComponent(params.query);
        const res = await fetch(`https://html.duckduckgo.com/html/?q=${query}`, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        const html = await res.text();
        const results: { title: string; url: string }[] = [];
        const regex = /class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
        let match;
        while ((match = regex.exec(html)) !== null && results.length < 5) {
          results.push({
            title: match[2].replace(/<[^>]*>/g, '').trim(),
            url: match[1],
          });
        }
        return results.length ? results : { message: '未找到结果' };
      } catch (e) {
        return { error: '搜索失败' };
      }
    },
  },
  search_books: {
    name: 'search_books',
    description: '搜索书籍',
    params: ['query'],
    execute: async (params) => {
      try {
        const query = encodeURIComponent(params.query);
        const res = await fetch(`https://openlibrary.org/search.json?q=${query}&limit=5`);
        const data = await res.json();
        if (data?.docs) {
          return data.docs.slice(0, 5).map((b: any) => ({
            title: b.title,
            author: b.author_name?.join(', ') || '未知',
            year: b.first_publish_year || '未知',
          }));
        }
        return { message: '未找到' };
      } catch {
        return { error: '搜索失败' };
      }
    },
  },
  save_memory: {
    name: 'save_memory',
    description: '保存记忆',
    params: ['key', 'value'],
    execute: async (params) => {
      try {
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        const key = `agent_mem_${params.key}`;
        await AsyncStorage.setItem(key, JSON.stringify({ value: params.value, time: Date.now() }));
        return { success: true };
      } catch {
        return { error: '保存失败' };
      }
    },
  },
  load_memory: {
    name: 'load_memory',
    description: '读取记忆',
    params: ['key'],
    execute: async (params) => {
      try {
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        const key = `agent_mem_${params.key}`;
        const raw = await AsyncStorage.getItem(key);
        return raw ? JSON.parse(raw) : { value: null };
      } catch {
        return { error: '读取失败' };
      }
    },
  },
};

// 创建会话
export function createAgentSession(id?: string): AgentSession {
  return {
    id: id || Date.now().toString(36),
    messages: [{ role: 'system', content: SYSTEM_PROMPT }],
    toolsUsed: [],
    stepCount: 0,
  };
}

// 提取工具调用
function extractToolCall(text: string): { name: string; params: Record<string, string> } | null {
  try {
    const match = text.match(/\{"tool_call":\s*(\{[\s\S]*?\})\}/);
    if (match) {
      const parsed = JSON.parse(match[1]);
      if (parsed.name && tools[parsed.name]) {
        return { name: parsed.name, params: parsed.params || {} };
      }
    }
  } catch {}
  return null;
}

// 执行Agent任务
export async function agentExecute(
  session: AgentSession,
  userMessage: string,
  options?: {
    onStep?: (step: number) => void;
    onToolCall?: (tool: string) => void;
    onContent?: (delta: string) => void;
    onThinking?: (delta: string) => void;
    signal?: AbortSignal;
    providerOverride?: 'local' | 'cloud';
    modelOverride?: string;
    intent?: 'writing' | 'vision' | 'chat' | 'adult' | 'image';
  }
): Promise<{ reply: string; steps: number; toolsUsed: number; provider?: string }> {
  session.messages.push({ role: 'user', content: userMessage });
  session.stepCount = 0;

  while (session.stepCount < MAX_STEPS) {
    if (options?.signal?.aborted) break;
    session.stepCount++;
    options?.onStep?.(session.stepCount);

      
      // Adult + Writing: bypass agent engine, use clean messages
      const intent = options?.intent || detectIntent(userMessage);
      let result;
      if (intent === 'adult' || intent === 'writing') {
        const historyClean = session.messages
          .filter(m => m.role !== 'system' || !/Agent/i.test(m.content))
          .slice(-10);
        result = await chatCompletion(
          historyClean,
          { intent, onContent: options?.onContent, onThinking: options?.onThinking, providerOverride: options?.providerOverride, modelOverride: options?.modelOverride },
          options?.signal,
        );
      } else {
        result = await chatCompletion(
          session.messages.map(m => ({ role: m.role, content: m.content })),
          { intent, onContent: options?.onContent, onThinking: options?.onThinking, providerOverride: options?.providerOverride, modelOverride: options?.modelOverride },
          options?.signal,
        );
      }

    const content = result.content || result.error || '';
    
    const toolCall = extractToolCall(content);
    if (toolCall) {
      options?.onToolCall?.(toolCall.name);
      const tool = tools[toolCall.name];
      const toolResult = await tool.execute(toolCall.params);
      session.toolsUsed.push({ tool: toolCall.name, params: toolCall.params, result: toolResult });
      session.messages.push({ role: 'assistant', content });
      session.messages.push({ role: 'user', content: `工具结果：${JSON.stringify(toolResult)}` });
      continue;
    }

    session.messages.push({ role: 'assistant', content });
    return { reply: content, steps: session.stepCount, toolsUsed: session.toolsUsed.length, provider: result.provider };
  }

  return { reply: '任务执行步数已达上限', steps: session.stepCount, toolsUsed: session.toolsUsed.length };
}
