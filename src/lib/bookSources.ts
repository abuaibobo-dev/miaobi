import type { BookRecord, BookSearchResult, ContentCategory, CustomBookSource } from '../types/book';

const TIMEOUT = 14000;

async function getJson(url: string): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function cleanHtml(value?: string): string {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function text(value: any): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return cleanHtml(value);
  if (typeof value?.value === 'string') return cleanHtml(value.value);
  if (Array.isArray(value)) return cleanHtml(value.join(' '));
}

function normalizeGoogle(item: any): BookRecord | null {
  const info = item.volumeInfo;
  if (!info?.title) return null;
  return {
    id: `google:${item.id}`,
    source: 'google',
    sourceLabel: 'Google Books',
    category: info.categories?.some((s: string) => /periodical|magazine/i.test(s)) ? 'magazine' : 'book',
    title: String(info.title),
    authors: Array.isArray(info.authors) ? info.authors : [],
    description: text(info.description),
    coverUrl: info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail,
    year: Number(String(info.publishedDate || '').slice(0, 4)) || undefined,
    language: info.language,
    subjects: info.categories,
    detailUrl: info.infoLink,
    locallyReadable: false,
  };
}

function normalizeOpenLibrary(doc: any, category: ContentCategory = 'book'): BookRecord | null {
  if (!doc.title) return null;
  const coverKey = doc.cover_i || doc.cover_edition_key;
  return {
    id: `openlibrary:${doc.key}`,
    source: 'openlibrary',
    sourceLabel: 'Open Library',
    category,
    title: String(doc.title),
    authors: doc.author_name || [],
    description: Array.isArray(doc.first_sentence) ? doc.first_sentence.join(' ') : doc.first_sentence,
    coverUrl: coverKey ? `https://covers.openlibrary.org/b/id/${coverKey}-M.jpg` : undefined,
    year: Number(doc.first_publish_year) || undefined,
    language: doc.language?.[0],
    subjects: doc.subject?.slice(0, 8),
    detailUrl: `https://openlibrary.org${doc.key}`,
    locallyReadable: false,
  };
}

function normalizeGutenberg(book: any): BookRecord | null {
  const plainEntry = Object.entries(book.formats || {}).find(([key]) => key.startsWith('text/plain'));
  const plain = plainEntry?.[1];
  const html = book.formats?.['text/html'];
  if (!book.title || !plain) return null;
  return {
    id: `gutenberg:${book.id}`,
    source: 'gutenberg',
    sourceLabel: 'Project Gutenberg',
    category: 'book',
    title: String(book.title),
    authors: (book.authors || []).map((author: any) => author.name),
    description: book.summaries?.join('\n\n'),
    coverUrl: book.formats?.['image/jpeg'],
    year: book.copyright ? undefined : 1929,
    language: book.languages?.[0],
    subjects: [...(book.bookshelves || []), ...(book.subjects || [])].slice(0, 8),
    detailUrl: `https://www.gutenberg.org/ebooks/${book.id}`,
    downloadUrl: typeof plain === 'string' ? plain : undefined,
    readUrl: typeof html === 'string' ? html : undefined,
    locallyReadable: true,
  };
}

function normalizeArchive(item: any, category: ContentCategory): BookRecord | null {
  if (!item.identifier || !item.title) return null;
  return {
    id: `internetarchive:${item.identifier}`,
    source: 'internetarchive',
    sourceLabel: 'Internet Archive',
    category,
    title: String(Array.isArray(item.title) ? item.title[0] : item.title),
    authors: [].concat(item.creator || []).filter(Boolean),
    description: text(item.description),
    coverUrl: `https://archive.org/services/img/${encodeURIComponent(item.identifier)}`,
    year: Number(String(item.year || item.date || '').slice(0, 4)) || undefined,
    language: Array.isArray(item.language) ? item.language[0] : item.language,
    subjects: [].concat(item.subject || []).slice(0, 6),
    detailUrl: `https://archive.org/details/${encodeURIComponent(item.identifier)}`,
    locallyReadable: false,
  };
}

function normalizeWikisource(page: any): BookRecord | null {
  const title = page.title;
  if (!title) return null;
  return {
    id: `wikisource:${encodeURIComponent(title)}`,
    source: 'wikisource',
    sourceLabel: '中文维基文库',
    category: 'story',
    title: String(title),
    authors: [],
    description: cleanHtml(page.snippet || ''),
    year: undefined,
    language: 'zh',
    subjects: ['公版', '维基文库'],
    readUrl: `https://zh.wikisource.org/wiki/${encodeURIComponent(title)}`,
    locallyReadable: true,
  };
}

function normalizeChronicling(item: any): BookRecord | null {
  const id = item.id || item.item?.id;
  const title = item.title || item.part?.title || item.orc?.title || '历史报纸页面';
  if (!id) return null;
  const path = String(id).startsWith('/') ? String(id) : `/${id}`;
  return {
    id: `chroniclingamerica:${path}`,
    source: 'chroniclingamerica',
    sourceLabel: '美国国会图书馆报纸库',
    category: 'newspaper',
    title: String(title),
    authors: [item.paper_title || item.newspaper?.title || 'Chronicling America'].filter(Boolean),
    description: text(item.ocr_eng || item.explanation || item.description),
    year: Number(String(item.date || '').slice(0, 4)) || undefined,
    language: 'en',
    subjects: ['历史报纸'],
    detailUrl: `https://chroniclingamerica.loc.gov${path}`,
    readUrl: `https://chroniclingamerica.loc.gov${path}ocr.txt`,
    locallyReadable: true,
  };
}

function normalizeMet(object: any): BookRecord | null {
  if (!object.objectID || !object.title) return null;
  return {
    id: `metmuseum:${object.objectID}`,
    source: 'metmuseum',
    sourceLabel: '大都会艺术博物馆',
    category: 'art',
    title: String(object.title),
    authors: [object.artistDisplayName].filter(Boolean),
    description: [object.medium, object.department, object.creditLine].filter(Boolean).join(' · '),
    coverUrl: object.primaryImageSmall || object.primaryImage,
    year: Number(String(object.objectDate || '').match(/\d{4}/)?.[0]) || undefined,
    subjects: [object.department, object.classification].filter(Boolean),
    detailUrl: `https://www.metmuseum.org/art/collection/search/${object.objectID}`,
    locallyReadable: false,
  };
}

function normalizeCommons(page: any): BookRecord | null {
  const image = page.imageinfo?.[0];
  if (!page.title || !image) return null;
  return {
    id: `commons:${encodeURIComponent(page.pageid)}`,
    source: 'wikimediacommons',
    sourceLabel: 'Wikimedia Commons',
    category: 'art',
    title: String(page.title).replace(/^File:/, ''),
    authors: [image.extmetadata?.Artist?.value && cleanHtml(image.extmetadata.Artist.value)].filter(Boolean),
    description: text(image.extmetadata?.ImageDescription?.value),
    coverUrl: image.thumburl || image.url,
    year: Number(String(image.datetime?.slice(0, 4) || '')) || undefined,
    subjects: ['开放版权图片'],
    detailUrl: image.descriptionurl,
    locallyReadable: false,
  };
}

async function searchGoogle(term: string): Promise<BookRecord[]> {
  const data = await getJson(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(term)}&maxResults=20&printType=books`);
  return (data.items || []).map(normalizeGoogle).filter(Boolean);
}

async function searchOpenLibrary(term: string, category: ContentCategory): Promise<BookRecord[]> {
  const fields = 'key,title,author_name,first_publish_year,language,subject,cover_i,cover_edition_key,first_sentence';
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(term)}&limit=20&fields=${fields}`;
  const [data, authorData] = await Promise.all([
    getJson(url),
    getJson(`https://openlibrary.org/search/authors.json?q=${encodeURIComponent(term)}&limit=3`).catch(() => null),
  ]).then(([bookResponse, authorResponse]) => [bookResponse, authorResponse]);
  const docs = [...(data.docs || [])];
  for (const author of authorData?.docs || []) {
    if (!author.name || !author.key) continue;
    const works = await getJson(`https://openlibrary.org/search.json?author=${encodeURIComponent(author.name)}&limit=12&fields=${fields}`).catch(() => null);
    (works?.docs || []).forEach((doc: any) => { if (!doc.author_name?.includes(author.name)) doc.author_name = [author.name]; });
    docs.push(...(works?.docs || []));
  }
  return docs.map((doc: any) => normalizeOpenLibrary(doc, category)).filter((item): item is BookRecord => Boolean(item));
}

async function searchGutenberg(term: string): Promise<BookRecord[]> {
  const [byTitle, byAuthor] = await Promise.all([
    getJson(`https://gutendex.com/books?search=${encodeURIComponent(term)}`),
    getJson(`https://gutendex.com/books?authors=${encodeURIComponent(term)}`).catch(() => null),
  ]);
  return [...(byTitle.results || []), ...(byAuthor?.results || [])]
    .slice(0, 30).map(normalizeGutenberg).filter((item): item is BookRecord => Boolean(item));
}

export async function fetchPopularBooks(): Promise<BookRecord[]> {
  const data = await getJson('https://gutendex.com/books?sort=popular');
  return (data.results || []).slice(0, 18).map(normalizeGutenberg).filter((item: any): item is BookRecord => Boolean(item));
}

export async function fetchSourceRecommendations(customSources: CustomBookSource[] = []): Promise<Array<{ key: string; title: string; books: BookRecord[] }>> {
  const tasks = [
    { key: 'gutenberg', title: '古登堡热门', promise: fetchPopularBooks() },
    { key: 'google', title: 'Google 经典推荐', promise: getJson('https://www.googleapis.com/books/v1/volumes?q=subject:fiction+classic&maxResults=12').then(data => (data.items || []).map(normalizeGoogle).filter((item: any): item is BookRecord => Boolean(item))) },
    { key: 'openlibrary', title: 'Open Library 书单', promise: getJson('https://openlibrary.org/search.json?q=subject%3Aclassics&limit=12&fields=key,title,author_name,first_publish_year,language,cover_i').then(data => (data.docs || []).map((doc: any) => normalizeOpenLibrary(doc, 'book')).filter((item: any): item is BookRecord => Boolean(item))) },
    { key: 'internetarchive', title: 'Internet Archive 文献', promise: getJson(`https://archive.org/advancedsearch.php?q=${encodeURIComponent('classic literature AND mediatype:(texts)')}&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=creator&fl%5B%5D=year&fl%5B%5D=description&rows=12&page=1&output=json`).then(data => (data.response?.docs || []).map((item: any) => normalizeArchive(item, 'book')).filter((item: any): item is BookRecord => Boolean(item))) },
    { key: 'wolne', title: 'Wolne Lektury 推荐', promise: getJson('https://wolnelektury.pl/api/books/?sort=popularity&limit=12').then(data => (Array.isArray(data) ? data : []).map((item: any) => ({ id: `wolne:${item.slug}`, source: 'openlibrary', sourceLabel: 'Wolne Lektury', category: 'book', title: String(item.title), authors: [].concat(item.authors || []).map((a: any) => a?.name || a).filter(Boolean), coverUrl: item.cover, detailUrl: item.url, locallyReadable: false } as BookRecord)).filter((book: BookRecord) => book.title)) },
  ];

  for (const source of customSources.slice(0, 5)) {
    tasks.push({
      key: `custom:${source.id}`,
      title: source.name,
      promise: (async () => {
        for (const q of ['classic', 'popular', '小说', '文学']) {
          const result = await searchCustomSource(source, q).catch(() => [] as BookRecord[]);
          if (result.length > 0) return result.slice(0, 8);
        }
        return [] as BookRecord[];
      })(),
    });
  }

  const settled = await Promise.allSettled(tasks.map(task => task.promise));
  return settled.map((result, index) => ({
    key: tasks[index].key,
    title: tasks[index].title,
    books: result.status === 'fulfilled' ? result.value.slice(0, 8) : [],
  })).filter(group => group.books.length);
}

async function searchArchive(term: string, category: ContentCategory): Promise<BookRecord[]> {
  const query = encodeURIComponent(`(${term}) AND mediatype:(texts)`);
  const url = `https://archive.org/advancedsearch.php?q=${query}&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=creator&fl%5B%5D=year&fl%5B%5D=date&fl%5B%5D=description&fl%5B%5D=language&fl%5B%5D=subject&rows=20&page=1&output=json`;
  const data = await getJson(url);
  return (data.response?.docs || []).map((item: any) => normalizeArchive(item, category)).filter(Boolean);
}

async function searchWikisource(term: string): Promise<BookRecord[]> {
  const url = `https://zh.wikisource.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(term)}&srlimit=20&format=json&origin=*`;
  const data = await getJson(url);
  return (data.query?.search || []).map(normalizeWikisource).filter(Boolean);
}

async function searchNewspapers(term: string): Promise<BookRecord[]> {
  const url = `https://chroniclingamerica.loc.gov/search/pages/results/?andtext=${encodeURIComponent(term)}&rows=20&format=json`;
  const data = await getJson(url);
  return (data.items || []).map(normalizeChronicling).filter(Boolean);
}

async function searchMet(term: string): Promise<BookRecord[]> {
  const searchData = await getJson(`https://collectionapi.metmuseum.org/public/v1/search?hasImages=true&q=${encodeURIComponent(term)}`);
  const ids = (searchData.objectIDs || []).slice(0, 12);
  const objects = await Promise.all(ids.map(async (id: number) => {
    try { return await getJson(`https://collectionapi.metmuseum.org/public/v1/objects/${id}`); }
    catch { return null; }
  }));
  return objects.map(normalizeMet).filter((item): item is BookRecord => Boolean(item));
}

async function searchCommons(term: string): Promise<BookRecord[]> {
  const generator = encodeURIComponent(`File:${term}`);
  const search = encodeURIComponent(`${term} filetype:bitmap`);
  const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${search}&gsrnamespace=6&gsrlimit=20&prop=imageinfo&iiprop=url|extmetadata|datetime&iiurlwidth=480&format=json&origin=*`;
  void generator;
  const data = await getJson(url);
  const pages = Object.values(data.query?.pages || {});
  return pages.map(normalizeCommons).filter((item): item is BookRecord => Boolean(item));
}

async function searchWolne(term: string): Promise<BookRecord[]> {
  const data = await getJson(`https://wolnelektury.pl/api/books/?search=${encodeURIComponent(term)}`);
  return (Array.isArray(data) ? data : []).slice(0, 20).map((item: any) => ({
    id: `wolne:${item.slug || item.url}`,
    source: 'openlibrary',
    sourceLabel: 'Wolne Lektury',
    category: 'book',
    title: String(item.title || ''),
    authors: [].concat(item.authors || []).map((author: any) => typeof author === 'string' ? author : author?.name).filter(Boolean),
    description: text(item.description || item.annotation),
    coverUrl: item.cover || item.simple_cover,
    detailUrl: item.url,
    downloadUrl: item.txt || item.xml,
    locallyReadable: Boolean(item.txt),
  } as BookRecord)).filter(book => book.title);
}

async function searchPoetry(term: string): Promise<BookRecord[]> {
  const data = await getJson(`https://poetrydb.org/title/${encodeURIComponent(term)}`);
  if (!Array.isArray(data)) return [];
  return data.slice(0, 20).map((item: any, index: number) => ({
    id: `poetrydb:${encodeURIComponent(item.title)}_${index}`,
    source: 'gutenberg',
    sourceLabel: 'PoetryDB',
    category: 'story',
    title: String(item.title),
    authors: [item.author].filter(Boolean),
    description: (item.lines || []).slice(0, 8).join('\n'),
    locallyReadable: true,
    downloadUrl: `https://poetrydb.org/title/${encodeURIComponent(item.title)}`,
  }));
}

async function searchAdult(term: string): Promise<BookRecord[]> {
  const results: BookRecord[] = [];
  const query = `${term} erotica romance`;
  try {
    const gData = await getJson(`https://gutendex.com/books?search=${encodeURIComponent(query)}&page=1`);
    for (const book of (gData.results || []).slice(0, 8)) {
      const normalized = normalizeGutenberg(book);
      if (normalized) results.push({ ...normalized, category: 'adult' as const });
    }
  } catch {}
  try {
    const archiveData = await getJson(`https://archive.org/advancedsearch.php?q=${encodeURIComponent(query + " AND mediatype:(texts)")}&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=creator&fl%5B%5D=year&fl%5B%5D=description&rows=10&page=1&output=json`);
    for (const item of (archiveData.response?.docs || []).slice(0, 8)) {
      const normalized = normalizeArchive(item, 'adult' as ContentCategory);
      if (normalized) results.push({ ...normalized, category: 'adult' as const });
    }
  } catch {}
  try {
    const olData = await getJson(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=10`);
    for (const doc of (olData.docs || []).slice(0, 8)) {
      const normalized = normalizeOpenLibrary(doc, 'adult' as ContentCategory);
      if (normalized) results.push({ ...normalized, category: 'adult' as const });
    }
  } catch {}
  return results;
}

function sourcesForCategory(category: ContentCategory): string[] {
  switch (category) {
    case 'magazine': return ['google', 'openlibrary', 'internetarchive'];
    case 'newspaper': return ['chroniclingamerica', 'internetarchive'];
    case 'story': return ['gutenberg', 'wikisource', 'internetarchive', 'poetrydb'];
    case 'art': return ['metmuseum', 'wikimediacommons'];
    case 'adult': return ['adult'];
    case 'book': return ['gutenberg', 'openlibrary', 'google', 'internetarchive', 'wolne'];
    default: return ['gutenberg', 'openlibrary', 'google', 'wikisource', 'internetarchive', 'wolne', 'poetrydb'];
  }
}

export const BUILTIN_SOURCE_NAMES: Record<string, string> = {
  google: 'Google Books',
  openlibrary: 'Open Library',
  gutenberg: '古登堡 / PoetryDB',
  internetarchive: 'Internet Archive',
  wikisource: '中文维基文库',
  chroniclingamerica: '历史报纸库',
  metmuseum: '大都会博物馆',
  wikimediacommons: 'Wikimedia Commons',
  wolne: 'Wolne Lektury',
};

const ENABLED_BUILTINS_KEY = 'miaobi.enabledSources.v1';

async function getEnabledBuiltinSources(): Promise<string[] | null> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const raw = await AsyncStorage.getItem(ENABLED_BUILTINS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}

export async function searchAllSources(queries: string[], category: ContentCategory = 'all', enabledBuiltins?: string[]): Promise<BookSearchResult> {
  const terms = queries.filter(Boolean).slice(0, 3);
  if (!terms.length) return { books: [], errors: [] };
  const available = sourcesForCategory(category);
  const stored = enabledBuiltins ?? await getEnabledBuiltinSources();
  const enabled = stored ? available.filter(source => stored.includes(source) || source === 'adult') : available;
  const tasks: Array<{ name: string; promise: Promise<BookRecord[]> }> = [];

  terms.forEach(term => {
    enabled.forEach(source => {
      switch (source) {
        case 'google': tasks.push({ name: 'Google Books', promise: searchGoogle(term) }); break;
        case 'openlibrary': tasks.push({ name: 'Open Library', promise: searchOpenLibrary(term, category === 'all' ? 'book' : category) }); break;
        case 'gutenberg': tasks.push({ name: '古登堡', promise: searchGutenberg(term) }); break;
        case 'internetarchive': tasks.push({ name: 'Internet Archive', promise: searchArchive(term, category === 'all' ? 'book' : category) }); break;
        case 'wikisource': tasks.push({ name: '中文维基文库', promise: searchWikisource(term) }); break;
        case 'chroniclingamerica': tasks.push({ name: '历史报纸', promise: searchNewspapers(term) }); break;
        case 'metmuseum': tasks.push({ name: '大都会博物馆', promise: searchMet(term) }); break;
        case 'wikimediacommons': tasks.push({ name: 'Wikimedia Commons', promise: searchCommons(term) }); break;
        case 'wolne': tasks.push({ name: 'Wolne Lektury', promise: searchWolne(term) }); break;
        case 'poetrydb': tasks.push({ name: 'PoetryDB', promise: searchPoetry(term) }); break;
        case 'adult': tasks.push({ name: '成人文学', promise: searchAdult(term) }); break;
      }
    });
  });

  const settled = await Promise.allSettled(tasks.map(task => task.promise));
  const books: BookRecord[] = [];
  const errors: string[] = [];
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') books.push(...result.value);
    else errors.push(tasks[index].name);
  });

  const seen = new Set<string>();
  const unique = books.filter(book => {
    const key = `${book.title.toLowerCase()}|${book.authors.join('|').toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => Number(b.locallyReadable) - Number(a.locallyReadable));

  return { books: unique.slice(0, 80), errors };
}

export async function resolveArchiveText(identifier: string): Promise<string | undefined> {
  const data = await getJson(`https://archive.org/metadata/${encodeURIComponent(identifier)}`);
  const files = data.files || [];
  const preferred =
    files.find((file: any) => file.format === 'Plain Text' && /\.txt$/i.test(file.name)) ||
    files.find((file: any) => /\.txt$/i.test(file.name)) ||
    files.find((file: any) => file.format === 'Text PDF');
  if (!preferred?.name) return undefined;
  return `https://archive.org/download/${encodeURIComponent(identifier)}/${preferred.name.split('/').map(encodeURIComponent).join('/')}`;
}

export async function resolveWikisourceText(title: string): Promise<string> {
  const url = `https://zh.wikisource.org/w/api.php?action=query&prop=extracts&explaintext=1&titles=${encodeURIComponent(title)}&format=json&origin=*`;
  const data = await getJson(url);
  const pages = Object.values(data.query?.pages || {}) as any[];
  return pages[0]?.extract || '';
}

function readPath(value: any, path?: string) {
  if (!path) return value;
  return path.split('.').reduce((current, key) => current?.[key], value);
}

function absoluteUrl(value: string, base: string) {
  try { return new URL(value, new URL(base).origin).toString(); }
  catch { return value; }
}

export async function searchCustomSource(source: CustomBookSource, term: string): Promise<BookRecord[]> {
  const url = source.searchUrl.replace(/\{query\}/g, encodeURIComponent(term));
  if (source.kind === 'json') {
    const data = await getJson(url);
    const rows = readPath(data, source.resultsPath) || data.results || data.books || data.items || data.docs || [];
    if (!Array.isArray(rows)) return [];
    return rows.map((row: any, index: number) => {
      const fields = source.fields as Record<string, string> | undefined;
      const field = (key: string) => fields?.[key] ? readPath(row, fields[key]) : row[key];
      const title = String(field('title') || '').trim();
      if (!title) return null;
      const downloadUrl = field('downloadUrl');
      return {
        id: `custom:${source.id}:${field('id') || `${Date.now()}_${index}`}`,
        source: 'local',
        sourceLabel: source.name,
        category: 'book',
        title,
        authors: [].concat(field('authors') || []).filter(Boolean),
        description: typeof field('description') === 'string' ? cleanHtml(field('description')) : undefined,
        coverUrl: field('coverUrl'),
        detailUrl: field('detailUrl'),
        downloadUrl,
        locallyReadable: Boolean(downloadUrl && /\.(txt|html?)($|\?)/i.test(String(downloadUrl))),
      };
    }).filter(Boolean) as BookRecord[];
  }

  const response = await fetch(url);
  const xml = await response.text();
  const entries = [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map(match => match[0]);
  return entries.map((entry, index) => {
    const title = cleanHtml(entry.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
    if (!title) return null;
    const links = [...entry.matchAll(/<link\b[^>]*>/gi)].map(linkXml => ({
      rel: linkXml[0].match(/rel=["']([^"']+)["']/i)?.[1] || '',
      type: linkXml[0].match(/type=["']([^"']+)["']/i)?.[1] || '',
      href: linkXml[0].match(/href=["']([^"']+)["']/i)?.[1] || '',
    }));
    const acquisition = links.find(link => /acquisition/i.test(link.rel) || /epub\+zip|text\/html|text\/plain/.test(link.type));
    const detail = links.find(link => /alternate|related/i.test(link.rel))?.href;
    const author = cleanHtml(entry.match(/<author[^>]*>[\s\S]*?<name[^>]*>([\s\S]*?)<\/name>[\s\S]*?<\/author>/i)?.[1] || '');
    const description = cleanHtml(entry.match(/<(?:summary|content)[^>]*>([\s\S]*?)<\/(?:summary|content)>/i)?.[1] || '');
    return {
      id: `custom:${source.id}:${encodeURIComponent(title)}_${index}`,
      source: 'local',
      sourceLabel: source.name,
      category: 'book',
      title,
      authors: author ? [author] : [],
      description,
      detailUrl: detail ? absoluteUrl(detail, url) : undefined,
      downloadUrl: acquisition?.href ? absoluteUrl(acquisition.href, url) : undefined,
      locallyReadable: Boolean(acquisition && /text\/plain|text\/html/i.test(acquisition.type)),
    };
  }).filter(Boolean) as BookRecord[];
}

export async function searchAllSourcesWithCustom(
  queries: string[],
  category: ContentCategory,
  customSources: CustomBookSource[] = [],
  enabledBuiltins?: string[],
): Promise<BookSearchResult> {
  const base = await searchAllSources(queries, category, enabledBuiltins);
  if (!customSources.length || category === 'art' || category === 'newspaper') return base;
  const tasks = queries.slice(0, 2).flatMap(term =>
    customSources.map(source => ({ source, promise: searchCustomSource(source, term) }))
  );
  const settled = await Promise.allSettled(tasks.map(task => task.promise));
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') base.books.unshift(...result.value);
    else base.errors.push(tasks[index].source.name);
  });
  const seen = new Set<string>();
  base.books = base.books.filter(book => {
    const key = `${book.title.toLowerCase()}|${book.authors.join('|').toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, 100);
  return base;
}

export function officialSearchLinks(title: string, author?: string) {
  const encoded = encodeURIComponent(`${title} ${author || ''}`.trim());
  return [
    { name: '微信读书', url: `https://weread.qq.com/web/search/books?keyword=${encoded}` },
    { name: '起点', url: `https://so.qidian.com/all?kw=${encoded}` },
    { name: '晋江文学城', url: `https://www.jjwxc.net/search.php?kw=${encoded}` },
    { name: '番茄小说', url: `https://fanqienovel.com/search/${encoded}` },
    { name: '豆瓣', url: `https://search.douban.com/book/subject_search?search_text=${encoded}` },
  ];
}
