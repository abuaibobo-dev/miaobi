import { Paths, File, EncodingType } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Store from './storage';
import type { Chapter, NovelProject } from '../types/novel';

export function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/\.{2,}/g, '.').slice(0, 120);
}

async function writeAndShare(filename: string, content: string, mimeType: string): Promise<boolean> {
  const file = new File(Paths.document, sanitizeFilename(filename));
  await file.write(content, { encoding: EncodingType.UTF8 });
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: '导出小说' });
  return true;
}

export async function exportAsTxt(novelId: string): Promise<boolean> {
  const novel = (await Store.getNovels()).find(n => n.id === novelId);
  if (!novel) return false;
  const chapters = await Store.getChapters(novelId);
  if (chapters.length === 0) return false;

  let content = `${novel.title}\n${'='.repeat(30)}\n\n`;
  content += `类型：${novel.genre}\n简介：${novel.synopsis}\n\n`;
  for (const ch of chapters) {
    content += `\n${'─'.repeat(30)}\n第${ch.chapterNumber}章 ${ch.title}\n${'─'.repeat(30)}\n\n${ch.body}\n`;
  }

  return writeAndShare(`${novel.title}.txt`, content, 'text/plain');
}

export async function exportAsMarkdown(novelId: string): Promise<boolean> {
  const novel = (await Store.getNovels()).find(n => n.id === novelId);
  if (!novel) return false;
  const chapters = await Store.getChapters(novelId);
  if (chapters.length === 0) return false;

  let md = `# ${novel.title}\n\n> 类型：${novel.genre}\n>\n> ${novel.synopsis}\n\n---\n\n`;
  for (const ch of chapters) {
    md += `## 第${ch.chapterNumber}章 ${ch.title}\n\n${ch.body}\n\n---\n\n`;
  }

  return writeAndShare(`${novel.title}.md`, md, 'text/markdown');
}

export async function exportChapter(chapter: Chapter, novelTitle: string): Promise<boolean> {
  const content = `第${chapter.chapterNumber}章 ${chapter.title}\n\n${chapter.body}`;
  return writeAndShare(`第${chapter.chapterNumber}章_${chapter.title}.txt`, content, 'text/plain');
}
