export type BookSourceId =
  | 'google'
  | 'openlibrary'
  | 'gutenberg'
  | 'internetarchive'
  | 'wikisource'
  | 'chroniclingamerica'
  | 'metmuseum'
  | 'wikimediacommons'
  | 'local';

export type ContentCategory = 'all' | 'book' | 'magazine' | 'newspaper' | 'story' | 'art' | 'adult';

export interface BookRecord {
  id: string;
  source: BookSourceId;
  title: string;
  authors: string[];
  description?: string;
  coverUrl?: string;
  year?: number;
  language?: string;
  subjects?: string[];
  detailUrl?: string;
  downloadUrl?: string;
  readUrl?: string;
  localUri?: string;
  locallyReadable?: boolean;
  category: ContentCategory;
  sourceLabel: string;
}

export type ShelfStatus = 'want' | 'reading' | 'finished' | 'dropped';

export interface LibraryBook extends BookRecord {
  savedAt: string;
  status: ShelfStatus;
  progress: number;
  currentChapterIndex?: number;
  lastReadAt?: string;
  rating?: number;
  note?: string;
  importedAt?: string;
}

export interface ParsedBookQuery {
  queries: string[];
  language?: string;
  category?: ContentCategory;
  intent: string[];
  exclude?: string[];
}

export interface BookSearchResult {
  books: BookRecord[];
  errors: string[];
}

export type CustomSourceKind = 'json' | 'opds';

export interface CustomBookSource {
  id: string;
  name: string;
  kind: CustomSourceKind;
  searchUrl: string;
  resultsPath?: string;
  fields?: {
    id?: string;
    title?: string;
    authors?: string;
    description?: string;
    coverUrl?: string;
    detailUrl?: string;
    downloadUrl?: string;
  };
  createdAt: string;
}
