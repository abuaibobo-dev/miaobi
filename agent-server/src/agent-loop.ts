/**
 * Agent Loop - Pi Agent 核心架构
 * 多步推理循环：LLM调用 → 工具执行 → 结果反馈 → 继续推理
 */

import { ToolSystem } from './tool-system';

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

export class AgentLoop {
  private config: AgentConfig;
  private systemPrompt = `你是妙笔AI Agent。你拥有工具调用能力，可以搜索、读写文件、执行命令。

当你需要使用工具时，在回复中包含以下JSON：
{"tool_call": {"name": "工具名", "params": {"参数": "值"}}}

可用工具：
- web_search: 搜索网页 {"query": "关键词"}
- search_books: 搜索书籍 {"query": "书名"}
- read_file: 读取文件 {"path": "路径"}
- write_file: 写入文件 {"path": "路径", "content": "内容"}
- list_files: 列出目录 {"path": "路径"}
- shell_exec: 执行命令 {"command": "命令"}
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

  async execute(session: AgentSession, userMessage: string): Promise<any> {
    session.messages.push({ role: 'user', content: userMessage });
    
    let steps = 0;
    let finalReply = '';

    while (steps < this.config.maxSteps) {
      steps++;
      
      const response = await this.callLLM(session.messages);
      
      // 检查工具调用
      const toolMatch = response.match(/\{"tool_call":\s*(\{[^}]+\})\}/);
      if (toolMatch) {
        try {
          const toolCall = JSON.parse(toolMatch[1]);
          const tool = ToolSystem.get(toolCall.name);
          if (tool) {
            const result = await tool.execute(toolCall.params || {});
            session.toolsUsed.push({ tool: toolCall.name, params: toolCall.params, result });
            session.messages.push({ role: 'assistant', content: response });
            session.messages.push({ role: 'user', content: `工具 ${toolCall.name} 执行结果：${JSON.stringify(result)}` });
            continue;
          }
        } catch {}
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
    const toolMatch = content.match(/\{"tool_call":\s*(\{[^}]+\})\}/);
    if (toolMatch) {
      try {
        const toolCall = JSON.parse(toolMatch[1]);
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
      } catch {}
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
    return new Promise((resolve, reject) => {
      const https = require('https');
      const url = new URL(`${this.config.baseUrl}/v1/chat/completions`);
      const req = https.request({
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.config.apiKey}` },
      }, (res: any) => {
        let buf = '';
        res.on('data', (chunk: Buffer) => {
          buf += chunk.toString();
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
        });
        res.on('end', resolve);
      });
      req.on('error', reject);
      req.setTimeout(60000, () => { req.destroy(); reject(new Error('timeout')); });
      if (signal) signal.addEventListener('abort', () => req.destroy());
      req.write(JSON.stringify({ model: this.config.model, messages, temperature: 0.7, max_tokens: 4096, stream: true }));
      req.end();
    });
  }
}
