import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, StyleSheet, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
// navigation types simplified
import { getStoryBible } from '../lib/novelMemory';
import { getChapters, getCharacters, getForeshadowing, getSnapshots } from '../lib/storage';
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
  const [tab, setTab] = useState<'chapters' | 'characters' | 'foreshadowing' | 'memory'>('chapters');

  useFocusEffect(
    useCallback(() => {
      getStoryBible(novelId).then(setNovel);
      getChapters(novelId).then(setChapters);
      getCharacters(novelId).then(setCharacters);
      getForeshadowing(novelId).then(setForeshadowing);
      getSnapshots(novelId).then(setSnapshots);
    }, [novelId])
  );

  if (!novel) return <View style={styles.container}><Text style={styles.loading}>加载中...</Text></View>;

  const TABS = [
    { key: 'chapters', label: `📝 ${chapters.length}章` },
    { key: 'characters', label: `👥 ${characters.length}人` },
    { key: 'foreshadowing', label: `🔮 ${foreshadowing.length}条` },
    { key: 'memory', label: `🧠 ${snapshots.length}快照` },
  ] as const;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backBtn}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{novel.title}</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Chat', { novelId })}>
          <Text style={styles.chatBtn}>💬</Text>
        </TouchableOpacity>
      </View>

      {/* Novel Info */}
      <View style={styles.infoCard}>
        <Text style={styles.infoGenre}>{novel.genre}</Text>
        <Text style={styles.infoSyn}>{novel.synopsis || '暂无简介'}</Text>
        <Text style={styles.infoMeta}>
          📝 {novel.totalChapters}章 · 📅 {formatTime(novel.updatedAt)}
        </Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, tab === t.key && styles.tabActive]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {tab === 'chapters' && (
        <FlatList
          data={chapters}
          keyExtractor={c => c.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>还没有章节，去对话页开始写作吧 ✍️</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card}>
              <Text style={styles.cardTitle}>第{item.chapterNumber}章 {item.title}</Text>
              <Text style={styles.cardSummary}>{truncate(item.summary || item.body, 80)}</Text>
              <Text style={styles.cardMeta}>{item.wordCount}字 · {formatTime(item.createdAt)}</Text>
            </TouchableOpacity>
          )}
        />
      )}

      {tab === 'characters' && (
        <FlatList
          data={characters}
          keyExtractor={c => c.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>还没有角色</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardRow}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <Text style={[styles.badge, item.status === 'active' ? styles.badgeGreen : styles.badgeRed]}>
                  {item.status}
                </Text>
              </View>
              <Text style={styles.cardSummary}>性格：{item.traits}</Text>
              <Text style={styles.cardSummary}>当前：{item.currentState}</Text>
            </View>
          )}
        />
      )}

      {tab === 'foreshadowing' && (
        <FlatList
          data={foreshadowing}
          keyExtractor={f => f.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>还没有伏笔</Text>}
          renderItem={({ item }) => {
            const emoji: Record<string, string> = { planted: '🌱', developing: '🌿', resolving: '🔄', resolved: '✅', abandoned: '❌' };
            return (
              <View style={styles.card}>
                <View style={styles.cardRow}>
                  <Text style={styles.cardTitle}>{emoji[item.status]} {item.title}</Text>
                  <Text style={styles.badge}>{item.status}</Text>
                </View>
                <Text style={styles.cardSummary}>{item.description}</Text>
                <Text style={styles.cardMeta}>埋于第{item.plantedChapter}章</Text>
              </View>
            );
          }}
        />
      )}

      {tab === 'memory' && (
        <FlatList
          data={snapshots}
          keyExtractor={s => s.id}
          contentContainerStyle={styles.list}
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
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 50, paddingBottom: 12,
  },
  backBtn: { fontSize: 14, color: COLORS.accent },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text, flex: 1, textAlign: 'center', marginHorizontal: 12 },
  chatBtn: { fontSize: 20 },
  infoCard: {
    marginHorizontal: 16, backgroundColor: COLORS.card, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 8,
  },
  infoGenre: { fontSize: 12, color: COLORS.accent, fontWeight: '600' },
  infoSyn: { fontSize: 13, color: COLORS.sub, marginTop: 6, lineHeight: 18 },
  infoMeta: { fontSize: 12, color: COLORS.sub, marginTop: 8 },
  tabBar: {
    flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8, gap: 8,
  },
  tab: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
  },
  tabActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  tabText: { fontSize: 12, color: COLORS.sub },
  tabTextActive: { color: '#000', fontWeight: '600' },
  list: { padding: 16, paddingBottom: 40 },
  empty: { color: COLORS.sub, textAlign: 'center', marginTop: 40, fontSize: 14 },
  card: {
    backgroundColor: COLORS.card, borderRadius: 10, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: COLORS.border,
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '600', color: COLORS.text, flex: 1 },
  cardSummary: { fontSize: 13, color: COLORS.sub, marginTop: 6, lineHeight: 18 },
  cardMeta: { fontSize: 12, color: COLORS.sub, marginTop: 6 },
  badge: {
    fontSize: 11, color: COLORS.sub, paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 10, backgroundColor: '#2A2A2A', overflow: 'hidden',
  },
  badgeGreen: { color: COLORS.accent },
  badgeRed: { color: COLORS.danger },
});
