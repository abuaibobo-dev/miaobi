/**
 * 妙笔 Agent Server
 * 基于 Pi Agent Architecture (earendil-works/pi)
 * 安全加固：仅监听 127.0.0.1；设置 AGENT_TOKEN 后强制 Bearer 认证。
 */

import express from 'express';
import cors from 'cors';
import { AgentLoop } from './agent-loop.ts';
import { ToolSystem } from './tool-system.ts';
import { SessionManager } from './session-manager.ts';

const PORT = parseInt(process.env.PORT || '3456');
const TOKEN = process.env.AGENT_TOKEN || '';
const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// 认证中间件：未设置 AGENT_TOKEN 时仅依赖 127.0.0.1 绑定
app.use('/api', (req, res, next) => {
  if (!TOKEN) return next();
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${TOKEN}`) {
    return res.status(401).json({ error: '未授权' });
  }
  next();
});

let agentLoop: AgentLoop | null = null;
const sessionManager = new SessionManager();

app.post('/api/init', (req, res) => {
  const { apiKey, baseUrl, model } = req.body;
  if (!apiKey) return res.status(400).json({ error: '需要 API Key' });
  agentLoop = new AgentLoop({ apiKey, baseUrl: baseUrl || 'https://api.deepseek.com', model: model || 'deepseek-chat' });
  res.json({ ok: true, tools: ToolSystem.list().length });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', agent: !!agentLoop, tools: ToolSystem.list().length, sessions: sessionManager.count() });
});

app.get('/api/tools', (_req, res) => {
  res.json(ToolSystem.list());
});

app.post('/api/session', (req, res) => {
  const session = sessionManager.create(req.body?.id);
  res.json({ id: session.id, createdAt: session.createdAt });
});

// 协议对齐前端 backend.ts：收 {messages, intent}，返 {content, provider, intent}
app.post('/api/chat', async (req, res) => {
  if (!agentLoop) return res.status(400).json({ error: 'Agent未初始化' });
  const { messages, intent } = req.body;
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: 'messages 不能为空' });
  }
  try {
    const content = await agentLoop.chat(
      messages
        .map((m: any) => ({ role: String(m.role || 'user'), content: String(m.content || '') }))
        .filter((m: any) => m.content),
    );
    res.json({ content, provider: 'agent-server', intent: intent || 'chat' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/chat/stream', async (req, res) => {
  if (!agentLoop) return res.status(400).json({ error: 'Agent未初始化' });
  const { sessionId, message } = req.body;
  if (!message) return res.status(400).json({ error: '消息不能为空' });
  const session = sessionManager.get(sessionId) || sessionManager.create(sessionId);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  const controller = new AbortController();
  req.on('close', () => controller.abort());
  try {
    await agentLoop.executeStream(session, message, {
      signal: controller.signal,
      onContent: (delta: string) => res.write(`data: ${JSON.stringify({ type: 'content', delta })}\n\n`),
      onThinking: (delta: string) => res.write(`data: ${JSON.stringify({ type: 'thinking', delta })}\n\n`),
      onToolCall: (tool: any) => res.write(`data: ${JSON.stringify({ type: 'tool_call', tool })}\n\n`),
      onToolResult: (result: any) => res.write(`data: ${JSON.stringify({ type: 'tool_result', result })}\n\n`),
    });
    sessionManager.save(session);
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  } catch (e: any) {
    if (!controller.signal.aborted) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: e.message })}\n\n`);
      res.end();
    }
  }
});

app.post('/api/tool', async (req, res) => {
  const { tool, params } = req.body;
  const handler = ToolSystem.get(tool);
  if (!handler) return res.status(404).json({ error: `未知工具: ${tool}` });
  try {
    const result = await handler.execute(params || {});
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/session/:id', (req, res) => {
  const session = sessionManager.get(req.params.id);
  if (!session) return res.status(404).json({ error: '会话不存在' });
  res.json({ id: session.id, messages: session.messages.filter((m: any) => m.role !== 'system'), toolsUsed: session.toolsUsed });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`🧠 妙笔 Agent Server @ http://127.0.0.1:${PORT}${TOKEN ? '（认证已开启）' : '（未设 AGENT_TOKEN，仅本机可访问）'}`);
  console.log(`   Tools: ${ToolSystem.list().map(t => t.name).join(', ')}`);
});
