import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NovelProject, Chapter, Character, Foreshadowing, MemoryChunk, MemorySnapshot, NovelSettings, ChatMessage } from '../types/novel';

const PREFIX = 'miaobi.';

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
  return load<NovelSettings>('settings', {
    apiKey: '',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    temperature: 0.7,
    maxTokens: 12000,
    localThinking: false,
    customPrompt: '',
  });
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
  const list = await getNovels();
  const idx = list.findIndex(x => x.id === n.id);
  if (idx >= 0) list[idx] = n; else list.push(n);
  await save('novels', list);
}

export async function deleteNovel(id: string): Promise<void> {
  const novels = await getNovels();
  await save('novels', novels.filter(item => item.id !== id));
  await Promise.all([
    save(`chapters.${id}`, []),
    save(`chars.${id}`, []),
    save(`fs.${id}`, []),
    save(`mem.${id}`, []),
    save(`snap.${id}`, []),
    AsyncStorage.removeItem(`${PREFIX}chat.${id}`),
    AsyncStorage.removeItem(`${PREFIX}chat.free:${id}`),
    AsyncStorage.removeItem(`miaobi.ideas.${id}`),
  ]);
}

// ============================================================
// 章节
// ============================================================

export async function getChapters(novelId: string): Promise<Chapter[]> {
  return load<Chapter[]>(`chapters.${novelId}`, []);
}

export async function saveChapter(c: Chapter): Promise<void> {
  const list = await getChapters(c.novelId);
  const idx = list.findIndex(x => x.id === c.id);
  if (idx >= 0) list[idx] = c; else list.push(c);
  list.sort((a, b) => a.chapterNumber - b.chapterNumber);
  await save(`chapters.${c.novelId}`, list);
}

export async function getRecentChapters(novelId: string, count: number = 5): Promise<Chapter[]> {
  const all = await getChapters(novelId);
  return all.slice(-count);
}

// ============================================================
// 角色
// ============================================================

export async function getCharacters(novelId: string): Promise<Character[]> {
  return load<Character[]>(`chars.${novelId}`, []);
}

export async function saveCharacter(c: Character): Promise<void> {
  const list = await getCharacters(c.novelId);
  const idx = list.findIndex(x => x.id === c.id);
  if (idx >= 0) list[idx] = c; else list.push(c);
  await save(`chars.${c.novelId}`, list);
}

export async function deleteCharacter(novelId: string, id: string): Promise<void> {
  const list = await getCharacters(novelId);
  await save(`chars.${novelId}`, list.filter(x => x.id !== id));
}

// ============================================================
// 伏笔
// ============================================================

export async function getForeshadowing(novelId: string): Promise<Foreshadowing[]> {
  return load<Foreshadowing[]>(`fs.${novelId}`, []);
}

export async function saveForeshadowing(f: Foreshadowing): Promise<void> {
  const list = await getForeshadowing(f.novelId);
  const idx = list.findIndex(x => x.id === f.id);
  if (idx >= 0) list[idx] = f; else list.push(f);
  await save(`fs.${f.novelId}`, list);
}

// ============================================================
// 记忆块
// ============================================================

export async function getMemoryChunks(novelId: string): Promise<MemoryChunk[]> {
  return load<MemoryChunk[]>(`mem.${novelId}`, []);
}

export async function saveMemoryChunk(c: MemoryChunk): Promise<void> {
  const list = await getMemoryChunks(c.novelId);
  list.push(c);
  await save(`mem.${c.novelId}`, list);
}

// ============================================================
// 快照
// ============================================================

export async function getSnapshots(novelId: string): Promise<MemorySnapshot[]> {
  return load<MemorySnapshot[]>(`snap.${novelId}`, []);
}

export async function saveSnapshot(s: MemorySnapshot): Promise<void> {
  const list = await getSnapshots(s.novelId);
  list.push(s);
  await save(`snap.${s.novelId}`, list);
}


// ============================================================
// 快照创建（便捷函数）
// ============================================================

export async function createMemorySnapshot(novelId: string, label: string, chapterNumber: number, volumeNumber: number): Promise<MemorySnapshot> {
  const snap: MemorySnapshot = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    novelId,
    label,
    chapterNumber,
    volumeNumber,
    data: JSON.stringify({ timestamp: new Date().toISOString() }),
    createdAt: new Date().toISOString(),
  };
  await saveSnapshot(snap);
  return snap;
}

// ============================================================
// 对话历史（per novel）
// ============================================================

export async function getChatHistory(channel: string): Promise<ChatMessage[]> {
  return load<ChatMessage[]>(`chat.${channel}`, []);
}

export async function appendChatMessage(channel: string, msg: ChatMessage): Promise<void> {
  const list = await getChatHistory(channel);
  list.push(msg);
  await save(`chat.${channel}`, list);
}

export async function clearChatHistory(channel: string): Promise<void> {
  await save(`chat.${channel}`, []);
}
