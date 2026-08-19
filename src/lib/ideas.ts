import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Idea {
  id: string;
  novelId: string;
  content: string;
  tags: string[];
  createdAt: string;
}

const KEY = 'miaobi.ideas.';

export async function getIdeas(novelId: string): Promise<Idea[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY + novelId);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function addIdea(novelId: string, content: string, tags: string[] = []): Promise<Idea> {
  const ideas = await getIdeas(novelId);
  const idea: Idea = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    novelId, content, tags,
    createdAt: new Date().toISOString(),
  };
  ideas.push(idea);
  await AsyncStorage.setItem(KEY + novelId, JSON.stringify(ideas));
  return idea;
}

export async function deleteIdea(novelId: string, id: string): Promise<void> {
  const ideas = await getIdeas(novelId);
  await AsyncStorage.setItem(KEY + novelId, JSON.stringify(ideas.filter(i => i.id !== id)));
}
