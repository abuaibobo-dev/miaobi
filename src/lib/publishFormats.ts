/**
 * 发布渠道格式化
 */
import * as Store from './storage';

export type PublishFormat = 'fanqie' | 'qidian' | 'jinjiang' | 'chuangshi' | 'standard';

interface FormatConfig {
  name: string;
  chapterPrefix: string;
  separator: string;
  maxTitleLen: number;
}

const FORMATS: Record<PublishFormat, FormatConfig> = {
  fanqie: { name: '番茄小说', chapterPrefix: '第', separator: '\n\n', maxTitleLen: 20 },
  qidian: { name: '起点中文网', chapterPrefix: '第', separator: '\n\n', maxTitleLen: 16 },
  jinjiang: { name: '晋江文学城', chapterPrefix: '第', separator: '\n\n', maxTitleLen: 20 },
  chuangshi: { name: '创世中文网', chapterPrefix: '第', separator: '\n\n', maxTitleLen: 16 },
  standard: { name: '标准格式', chapterPrefix: '第', separator: '\n\n', maxTitleLen: 50 },
};

export function getFormatList(): Array<{ key: PublishFormat; name: string }> {
  return Object.entries(FORMATS).map(([k, v]) => ({ key: k as PublishFormat, name: v.name }));
}

export async function formatForPublish(novelId: string, format: PublishFormat): Promise<string> {
  const novel = (await Store.getNovels()).find(n => n.id === novelId);
  if (!novel) return '';
  const chapters = await Store.getChapters(novelId);
  if (chapters.length === 0) return '';

  const config = FORMATS[format];
  let output = '';

  // 按卷分组
  const byVolume: Record<number, typeof chapters> = {};
  for (const ch of chapters) {
    const vol = ch.volumeNumber || 1;
    if (!byVolume[vol]) byVolume[vol] = [];
    byVolume[vol].push(ch);
  }

  for (const vol of Object.keys(byVolume).map(Number).sort()) {
    const volChapters = byVolume[vol];
    if (Object.keys(byVolume).length > 1) {
      output += `\n${'═'.repeat(20)} 第${vol}卷 ${'═'.repeat(20)}\n\n`;
    }
    for (const ch of volChapters) {
      const title = ch.title.slice(0, config.maxTitleLen);
      output += `${config.chapterPrefix}${ch.chapterNumber}章 ${title}\n\n`;
      output += ch.body + config.separator;
    }
  }

  return output;
}

export function getFormatGuide(format: PublishFormat): string {
  const guides: Record<string, string> = {
    fanqie: '番茄小说要求：每章 1000-3000 字，无敏感内容，标题简洁',
    qidian: '起点要求：每章 2000+ 字，分卷明确，标题含"第X章"',
    jinjiang: '晋江要求：每章 2000+ 字，支持分卷，标题规范',
    chuangshi: '创世要求：每章 2000+ 字，分卷管理，标题格式统一',
    standard: '标准格式：适用于任何平台的通用排版',
  };
  return guides[format] || '';
}
