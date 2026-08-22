import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, StatusBar, Dimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getNovels, deleteNovel } from '../lib/storage';
import { getChapters } from '../lib/storage';
import { truncate } from '../lib/utils';
import CapsuleAlert from '../components/CapsuleAlert';
import { T } from '../lib/theme';
import { Icon } from '../lib/icons';
import type { NovelProject } from '../types/novel';

type Props = any;
const { width: SCREEN_W } = Dimensions.get('window');
const BOOK_W = (SCREEN_W - 48) / 3;
const BOOK_H = BOOK_W * 1.4;

const COVER_COLORS = [
  ['#242424', '#111'],
  ['#2E2E2E', '#161616'],
  ['#383838', '#1A1A1A'],
  ['#424242', '#1F1F1F'],
  ['#4A4A4A', '#242424'],
  ['#333', '#141414'],
  ['#3B3B3B', '#181818'],
  ['#454545', '#202020'],
];

export default function HomeScreen({ navigation }: Props) {
  const [novels, setNovels] = useState<NovelProject[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<NovelProject | null>(null);
  const [chapterCounts, setChapterCounts] = useState<Record<string, number>>({});

  useFocusEffect(useCallback(() => {
    getNovels().then(async list => {
      setNovels(list);
      const counts = await Promise.all(list.map(async item => [item.id, (await getChapters(item.id)).length] as const));
      setChapterCounts(Object.fromEntries(counts));
    });
  }, []));

  const renderBook = ({ item, index }: { item: NovelProject; index: number }) => {
    const colors = COVER_COLORS[index % COVER_COLORS.length];
    const count = chapterCounts[item.id] || 0;

    return (
      <TouchableOpacity
        style={s.bookWrap}
        activeOpacity={0.7}
        onPress={() => navigation.navigate(count > 0 ? 'Reader' : 'NovelDetail', { novelId: item.id })}
        onLongPress={() => setDeleteTarget(item)}
      >
        <View style={[s.bookCover, { backgroundColor: colors[0] }]}>
          <View style={s.bookSpine} />
          <View style={s.bookContent}>
            <Text style={s.bookTitle} numberOfLines={4}>{item.title}</Text>
            <View style={s.bookDivider} />
            <Text style={s.bookGenre}>{item.genre}</Text>
          </View>
          <View style={[s.bookBottom, { backgroundColor: colors[1] }]}>
            <Text style={s.bookChapters}>{count} 章</Text>
          </View>
        </View>
        
        <View style={s.bookActions}>
          <TouchableOpacity style={s.actionBtn} onPress={() => {
            if (count > 0) navigation.navigate('Reader', { novelId: item.id });
          }}>
            <Icon.book size={12} color={count > 0 ? T.accent : T.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={s.actionBtn} onPress={() => navigation.navigate('WritingChat', { novelId: item.id })}>
            <Icon.write size={12} color={T.text} />
          </TouchableOpacity>
          <TouchableOpacity style={s.actionBtn} onPress={() => navigation.navigate('FreeChat', { novelId: item.id })}>
            <Icon.chat size={12} color={T.textSec} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={T.bg} />

      <View style={s.header}>
        <View style={s.headerLeft}>
          <View style={s.logoWrap}>
            <Icon.logo size={20} color={T.accent} />
          </View>
          <Text style={s.logoText}>妙笔</Text>
        </View>
        <View style={s.headerRight}>
          <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={s.headerBtn}>
            <Icon.settings size={18} color={T.textSec} />
          </TouchableOpacity>
        </View>
      </View>

      {novels.length > 0 && (
        <View style={s.shelfHeader}>
          <Text style={s.shelfTitle}>我的书架</Text>
          <Text style={s.shelfCount}>{novels.length} 部</Text>
        </View>
      )}

      {novels.length === 0 ? (
        <View style={s.empty}>
          <View style={s.emptyIconWrap}>
            <Icon.book size={48} color={T.accent} />
          </View>
          <Text style={s.emptyTitle}>书架空空如也</Text>
          <Text style={s.emptySub}>点击右下角开始你的第一部作品</Text>
        </View>
      ) : (
        <FlatList
          data={novels}
          keyExtractor={item => item.id}
          numColumns={3}
          contentContainerStyle={s.shelfList}
          columnWrapperStyle={s.shelfRow}
          renderItem={renderBook}
        />
      )}

      <TouchableOpacity style={s.fab} onPress={() => navigation.navigate('CreateNovel')} activeOpacity={0.8}>
        <Icon.add size={19} color="#0D0D0D" />
      </TouchableOpacity>

      <CapsuleAlert
        visible={!!deleteTarget}
        title="删除作品"
        message={deleteTarget ? `确定删除「${deleteTarget.title}」？\n所有章节和记忆将被清除。` : ''}
        danger
        confirmText="删除"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (deleteTarget) {
            await deleteNovel(deleteTarget.id);
            setNovels(prev => prev.filter(n => n.id !== deleteTarget.id));
            setDeleteTarget(null);
          }
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: T.sp.xl, paddingTop: (StatusBar.currentHeight || 44) + 8, paddingBottom: T.sp.md },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoWrap: { width: 32, height: 32, borderRadius: 10, backgroundColor: T.accent + '15', justifyContent: 'center', alignItems: 'center' },
  logoText: { fontSize: 22, fontWeight: '800', color: T.text, letterSpacing: 0.5 },
  headerRight: { flexDirection: 'row', gap: 8 },
  headerBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: T.card, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: T.border },
  shelfHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: T.sp.xl, marginBottom: T.sp.md },
  shelfTitle: { fontSize: 16, fontWeight: '700', color: T.text },
  shelfCount: { fontSize: 13, color: T.textMuted },
  shelfList: { paddingHorizontal: T.sp.lg, paddingBottom: 100 },
  shelfRow: { justifyContent: 'flex-start', gap: 12, marginBottom: T.sp.md },
  bookWrap: { width: BOOK_W, alignItems: 'center' },
  bookCover: { width: BOOK_W, height: BOOK_H, borderRadius: 6, overflow: 'hidden', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4 },
  bookSpine: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: 'rgba(0,0,0,0.2)' },
  bookContent: { flex: 1, padding: 8, paddingTop: 12, justifyContent: 'center' },
  bookTitle: { fontSize: 11, fontWeight: '700', color: '#FFF', lineHeight: 14, textAlign: 'center' },
  bookDivider: { width: 20, height: 1, backgroundColor: 'rgba(255,255,255,0.3)', marginVertical: 6, alignSelf: 'center' },
  bookGenre: { fontSize: 9, color: 'rgba(255,255,255,0.7)', textAlign: 'center' },
  bookBottom: { paddingVertical: 4, alignItems: 'center' },
  bookChapters: { fontSize: 9, color: 'rgba(255,255,255,0.9)', fontWeight: '600' },
  bookActions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  actionBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 80 },
  emptyIconWrap: { width: 80, height: 80, borderRadius: 24, backgroundColor: T.accent + '10', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: T.text, marginBottom: 8 },
  emptySub: { fontSize: 14, color: T.textMuted },
  fab: { position: 'absolute', bottom: 32, right: 24, width: 44, height: 44, borderRadius: 14, backgroundColor: T.accent, justifyContent: 'center', alignItems: 'center', elevation: 12, shadowColor: T.accent, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 12 },
});
