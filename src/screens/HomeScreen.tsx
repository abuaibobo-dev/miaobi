import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, StyleSheet, Alert, StatusBar,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
// navigation types simplified
import { getNovels, deleteNovel } from '../lib/storage';
import { truncate, formatTime } from '../lib/utils';
import type { NovelProject } from '../types/novel';

const COLORS = {
  bg: '#0D0D0D',
  card: '#1A1A1A',
  border: '#2A2A2A',
  text: '#FFFFFF',
  sub: '#888888',
  accent: '#00FF41',
  danger: '#FF0044',
};

type Props = any;

export default function HomeScreen({ navigation }: Props) {
  const [novels, setNovels] = useState<NovelProject[]>([]);

  useFocusEffect(
    useCallback(() => {
      getNovels().then(setNovels);
    }, [])
  );

  const handleDelete = (novel: NovelProject) => {
    Alert.alert(
      '删除小说',
      `确定删除「${novel.title}」？所有章节和记忆将被清除。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除', style: 'destructive',
          onPress: async () => {
            await deleteNovel(novel.id);
            setNovels(prev => prev.filter(n => n.id !== novel.id));
          },
        },
      ]
    );
  };

  const handleNew = () => {
    navigation.navigate('CreateNovel');
  };

  const handleOpen = (novel: NovelProject) => {
    navigation.navigate('NovelDetail', { novelId: novel.id });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0D0D0D" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>✍️ 妙笔</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={styles.settingsBtn}>
          <Text style={styles.settingsText}>⚙️</Text>
        </TouchableOpacity>
      </View>

      {/* Novel List */}
      {novels.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📖</Text>
          <Text style={styles.emptyTitle}>还没有作品</Text>
          <Text style={styles.emptySub}>点击下方按钮，开始你的第一部小说</Text>
        </View>
      ) : (
        <FlatList
          data={novels}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => handleOpen(item)}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <TouchableOpacity onPress={() => handleDelete(item)}>
                  <Text style={styles.deleteBtn}>🗑️</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.cardGenre}>{item.genre}</Text>
              <Text style={styles.cardSynopsis}>{truncate(item.synopsis, 60)}</Text>
              <View style={styles.cardFooter}>
                <Text style={styles.cardMeta}>📝 {item.totalChapters}章</Text>
                <Text style={styles.cardMeta}>📅 {formatTime(item.updatedAt)}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={handleNew}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 50, paddingBottom: 16,
  },
  logo: { fontSize: 22, fontWeight: 'bold', color: COLORS.text },
  settingsBtn: { padding: 8 },
  settingsText: { fontSize: 20 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: COLORS.text, marginBottom: 8 },
  emptySub: { fontSize: 14, color: COLORS.sub, textAlign: 'center' },
  list: { paddingHorizontal: 16, paddingBottom: 100 },
  card: {
    backgroundColor: COLORS.card, borderRadius: 12, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: COLORS.border,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text, flex: 1 },
  deleteBtn: { fontSize: 16, padding: 4 },
  cardGenre: { fontSize: 12, color: COLORS.accent, marginTop: 4 },
  cardSynopsis: { fontSize: 13, color: COLORS.sub, marginTop: 8, lineHeight: 18 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  cardMeta: { fontSize: 12, color: COLORS.sub },
  fab: {
    position: 'absolute', bottom: 30, right: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: COLORS.accent, justifyContent: 'center', alignItems: 'center',
    elevation: 8, shadowColor: COLORS.accent, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8,
  },
  fabText: { fontSize: 28, color: '#000', fontWeight: 'bold', marginTop: -2 },
});
