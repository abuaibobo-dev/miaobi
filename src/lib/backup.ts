import { Paths, File, EncodingType } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Store from './storage';
import type { NovelProject } from '../types/novel';

export async function exportBackup(): Promise<boolean> {
  const novels = await Store.getNovels();
  const settings = await Store.getSettings();

  const { apiKey, ...safeSettings } = settings;
  const backup: any = { version: '1.1.0', exportedAt: new Date().toISOString(), settings: safeSettings, novels: [] };

  for (const novel of novels) {
    const chapters = await Store.getChapters(novel.id);
    const characters = await Store.getCharacters(novel.id);
    const foreshadowing = await Store.getForeshadowing(novel.id);
    const chunks = await Store.getMemoryChunks(novel.id);
    const snapshots = await Store.getSnapshots(novel.id);
    const chat = await Store.getChatHistory(novel.id);
    backup.novels.push({ ...novel, chapters, characters, foreshadowing, memoryChunks: chunks, snapshots, chatHistory: chat });
  }

  const allKeys = await AsyncStorage.getAllKeys();
  const chatKeys = allKeys.filter(key => key.startsWith('miaobi.chat.'));
  const chatChannels: Array<{ channel: string; messages: any[] }> = [];
  for (const key of chatKeys) {
    try {
      const messages = JSON.parse(await AsyncStorage.getItem(key) || '[]');
      if (Array.isArray(messages) && messages.length) {
        chatChannels.push({ channel: key.replace('miaobi.chat.', ''), messages });
      }
    } catch {}
  }
  backup.chatChannels = chatChannels;

  const json = JSON.stringify(backup, null, 2);
  const file = new File(Paths.document, `妙笔备份_${new Date().toISOString().slice(0, 10)}.json`);
  await file.write(json, { encoding: EncodingType.UTF8 });
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: '导出妙笔数据' });
  return true;
}

export async function restoreFromBackup(jsonString: string): Promise<{ success: boolean; message: string }> {
  try {
    const backup = JSON.parse(jsonString);
    if (!backup.version || (!backup.novels && !backup.chatChannels)) return { success: false, message: '备份文件格式无效' };

    let novelCount = 0, chapterCount = 0;
    if (backup.settings) {
      const current = await Store.getSettings();
      await Store.saveSettings({ ...current, ...backup.settings, apiKey: current.apiKey });
    }

    for (const novelData of (Array.isArray(backup.novels) ? backup.novels : [])) {
      const { chapters, characters, foreshadowing, memoryChunks, snapshots, chatHistory, ...novel } = novelData;
      await Store.saveNovel(novel); novelCount++;
      for (const ch of (chapters || [])) { await Store.saveChapter(ch); chapterCount++; }
      for (const c of (characters || [])) await Store.saveCharacter(c);
      for (const f of (foreshadowing || [])) await Store.saveForeshadowing(f);
      for (const m of (memoryChunks || [])) await Store.saveMemoryChunk(m);
      for (const s of (snapshots || [])) await Store.saveSnapshot(s);
      if (chatHistory?.length > 0) await AsyncStorage.setItem(`miaobi.chat.${novel.id}`, JSON.stringify(chatHistory));
    }

    for (const item of (Array.isArray(backup.chatChannels) ? backup.chatChannels : [])) {
      if (!item?.channel || !Array.isArray(item.messages)) continue;
      await AsyncStorage.setItem(`miaobi.chat.${item.channel}`, JSON.stringify(item.messages));
    }

    return { success: true, message: `恢复完成：${novelCount} 部小说，${chapterCount} 个章节` };
  } catch (e: any) {
    return { success: false, message: `恢复失败：${e.message}` };
  }
}
