import AsyncStorage from '@react-native-async-storage/async-storage';
import { Paths, File } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import { unzipSync, strFromU8 } from 'fflate';
import { resolveArchiveText, resolveWikisourceText } from './bookSources';
import type { BookRecord, CustomBookSource, LibraryBook, ShelfStatus } from '../types/book';

const LIBRARY_KEY = 'miaobi.library.v1';
const SOURCES_KEY = 'miaobi.customSources.v1';

export async function getCustomSources(): Promise<CustomBookSource[]> {
  const raw = await AsyncStorage.getItem(SOURCES_KEY);
  const parsed = raw ? JSON.parse(raw) : [];
  return Array.isArray(parsed) ? parsed : [];
}

export async function saveCustomSources(list: CustomBookSource[]): Promise<void> {
  await AsyncStorage.setItem(SOURCES_KEY, JSON.stringify(list));
}

export async function removeCustomSource(id: string): Promise<void> {
  await saveCustomSources((await getCustomSources()).filter(item => item.id !== id));
}

function safeName(value: string) {
  return value.replace(/[^\w\u4e00-\u9fa5.-]+/g, '_').slice(0, 70) || 'book';
}

export async function getLibrary(): Promise<LibraryBook[]> {
  const raw = await AsyncStorage.getItem(LIBRARY_KEY);
  const parsed = raw ? JSON.parse(raw) : [];
  return Array.isArray(parsed) ? parsed : [];
}

export async function saveLibrary(list: LibraryBook[]): Promise<void> {
  await AsyncStorage.setItem(LIBRARY_KEY, JSON.stringify(list));
}

export async function findLibraryBook(id: string): Promise<LibraryBook | undefined> {
  return (await getLibrary()).find(book => book.id === id);
}

export async function addToShelf(book: BookRecord, status: ShelfStatus = 'want'): Promise<LibraryBook> {
  const list = await getLibrary();
  const existing = list.find(item => item.id === book.id);
  if (existing) {
    existing.status = status;
    await saveLibrary(list);
    return existing;
  }
  const item: LibraryBook = {
    ...book,
    savedAt: new Date().toISOString(),
    status,
    progress: 0,
  };
  list.unshift(item);
  await saveLibrary(list);
  return item;
}

export async function updateLibraryBook(id: string, patch: Partial<LibraryBook>): Promise<LibraryBook | undefined> {
  const list = await getLibrary();
  const index = list.findIndex(item => item.id === id);
  if (index < 0) return undefined;
  list[index] = { ...list[index], ...patch };
  await saveLibrary(list);
  return list[index];
}

export async function removeFromShelf(id: string): Promise<void> {
  const list = await getLibrary();
  const target = list.find(item => item.id === id);
  if (target?.localUri) {
    try {
      const file = new File(target.localUri);
      if (file.exists) file.delete();
    } catch {}
  }
  await saveLibrary(list.filter(item => item.id !== id));
}

async function writeLocalText(id: string, title: string, content: string): Promise<string> {
  const filename = `miaobi_${safeName(title)}_${id.replace(/[^a-z0-9]/gi, '_').slice(-18)}.txt`;
  const file = new File(Paths.document, filename);
  file.write(content, { encoding: 'utf8' });
  return file.uri;
}

export async function prepareReadableFile(book: BookRecord & { localUri?: string }): Promise<string> {
  if (book.localUri) return book.localUri;

  let url = book.downloadUrl;
  if (book.source === 'internetarchive') {
    url = await resolveArchiveText(book.id.replace('internetarchive:', ''));
  }
  if (book.source === 'chroniclingamerica' && !url) url = book.readUrl;
  if (!url) throw new Error('该来源没有可直接下载的正文文件');

  const response = await fetch(url);
  if (!response.ok) throw new Error(`下载失败（${response.status}）`);
  const content = await response.text();
  if (!content.trim()) throw new Error('下载内容为空');
  if (/^\uFEFF%PDF-|^\ufffd%PDF-/i.test(content)) throw new Error('该文件只有 PDF 扫描版，暂不能直接阅读');

  const uri = await writeLocalText(book.id, book.title, content);
  await updateLibraryBook(book.id, { localUri: uri });
  return uri;
}

export async function downloadWikisource(book: BookRecord): Promise<string> {
  const title = decodeURIComponent(book.id.replace('wikisource:', ''));
  const content = await resolveWikisourceText(title);
  if (!content.trim()) throw new Error('维基文库返回内容为空');
  const uri = await writeLocalText(book.id, book.title, content);
  await updateLibraryBook(book.id, { localUri: uri });
  return uri;
}

export function splitChapters(content: string) {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\n{4,}/g, '\n\n\n');
  const pattern = /^\s*(第\s*[0-9一二三四五六七八九十百千两零〇]+\s*[章回节卷篇部].*|Chapter\s+\d+.*|CHAPTER\s+[IVXLC\d]+.*)$/gmi;
  const matches = [...normalized.matchAll(pattern)];
  if (!matches.length) {
    const chunks = normalized.split(/\n{3,}/).map(chunk => chunk.trim()).filter(Boolean);
    if (chunks.length <= 1) return [{ title: '全文', body: normalized.trim(), index: 0 }];
    return chunks.map((body, index) => ({ title: `片段 ${index + 1}`, body, index }));
  }
  return matches.map((match, index) => {
    const start = match.index! + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index! : normalized.length;
    return { title: cleanTitle(match[0]), body: normalized.slice(start, end).trim(), index };
  }).filter(chapter => chapter.body.length > 20 || chapter.index === 0);
}

function cleanTitle(value: string) {
  return value.replace(/^\s*/, '').replace(/\s*$/, '');
}

export async function importLocalBook(): Promise<{ ok: boolean; message: string }> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['text/plain', 'application/json', 'text/csv', 'application/epub+zip'],
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.[0]) return { ok: false, message: '' };
  const asset = result.assets[0];
  const file = new File(asset.uri);
  if (!file.exists) return { ok: false, message: '无法读取所选文件' };
  if (asset.name?.toLowerCase().endsWith('.epub')) return importEpubFile(file, asset.name);
  const content = await file.text();
  const name = asset.name || '导入作品.txt';
  const lower = name.toLowerCase();

  if (lower.endsWith('.json')) {
    const data = JSON.parse(content);
    const books = data.books || data;
    if (!Array.isArray(books)) return { ok: false, message: 'JSON 书单格式无效' };
    const list = await getLibrary();
    let count = 0;
    for (const entry of books) {
      if (!entry?.title) continue;
      list.unshift({
        ...entry,
        id: `local:${Date.now()}_${count}`,
        source: 'local',
        sourceLabel: '本地导入',
        category: entry.category || 'book',
        authors: entry.authors || [],
        savedAt: new Date().toISOString(),
        status: 'want',
        progress: 0,
        locallyReadable: Boolean(entry.content),
      });
      if (entry.content) {
        const uri = await writeLocalText(`import_${Date.now()}_${count}`, entry.title, String(entry.content));
        list[0].localUri = uri;
      }
      count++;
    }
    await saveLibrary(list);
    return { ok: true, message: `已导入 ${count} 条书单` };
  }

  const id = `local:${Date.now()}`;
  const uri = await writeLocalText(id, name, content);
  const list = await getLibrary();
  list.unshift({
    id,
    source: 'local',
    sourceLabel: lower.endsWith('.csv') ? 'CSV 书单' : '本地文本',
    category: lower.includes('报纸') ? 'newspaper' : lower.includes('杂志') ? 'magazine' : 'book',
    title: name.replace(/\.(txt|json|csv)$/i, ''),
    authors: [],
    description: content.slice(0, 180),
    savedAt: new Date().toISOString(),
    status: 'reading',
    progress: 0,
    locallyReadable: true,
    localUri: uri,
    importedAt: new Date().toISOString(),
  });
  await saveLibrary(list);
  return { ok: true, message: '导入成功，已加入书架' };
}

export async function importExternalFile(uri: string, fileName?: string): Promise<{ ok: boolean; bookId?: string; message: string }> {
  const file = new File(uri);
  if (!file.exists) return { ok: false, message: '无法读取外部文件' };
  const lower = (fileName || uri).toLowerCase();

  if (lower.endsWith('.epub')) {
    const result = await importEpubFile(file, fileName || '导入作品.epub');
    if (!result.ok) return result;
    const list = await getLibrary();
    return { ok: true, bookId: list[0]?.id, message: result.message };
  }

  if (lower.endsWith('.json')) {
    const content = await file.text();
    const data = JSON.parse(content);
    const books = data.books || data;
    if (!Array.isArray(books)) return { ok: false, message: 'JSON 书单格式无效' };
    const list = await getLibrary();
    let count = 0;
    for (const entry of books.slice(0, 100)) {
      if (!entry?.title) continue;
      list.unshift({
        ...entry,
        id: `local:${Date.now()}_${count}`,
        source: 'local',
        sourceLabel: '外部导入书单',
        category: entry.category || 'book',
        authors: entry.authors || [],
        savedAt: new Date().toISOString(),
        status: 'want',
        progress: 0,
        locallyReadable: Boolean(entry.content),
      });
      if (entry.content) list[0].localUri = await writeLocalText(`external_${Date.now()}_${count}`, entry.title, String(entry.content));
      count++;
    }
    await saveLibrary(list);
    return { ok: true, message: `已导入 ${count} 条书单` };
  }

  const id = `local:${Date.now()}`;
  const title = decodeURIComponent(fileName || '外部导入.txt').replace(/^file:\/\/\//, '').split('/').pop() || '外部导入';
  const cleanTitle = title.replace(/\.(txt|csv)$/i, '');
  const content = await file.text();
  const localUri = await writeLocalText(id, cleanTitle, content);
  const list = await getLibrary();
  list.unshift({
    id,
    source: 'local',
    sourceLabel: lower.endsWith('.csv') ? 'CSV 书单' : '外部文本',
    category: lower.includes('报纸') ? 'newspaper' : lower.includes('杂志') ? 'magazine' : 'book',
    title: cleanTitle,
    authors: [],
    description: content.slice(0, 180),
    savedAt: new Date().toISOString(),
    status: 'reading',
    progress: 0,
    locallyReadable: true,
    localUri,
    importedAt: new Date().toISOString(),
  });
  await saveLibrary(list);
  return { ok: true, bookId: id, message: '导入成功' };
}

async function importEpubFile(file: File, filename: string): Promise<{ ok: boolean; message: string }> {
  try {
    const bytes = await file.bytes();
    const extracted = extractEpubText(bytes);
    const id = `local:${Date.now()}`;
    const uri = await writeLocalText(id, extracted.title, extracted.content);
    const list = await getLibrary();
    list.unshift({
      id,
      source: 'local',
      sourceLabel: 'EPUB 导入',
      category: 'book',
      title: extracted.title,
      authors: extracted.authors,
      description: extracted.content.slice(0, 180),
      savedAt: new Date().toISOString(),
      status: 'reading',
      progress: 0,
      locallyReadable: true,
      localUri: uri,
      importedAt: new Date().toISOString(),
    });
    await saveLibrary(list);
    return { ok: true, message: `EPUB导入成功：${extracted.chapters}章` };
  } catch (error: any) {
    return { ok: false, message: error?.message || 'EPUB解析失败' };
  }
}

function decodeHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/(p|div|h[1-6]|li)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function xmlTag(xml: string, tag: string) {
  return xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'))?.[1]?.trim() || '';
}

export function extractEpubText(bytes: Uint8Array) {
  const files = unzipSync(bytes);
  const containerName = Object.keys(files).find(name => name.endsWith('META-INF/container.xml'));
  if (!containerName) throw new Error('无效 EPUB：缺少 container.xml');
  const containerXml = strFromU8(files[containerName]);
  let opfPath = containerXml.match(/full-path=["']([^"']+)["']/i)?.[1];
  if (!opfPath) throw new Error('无效 EPUB：缺少 OPF');
  const root = opfPath.split('/').slice(0, -1);
  const opfKey = Object.keys(files).find(name => name === opfPath || name.endsWith(`/${opfPath}`)) || opfPath;
  const opf = strFromU8(files[opfKey]);
  const resolve = (href: string) => [...root, href].filter(Boolean).join('/');

  const title = decodeHtml(xmlTag(opf, 'dc:title') || xmlTag(opf, 'title')) || '导入作品';
  const authors = [decodeHtml(xmlTag(opf, 'dc:creator') || xmlTag(opf, 'creator'))].filter(Boolean);
  const manifest = opf.match(/<manifest[\s\S]*?<\/manifest>/i)?.[0] || '';
  const items = new Map<string, string>();
  for (const match of manifest.matchAll(/<item\b[^>]*>/gi)) {
    const id = match[0].match(/id=["']([^"']+)["']/i)?.[1];
    const href = match[0].match(/href=["']([^"']+)["']/i)?.[1];
    if (id && href) items.set(id, decodeURIComponent(href.split('?')[0]));
  }
  const spine = opf.match(/<spine[\s\S]*?<\/spine>/i)?.[0] || '';
  const order = [...spine.matchAll(/itemref\s+[^>]*idref=["']([^"']+)["']/gi)].map(match => match[1]).filter(id => items.has(id));
  const paths = (order.length ? order.map(id => items.get(id)!) : [...items.values()])
    .filter(path => /\.(xhtml|html|htm)$/i.test(path));

  const parts: string[] = [];
  for (const path of paths) {
    const key = Object.keys(files).find(name => name === resolve(path) || name.endsWith(`/${path}`));
    if (!key) continue;
    const html = strFromU8(files[key]);
    const heading = decodeHtml(html.match(/<(?:h[1-3]|title)[^>]*>([\s\S]*?)<\/(?:h[1-3]|title)>/i)?.[1] || '');
    const body = decodeHtml(html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || html);
    parts.push(heading ? `${heading}\n\n${body}` : body);
  }
  if (!parts.length) throw new Error('EPUB中没有可读正文');
  return { title, authors, content: parts.join('\n\n\n'), chapters: parts.length };
}

export async function readBookContent(bookId: string): Promise<string> {
  const book = await findLibraryBook(bookId);
  if (!book) throw new Error('书架中找不到这本书');
  if (book.localUri) {
    const file = new File(book.localUri);
    if (file.exists) return await file.text();
  }
  if (book.source === 'wikisource') {
    const title = decodeURIComponent(bookId.replace('wikisource:', ''));
    return await resolveWikisourceText(title);
  }
  if (!book.downloadUrl && !book.readUrl) throw new Error('请先在详情页下载正文');
  const response = await fetch(book.downloadUrl || book.readUrl!);
  if (!response.ok) throw new Error(`读取失败（${response.status}）`);
  const content = await response.text();
  if (/^\uFEFF%PDF-|^\ufffd%PDF-/i.test(content)) throw new Error('暂不支持直接阅读 PDF 扫描件');
  return content;
}
