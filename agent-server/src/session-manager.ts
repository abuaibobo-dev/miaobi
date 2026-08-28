/**
 * 会话管理：内存存储，带容量上限与 id 校验，防任意覆盖/枚举膨胀。
 */

export interface ServerMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ServerSession {
  id: string;
  messages: ServerMessage[];
  toolsUsed: any[];
  createdAt: string;
}

const MAX_SESSIONS = 50;
const MAX_MESSAGES = 40;
const MAX_TOOLS_USED = 100;

export class SessionManager {
  private sessions = new Map<string, ServerSession>();

  create(id?: string): ServerSession {
    const clean = id ? String(id).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) : '';
    const finalId = clean || `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const session: ServerSession = { id: finalId, messages: [], toolsUsed: [], createdAt: new Date().toISOString() };
    this.sessions.set(finalId, session);
    if (this.sessions.size > MAX_SESSIONS) {
      const oldest = this.sessions.keys().next().value as string;
      this.sessions.delete(oldest);
    }
    return session;
  }

  get(id: string): ServerSession | null {
    return this.sessions.get(String(id || '')) || null;
  }

  save(session: ServerSession): void {
    if (session.messages.length > MAX_MESSAGES) {
      session.messages = session.messages.slice(-MAX_MESSAGES);
    }
    if (session.toolsUsed.length > MAX_TOOLS_USED) {
      session.toolsUsed = session.toolsUsed.slice(-MAX_TOOLS_USED);
    }
    this.sessions.set(session.id, session);
  }

  count(): number {
    return this.sessions.size;
  }
}
