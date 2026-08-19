// 六层记忆类型定义

export interface NovelProject {
  id: string;
  title: string;
  genre: string;
  synopsis: string;
  styleGuide: string;
  totalVolumes: number;
  currentVolume: number;
  totalChapters: number;
  createdAt: string;
  updatedAt: string;
}

export interface Chapter {
  id: string;
  novelId: string;
  volumeNumber: number;
  chapterNumber: number;
  title: string;
  body: string;
  summary: string;
  status: 'drafting' | 'completed' | 'frozen';
  wordCount: number;
  createdAt: string;
}

export interface Character {
  id: string;
  novelId: string;
  name: string;
  traits: string;
  backstory: string;
  currentState: string;
  firstAppearance: number;
  lastAppearance: number;
  status: 'active' | 'dead' | 'missing' | 'inactive';
  dialogueStyle?: string;
  updatedAt: string;
}

export interface CharacterDiff {
  id: string;
  novelId: string;
  characterName: string;
  chapterNumber: number;
  field: string;
  oldValue: string;
  newValue: string;
  createdAt: string;
}

export interface Foreshadowing {
  id: string;
  novelId: string;
  title: string;
  description: string;
  plantedChapter: number;
  resolvedChapter: number | null;
  status: 'planted' | 'developing' | 'resolving' | 'resolved' | 'abandoned';
  relatedCharacters: string[];
  createdAt: string;
}

export interface MemoryChunk {
  id: string;
  novelId: string;
  layer: 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5';
  chapterFrom: number;
  chapterTo: number;
  volumeNumber: number;
  content: string;
  frozen: boolean;
  createdAt: string;
}

export interface MemorySnapshot {
  id: string;
  novelId: string;
  label: string;
  chapterNumber: number;
  volumeNumber: number;
  data: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export interface NovelSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  ollamaUrl: string;
  ollamaModel: string;
}

export interface AppState {
  settings: NovelSettings;
  novels: NovelProject[];
  currentNovel: NovelProject | null;
}
