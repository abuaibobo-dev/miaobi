/**
 * 安全工具集
 * 移除 shell_exec / 任意文件读写；仅保留网络与记忆工具，且做 SSRF 防护。
 */

import { randomUUID } from 'crypto';

export interface Tool {
  name: string;
  description: string;
  execute(params: Record<string, any>): Promise<unknown>;
}

function isPrivateAddress(host: string): boolean {
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
  if (/^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  return false;
}

function validateUrl(raw: string): URL {
  const url = new URL(String(raw || ''));
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('仅支持 http/https');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isPrivateAddress(host)) throw new Error('不允许访问内网地址');
  return url;
}

const memory = new Map<string, string>();

const TOOLS: Tool[] = [
  {
    name: 'web_search',
    description: '搜索网页',
    async execute(params) {
      const q = String(params.query || '').trim();
      if (!q) return { error: '缺少 query' };
      try {
        const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(15000),
        });
        const html = await res.text();
        const results = [];
        const re = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g;
        let m;
        let i = 0;
        while ((m = re.exec(html)) && i < 5) {
          results.push({ title: m[2].replace(/<[^>]+>/g, ''), url: m[1] });
          i++;
        }
        return { results };
      } catch (e: any) {
        return { error: `搜索失败: ${e.message}` };
      }
    },
  },
  {
    name: 'fetch_page',
    description: '获取网页内容',
    async execute(params) {
      try {
        const url = validateUrl(params.url);
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(20000),
        });
        const text = await res.text();
        return { status: res.status, content: text.slice(0, 20000) };
      } catch (e: any) {
        return { error: `抓取失败: ${e.message}` };
      }
    },
  },
  {
    name: 'search_books',
    description: '搜索书籍',
    async execute(params) {
      const q = String(params.query || '').trim();
      if (!q) return { error: '缺少 query' };
      try {
        const res = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=5`, {
          signal: AbortSignal.timeout(15000),
        });
        const data: any = await res.json();
        const docs = (data.docs || []).map((d: any) => ({
          title: d.title,
          author: d.author_name?.[0] || '',
          year: d.first_publish_year || '',
        }));
        return { results: docs };
      } catch (e: any) {
        return { error: `搜索失败: ${e.message}` };
      }
    },
  },
  {
    name: 'save_memory',
    description: '保存记忆',
    async execute(params) {
      const key = String(params.key || '');
      if (!key) return { error: '缺少 key' };
      memory.set(key, String(params.value ?? ''));
      return { ok: true };
    },
  },
  {
    name: 'load_memory',
    description: '读取记忆',
    async execute(params) {
      const key = String(params.key || '');
      return { value: memory.get(key) ?? null };
    },
  },
];

export const ToolSystem = {
  list() {
    return TOOLS.map(t => ({ name: t.name, description: t.description }));
  },
  get(name: string): Tool | null {
    return TOOLS.find(t => t.name === name) || null;
  },
};

export function newSessionId(): string {
  return randomUUID();
}
