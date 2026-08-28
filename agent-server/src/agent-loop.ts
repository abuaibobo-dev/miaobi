/**
 * Agent Loop - Pi Agent 核心架构
 * 多步推理循环：LLM调用 → 工具执行 → 结果反馈 → 继续推理
 */

import { ToolSystem } from './tool-system.ts';

interface AgentConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxSteps?: number;
}

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface AgentSession {
  id: string;
  messages: Message[];
  toolsUsed: any[];
  createdAt: string;
}

interface StreamCallbacks {
  signal?: AbortSignal;
  onContent?: (delta: string) => void;
  onThinking?: (delta: string) => void;
  onToolCall?: (tool: any) => void;
  onToolResult?: (result: any) => void;
}

function extractToolCall(text: string): { name: string; params: Record<string, any> } | null {
  const start = text.indexOf('{"tool_call"');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  let end = -1;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') inStr = !inStr;
    if (inStr) continue;
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) return null;
  try {
    const obj = JSON.parse(text.slice(start, end + 1));
    if (obj.tool_call?.name) {
      return { name: String(obj.tool_call.name), params: obj.tool_call.params || {} };
    }
  } catch {}
  return null;
}

export class AgentLoop {
  private config: AgentConfig;
  private systemPrompt = `你是妙笔AI Agent。你拥有工具调用能力，可以搜索网页、搜索书籍、读写记忆。

当你需要使用工具时，在回复中包含以下JSON：
{"tool_call": {"name": "工具名", "params": {"参数": "值"}}}

可用工具：
- web_search: 搜索网页 {"query": "关键词"}
- search_books: 搜索书籍 {"query": "书名"}
- fetch_page: 获取网页 {"url": "URL"}
- save_memory: 保存记忆 {"key": "键", "value": "值"}
- load_memory: 读取记忆 {"key": "键"}

规则：
- 用简体中文回复
- 每次只调用一个工具
- 如果不需要工具，直接回复
- 先思考再行动`;

  constructor(config: AgentConfig) {
    this.config = { ...config, maxSteps: config.maxSteps || 8 };
  }

  async chat(messages: Message[]): Promise<string> {
    const full: Message[] = [{ role: 'system', content: this.systemPrompt }, ...messages];
    return this.callLLM(full);
  }

  async execute(session: AgentSession, userMessage: string): Promise<any> {    session.messages.push({ role: 'user', content: userMessage });
    
    let steps = 0;
    let finalReply = '';

    while (steps < this.config.maxSteps) {
      steps++;
      
      const response = await this.callLLM(session.messages);
      
      // 检查工具调用
      const toolCall = extractToolCall(response);
      if (toolCall) {
        const tool = ToolSystem.get(toolCall.name);
        if (tool) {
          const result = await tool.execute(toolCall.params || {});
          session.toolsUsed.push({ tool: toolCall.name, params: toolCall.params, result });
          session.messages.push({ role: 'assistant', content: response });
          session.messages.push({ role: 'user', content: `工具 ${toolCall.name} 执行结果：${JSON.stringify(result)}` });
          continue;
        }
      }

      finalReply = response;
      session.messages.push({ role: 'assistant', content: response });
      break;
    }

    return { reply: finalReply, steps, toolsUsed: session.toolsUsed.length };
  }

  async executeStream(session: AgentSession, userMessage: string, callbacks: StreamCallbacks): Promise<void> {
    session.messages.push({ role: 'user', content: userMessage });

    // 流式调用LLM
    let content = '';
    await this.streamLLM(session.messages, callbacks.signal, (delta) => {
      content += delta;
      callbacks.onContent?.(delta);
    }, callbacks.onThinking);

    // 检查工具调用
    const toolCall = extractToolCall(content);
    if (toolCall) {
      callbacks.onToolCall?.(toolCall);
      const tool = ToolSystem.get(toolCall.name);
      if (tool) {
        const result = await tool.execute(toolCall.params || {});
        callbacks.onToolResult?.(result);
        session.toolsUsed.push({ tool: toolCall.name, params: toolCall.params, result });
        session.messages.push({ role: 'assistant', content });
        session.messages.push({ role: 'user', content: `工具 ${toolCall.name} 结果：${JSON.stringify(result)}` });
        
        // 工具执行后再调一次LLM生成最终回复
        const finalContent = await this.callLLM(session.messages);
        callbacks.onContent?.(finalContent);
        session.messages.push({ role: 'assistant', content: finalContent });
        return;
      }
    }

    session.messages.push({ role: 'assistant', content });
  }

  private async callLLM(messages: Message[]): Promise<string> {
    const res = await fetch(`${this.config.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.config.apiKey}` },
      body: JSON.stringify({ model: this.config.model, messages, temperature: 0.7, max_tokens: 4096 }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) throw new Error(`LLM请求失败(${res.status})`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  private async streamLLM(messages: Message[], signal: AbortSignal | undefined, onContent: (d: string) => void, onThinking?: (d: string) => void): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    const forwardAbort = () => controller.abort();
    signal?.addEventListener('abort', forwardAbort);
    try {
      const res = await fetch(`${this.config.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.config.apiKey}` },
        body: JSON.stringify({ model: this.config.model, messages, temperature: 0.7, max_tokens: 4096, stream: true }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(`LLM流式请求失败(${res.status})`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true }).replace(/\r/g, '');
        const parts = buf.split('\n\n');
        buf = parts.pop() || '';
        for (const part of parts) {
          for (const line of part.split('\n')) {
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;
            try {
              const data = JSON.parse(payload);
              const delta = data.choices?.[0]?.delta;
              if (delta?.content) onContent(delta.content);
              if (delta?.reasoning_content) onThinking?.(delta.reasoning_content);
            } catch {}
          }
        }
      }
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', forwardAbort);
    }
  }
}
