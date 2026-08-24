import { getSettings } from './storage';
import type { BookRecord, ContentCategory, ParsedBookQuery } from '../types/book';

const CATEGORIES: ContentCategory[] = ['all', 'book', 'magazine', 'newspaper', 'story', 'art'];

function safeJson<T>(text: string, fallback: T): T {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return fallback;
  try { return { ...fallback, ...JSON.parse(match[0]) }; } catch { return fallback; }
}

async function callDeepSeek(messages: any[], maxTokens = 900): Promise<string> {
  const settings = await getSettings() as any;
  if (!settings.apiKey) throw new Error('请先在设置中配置 DeepSeek API Key');
  const response = await fetch(`${settings.baseUrl || 'https://api.deepseek.com'}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
    body: JSON.stringify({
      model: settings.model || 'deepseek-chat',
      messages,
      temperature: 0.4,
      max_tokens: maxTokens,
      stream: false,
    }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message || `DeepSeek 请求失败（${response.status}）`);
  return String(data?.choices?.[0]?.message?.content || '');
}

export async function parseBookQuery(query: string): Promise<ParsedBookQuery> {
  const fallback: ParsedBookQuery = { queries: [query], intent: [query], language: /[\u4e00-\u9fa5]/.test(query) ? 'zh' : 'en' };
  if (!query.trim()) return fallback;
  const content = await callDeepSeek([
    { role: 'system', content: '你是找书检索规划器。把用户自然语言转换成用于公开书目API的JSON。只输出JSON：{"queries":["..."],"language":"zh|en","category":"all|book|magazine|newspaper|story|art","intent":["..."]}。如果用户输入作者名，queries必须包含作者原名和常见英文/中文译名；如果是作品描述，补充可能的书名、作者、题材关键词。queries包含1-4个精炼搜索词。' },
    { role: 'user', content: query },
  ], 500);
  const parsed = safeJson<ParsedBookQuery & { category?: string }>(content, fallback);
  const category = CATEGORIES.includes(parsed.category as ContentCategory) ? parsed.category as ContentCategory : fallback.category as ContentCategory;
  return { ...parsed, category };
}

export async function rankBooks(query: string, books: BookRecord[]): Promise<Record<string, { score: number; reason: string }>> {
  if (!books.length) return {};
  const compact = books.slice(0, 40).map(book => ({
    id: book.id,
    title: book.title,
    authors: book.authors,
    year: book.year,
    subjects: book.subjects?.slice(0, 6),
    description: book.description?.slice(0, 260),
    source: book.source,
  }));
  const content = await callDeepSeek([
    { role: 'system', content: '你是书籍推荐排序器。只能从提供的候选中选择，不得新增书名。返回JSON：{"scores":[{"id":"...","score":0-100,"reason":"不超过45字"}]}。用简体中文。' },
    { role: 'user', content: `用户需求：${query}\n\n候选：${JSON.stringify(compact)}` },
  ], 1200);
  const parsed = safeJson<{ scores: Array<{ id: string; score: number; reason: string }> }>(content, { scores: [] });
  return Object.fromEntries(parsed.scores
    .filter(item => item.id && Number.isFinite(item.score))
    .map(item => [item.id, { score: Math.max(0, Math.min(100, Number(item.score))), reason: String(item.reason).slice(0, 100) }]));
}

export async function suggestDiscoveries(): Promise<Array<{ title: string; query: string; category: string }>> {
  const content = await callDeepSeek([
    { role: 'system', content: '你是书源发现编辑。返回JSON：{"items":[{"title":"短标题","query":"适合公开书源的搜索词","category":"book|story|magazine|newspaper|art"}]}，共8项。不要重复；覆盖小说、故事、杂志、报纸、艺术图片。' },
    { role: 'user', content: '生成一组当前值得探索的公开书源主题' },
  ], 900);
  const parsed = safeJson<{ items: any[] }>(content, { items: [] });
  return parsed.items.filter(item => item?.title && item?.query).slice(0, 8);
}
