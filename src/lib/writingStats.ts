import * as Store from './storage';

export interface WritingStats {
  totalWords: number;
  totalChapters: number;
  totalDays: number;
  streakDays: number;
  dailyStats: Record<string, number>; // date → wordCount
  avgWordsPerDay: number;
}

export async function getWritingStats(novelId: string): Promise<WritingStats> {
  const chapters = await Store.getChapters(novelId);
  const dailyStats: Record<string, number> = {};
  let totalWords = 0;

  for (const ch of chapters) {
    totalWords += ch.wordCount;
    const date = ch.createdAt.slice(0, 10);
    dailyStats[date] = (dailyStats[date] || 0) + ch.wordCount;
  }

  const dates = Object.keys(dailyStats).sort();
  const totalDays = dates.length;

  // 计算连续写作天数
  let streakDays = 0;
  if (dates.length > 0) {
    const today = new Date().toISOString().slice(0, 10);
    let checkDate = today;
    for (let i = 0; i < 365; i++) {
      if (dailyStats[checkDate]) {
        streakDays++;
        const d = new Date(checkDate);
        d.setDate(d.getDate() - 1);
        checkDate = d.toISOString().slice(0, 10);
      } else {
        break;
      }
    }
  }

  return {
    totalWords,
    totalChapters: chapters.length,
    totalDays,
    streakDays,
    dailyStats,
    avgWordsPerDay: totalDays > 0 ? Math.round(totalWords / totalDays) : 0,
  };
}
