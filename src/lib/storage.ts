import AsyncStorage from '@react-native-async-storage/async-storage';
import { INJECTED_KEYS } from '../config/keys';
import type { NovelProject, Chapter, Character, Foreshadowing, MemoryChunk, MemorySnapshot, NovelSettings, ChatMessage } from '../types/novel';

const PREFIX = 'miaobi.';

// 串行化所有读写操作，避免并发 read-modify-write 丢数据
let storageChain: Promise<unknown> = Promise.resolve();
async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = storageChain.then(fn, fn);
  storageChain = run.then(() => undefined, () => undefined);
  return run;
}

// ============================================================
// 通用存取
// ============================================================

async function load<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

async function save<T>(key: string, data: T): Promise<void> {
  await AsyncStorage.setItem(PREFIX + key, JSON.stringify(data));
}

// ============================================================
// 设置
// ============================================================

export async function getSettings(): Promise<NovelSettings> {
  const s = await load<NovelSettings>('settings', {
    apiKey: '',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    temperature: 0.7,
    maxTokens: 12000,
    localThinking: false,
    customPrompt: '',
    adultContent: true,
    useLocalModels: false,
    privacyMode: false,
    adultLocalPreferred: true,
    adultLocalFallbackToCloud: true,
    adultLocalBaseUrl: 'http://127.0.0.1:11434',
    adultLocalModel: '',
    adultLocalProvider: 'ollama',
    freeLlmApiBaseUrl: '',
    freeLlmApiKey: '',
    adultGatewayEnabled: true,
    adultGatewayModels: ['gryphe/mythomax-l2-13b', 'sao10k/l3-lunaris-8b', 'anthracite-org/magnum-v4-72b'],
  });
  if (!s.freeLlmApiKey && (s as any).openRouterApiKey) s.freeLlmApiKey = (s as any).openRouterApiKey;
  if (!s.adultGatewayModels?.length && Array.isArray((s as any).adultOpenRouterModels)) s.adultGatewayModels = (s as any).adultOpenRouterModels;
  if (s.adultGatewayEnabled === undefined && (s as any).adultOpenRouterEnabled !== undefined) s.adultGatewayEnabled = (s as any).adultOpenRouterEnabled;
  // Fallback: if no key configured, use injected key
  if (!s.apiKey && INJECTED_KEYS.deepseek) {
    s.apiKey = INJECTED_KEYS.deepseek;
  }
  return s;
}

export async function saveSettings(s: NovelSettings): Promise<void> {
  await save('settings', s);
}

// ============================================================
// 小说项目
// ============================================================

export async function getNovels(): Promise<NovelProject[]> {
  return load<NovelProject[]>('novels', []);
}

export async function saveNovel(n: NovelProject): Promise<void> {
  await withLock(async () => {
    const list = await getNovels();
    const idx = list.findIndex(x => x.id === n.id);
    if (idx >= 0) list[idx] = n; else list.push(n);
    await save('novels', list);
  });
}

// ============================================================
// 章节
// ============================================================

export async function getChapters(novelId: string): Promise<Chapter[]> {
  return load<Chapter[]>(`chapters.${novelId}`, []);
}

export async function saveChapter(c: Chapter): Promise<void> {
  await withLock(async () => {
    const list = await getChapters(c.novelId);
    const idx = list.findIndex(x => x.id === c.id);
    if (idx >= 0) {
      // 版本历史：保存上一版到 revisions（最多 10 份）
      const prev = list[idx];
      const revisions = Array.isArray(prev.revisions) ? prev.revisions : [];
      revisions.push({ content: prev.body, title: prev.title, savedAt: prev.updatedAt || prev.createdAt });
      c = { ...c, revisions: revisions.slice(-10) };
      list[idx] = c;
    } else {
      list.push(c);
    }
    list.sort((a, b) => a.chapterNumber - b.chapterNumber);
    await save(`chapters.${c.novelId}`, list);
  });
}

// ============================================================
// 角色
// ============================================================

export async function getCharacters(novelId: string): Promise<Character[]> {
  return load<Character[]>(`chars.${novelId}`, []);
}

export async function saveCharacter(c: Character): Promise<void> {
  await withLock(async () => {
    const list = await getCharacters(c.novelId);
    const idx = list.findIndex(x => x.id === c.id);
    if (idx >= 0) list[idx] = c; else list.push(c);
    await save(`chars.${c.novelId}`, list);
  });
}

export async function deleteCharacter(novelId: string, id: string): Promise<void> {
  await withLock(async () => {
    const list = await getCharacters(novelId);
    await save(`chars.${novelId}`, list.filter(x => x.id !== id));
  });
}

// ============================================================
// 伏笔
// ============================================================

export async function getForeshadowing(novelId: string): Promise<Foreshadowing[]> {
  return load<Foreshadowing[]>(`fs.${novelId}`, []);
}

export async function saveForeshadowing(f: Foreshadowing): Promise<void> {
  await withLock(async () => {
    const list = await getForeshadowing(f.novelId);
    const idx = list.findIndex(x => x.id === f.id);
    if (idx >= 0) list[idx] = f; else list.push(f);
    await save(`fs.${f.novelId}`, list);
  });
}

// ============================================================
// 记忆块
// ============================================================

export async function getMemoryChunks(novelId: string): Promise<MemoryChunk[]> {
  return load<MemoryChunk[]>(`mem.${novelId}`, []);
}

export async function saveMemoryChunk(c: MemoryChunk): Promise<void> {
  await withLock(async () => {
    const list = await getMemoryChunks(c.novelId);
    list.push(c);
    await save(`mem.${c.novelId}`, list);
  });
}

// ============================================================
// 快照
// ============================================================

export async function getSnapshots(novelId: string): Promise<MemorySnapshot[]> {
  return load<MemorySnapshot[]>(`snap.${novelId}`, []);
}

export async function saveSnapshot(s: MemorySnapshot): Promise<void> {
  await withLock(async () => {
    const list = await getSnapshots(s.novelId);
    list.push(s);
    await save(`snap.${s.novelId}`, list);
  });
}


// ============================================================
// 快照创建（便捷函数）
// ============================================================

// ============================================================
// 对话历史（per novel）
// ============================================================

export async function getChatHistory(channel: string): Promise<ChatMessage[]> {
  return load<ChatMessage[]>(`chat.${channel}`, []);
}

export async function appendChatMessage(channel: string, msg: ChatMessage): Promise<void> {
  await withLock(async () => {
    const list = await getChatHistory(channel);
    list.push(msg);
    await save(`chat.${channel}`, list);
  });
}
