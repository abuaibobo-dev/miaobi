import { Paths, File, EncodingType } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Store from './storage';

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
