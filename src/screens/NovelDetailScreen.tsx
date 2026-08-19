import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, StyleSheet, Alert, ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getStoryBible, updateNovelBible } from '../lib/novelMemory';
import { createMemorySnapshot } from '../lib/storage';
import { getChapters, getCharacters, getForeshadowing, getSnapshots } from '../lib/storage';
import { exportAsTxt, exportAsMarkdown, exportChapter } from '../lib/export';
import { truncate, formatTime } from '../lib/utils';
import type { NovelProject, Chapter, Character, Foreshadowing, MemorySnapshot } from '../types/novel';

const COLORS = {
  bg: '#0D0D0D', card: '#1A1A1A', border: '#2A2A2A',
  text: '#FFFFFF', sub: '#888888', accent: '#00FF41', danger: '#FF0044',
};

type Props = any;

export default function NovelDetailScreen({ navigation, route }: Props) {
  const { novelId } = route.params;
  const [novel, setNovel] = useState<NovelProject | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [foreshadowing, setForeshadowing] = useState<Foreshadowing[]>([]);
  const [snapshots, setSnapshots] = useState<MemorySnapshot[]>([]);
  const [tab, setTab] = useState<'chapters' | 'characters' | 'foreshadowing' | 'memory' | 'volumes'>('chapters');
  const [sortBy, setSortBy] = useState<'asc' | 'desc'>('asc');

  const reload = useCallback(() => {
    getStoryBible(novelId).then(setNovel);
    getChapters(novelId).then(list => {
      setChapters(sortBy === 'asc' ? list : [...list].reverse());
    });
    getCharacters(novelId).then(setCharacters);
    getForeshadowing(novelId).then(setForeshadowing);
    getSnapshots(novelId).then(setSnapshots);
  }, [novelId, sortBy]);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  if (!novel) return <View style={styles.container}><Text style={styles.loading}>加载中...</Text></View>;

  // ★ 多卷管理：按卷分组
  const chaptersByVolume: Record<number, Chapter[]> = {};
  for (const ch of chapters) {
    const vol = ch.volumeNumber || 1;
    if (!chaptersByVolume[vol]) chaptersByVolume[vol] = [];
    chaptersByVolume[vol].push(ch);
  }
  const volumes = Object.keys(chaptersByVolume).map(Number).sort((a, b) => a - b);

  const handleAddVolume = async () => {
    const newVol = (novel.totalVolumes || 1) + 1;
    await updateNovelBible(novelId, { totalVolumes: newVol, currentVolume: newVol });
    Alert.alert('✅ 新卷已创建', `第${newVol}卷`);
    reload();
  };

  const handleSnapshot = async () => {
    const snap = await createMemorySnapshot(novelId, `手动快照 — 第${novel.totalChapters}章`, novel.totalChapters, novel.currentVolume);
    Alert.alert('✅ 快照已创建', snap.label);
    reload();
  };

  const handleExport = (format: 'txt' | 'md') => {
    Alert.alert('导出小说', `确认导出为 ${format.toUpperCase()} 格式？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '导出', onPress: async () => {
          const ok = format === 'txt' ? await exportAsTxt(novelId) : await exportAsMarkdown(novelId);
          if (!ok) Alert.alert('提示', '没有可导出的章节');
        },
      },
    ]);
  };

  const handleExportChapter = async (ch: Chapter) => {
    await exportChapter(ch, novel.title);
  };

  const TABS = [
    { key: 'chapters', label: `📝 ${chapters.length}章` },
    { key: 'volumes', label: `📚 ${volumes.length}卷` },
    { key: 'characters', label: `👥 ${characters.length}人` },
    { key: 'foreshadowing', label: `🔮 ${foreshadowing.length}条` },
    { key: 'memory', label: `🧠 ${snapshots.length}快照` },
  ] as const;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.backBtn}>← 返回</Text></TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{novel.title}</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={() => navigation.navigate('Chat', { novelId })}><Text style={styles.chatBtn}>💬</Text></TouchableOpacity>
        </View>
      </View>

      {/* Novel Info + Actions */}
      <View style={styles.infoCard}>
        <Text style={styles.infoGenre}>{novel.genre} · 第{novel.currentVolume}卷</Text>
        <Text style={styles.infoSyn}>{novel.synopsis || '暂无简介'}</Text>
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => handleExport('txt')}>
            <Text style={styles.actionText}>📄 TXT</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => handleExport('md')}>
            <Text style={styles.actionText}>📝 MD</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={handleSnapshot}>
            <Text style={styles.actionText}>📸 快照</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        {TABS.map(t => (
          <TouchableOpacity key={t.key} style={[styles.tab, tab === t.key && styles.tabActive]} onPress={() => setTab(t.key)}>
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Chapters Tab */}
      {tab === 'chapters' && (
        <View style={{ flex: 1 }}>
          <View style={styles.sortRow}>
            <TouchableOpacity onPress={() => setSortBy(s => s === 'asc' ? 'desc' : 'asc')}>
              <Text style={styles.sortBtn}>{sortBy === 'asc' ? '↑ 正序' : '↓ 倒序'}</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={chapters}
            keyExtractor={c => c.id}
            contentContainerStyle={styles.list}
            ListEmptyComponent={<Text style={styles.empty}>还没有章节，去对话页开始写作吧 ✍️</Text>}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.card} onPress={() => handleExportChapter(item)}>
                <View style={styles.cardRow}>
                  <Text style={styles.cardTitle}>第{item.chapterNumber}章 {item.title}</Text>
                  <Text style={styles.cardBadge}>{item.wordCount}字</Text>
                </View>
                <Text style={styles.cardSummary}>{truncate(item.summary || item.body, 80)}</Text>
                <Text style={styles.cardMeta}>📅 {formatTime(item.createdAt)}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {/* Volumes Tab */}
      {tab === 'volumes' && (
        <ScrollView contentContainerStyle={styles.list}>
          {volumes.map(vol => (
            <View key={vol} style={styles.volSection}>
              <View style={styles.volHeader}>
                <Text style={styles.volTitle}>📚 第{vol}卷</Text>
                <Text style={styles.volCount}>{chaptersByVolume[vol].length}章</Text>
              </View>
              {chaptersByVolume[vol].map(ch => (
                <View key={ch.id} style={styles.volChapter}>
                  <Text style={styles.volChapterText}>第{ch.chapterNumber}章 {ch.title}</Text>
                  <Text style={styles.volChapterMeta}>{ch.wordCount}字</Text>
                </View>
              ))}
            </View>
          ))}
          <TouchableOpacity style={styles.addVolBtn} onPress={handleAddVolume}>
            <Text style={styles.addVolBtnText}>+ 新建一卷</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Characters Tab */}
      {tab === 'characters' && (
        <FlatList data={characters} keyExtractor={c => c.id} contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>还没有角色</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardRow}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <Text style={[styles.cardBadge, item.status === 'active' ? { color: COLORS.accent } : { color: COLORS.danger }]}>{item.status}</Text>
              </View>
              <Text style={styles.cardSummary}>性格：{item.traits}</Text>
              <Text style={styles.cardSummary}>当前：{item.currentState}</Text>
            </View>
          )}
        />
      )}

      {/* Foreshadowing Tab */}
      {tab === 'foreshadowing' && (
        <FlatList data={foreshadowing} keyExtractor={f => f.id} contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>还没有伏笔</Text>}
          renderItem={({ item }) => {
            const emoji: Record<string, string> = { planted: '🌱', developing: '🌿', resolving: '🔄', resolved: '✅', abandoned: '❌' };
            return (
              <View style={styles.card}>
                <View style={styles.cardRow}>
                  <Text style={styles.cardTitle}>{emoji[item.status]} {item.title}</Text>
                  <Text style={styles.cardBadge}>{item.status}</Text>
                </View>
                <Text style={styles.cardSummary}>{item.description}</Text>
                <Text style={styles.cardMeta}>埋于第{item.plantedChapter}章</Text>
              </View>
            );
          }}
        />
      )}

      {/* Memory Tab */}
      {tab === 'memory' && (
        <FlatList data={snapshots} keyExtractor={s => s.id} contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>还没有记忆快照</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>📸 {item.label}</Text>
              <Text style={styles.cardMeta}>第{item.chapterNumber}章 · {formatTime(item.createdAt)}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  loading: { color: COLORS.sub, textAlign: 'center', marginTop: 100 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 12 },
  backBtn: { fontSize: 14, color: COLORS.accent },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text, flex: 1, textAlign: 'center', marginHorizontal: 12 },
  headerRight: { flexDirection: 'row', gap: 8 },
  chatBtn: { fontSize: 20 },
  infoCard: { marginHorizontal: 16, backgroundColor: COLORS.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: COLORS.border, marginBottom: 8 },
  infoGenre: { fontSize: 12, color: COLORS.accent, fontWeight: '600' },
  infoSyn: { fontSize: 13, color: COLORS.sub, marginTop: 6, lineHeight: 18 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  actionBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: '#2A2A2A' },
  actionText: { fontSize: 11, color: COLORS.text },
  tabBar: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, gap: 6, flexWrap: 'wrap' },
  tab: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border },
  tabActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  tabText: { fontSize: 11, color: COLORS.sub },
  tabTextActive: { color: '#000', fontWeight: '600' },
  sortRow: { paddingHorizontal: 16, paddingVertical: 4 },
  sortBtn: { fontSize: 12, color: COLORS.accent },
  list: { padding: 16, paddingBottom: 40 },
  empty: { color: COLORS.sub, textAlign: 'center', marginTop: 40, fontSize: 14 },
  card: { backgroundColor: COLORS.card, borderRadius: 10, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '600', color: COLORS.text, flex: 1 },
  cardBadge: { fontSize: 11, color: COLORS.sub },
  cardSummary: { fontSize: 13, color: COLORS.sub, marginTop: 6, lineHeight: 18 },
  cardMeta: { fontSize: 12, color: COLORS.sub, marginTop: 6 },
  volSection: { marginBottom: 16 },
  volHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  volTitle: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  volCount: { fontSize: 12, color: COLORS.sub },
  volChapter: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 6, backgroundColor: COLORS.card, borderRadius: 8, marginBottom: 4 },
  volChapterText: { fontSize: 13, color: COLORS.text },
  volChapterMeta: { fontSize: 12, color: COLORS.sub },
  addVolBtn: { marginTop: 8, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: COLORS.accent, borderStyle: 'dashed', alignItems: 'center' },
  addVolBtnText: { fontSize: 14, color: COLORS.accent },
});
