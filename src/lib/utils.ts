export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function truncate(s: string, len: number): string {
  return s.length > len ? s.slice(0, len) + '...' : s;
}

export function wordCount(s: string): number {
  // 中文按字，英文按词
  const cjk = (s.match(/[\u4e00-\u9fff]/g) || []).length;
  const eng = (s.match(/[a-zA-Z]+/g) || []).length;
  return cjk + eng;
}
