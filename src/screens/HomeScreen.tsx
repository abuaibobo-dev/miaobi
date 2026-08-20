import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, StatusBar } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getNovels, deleteNovel } from '../lib/storage';
import { truncate, formatTime } from '../lib/utils';
import CapsuleAlert from '../components/CapsuleAlert';
import { T } from '../lib/theme';
import { Icon } from '../lib/icons';
import type { NovelProject } from '../types/novel';

type Props = any;

export default function HomeScreen({ navigation }: Props) {
  const [novels, setNovels] = useState<NovelProject[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<NovelProject | null>(null);

  useFocusEffect(useCallback(() => { getNovels().then(setNovels); }, []));

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
          <TouchableOpacity onPress={() => navigation.navigate('AutoWrite', { novelId: null })} style={s.headerBtn}>
            <Icon.autoWrite size={18} color={T.accent} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={s.headerBtn}>
            <Icon.settings size={18} color={T.textSec} />
          </TouchableOpacity>
        </View>
      </View>

      {novels.length > 0 && (
        <Text style={s.subtitle}>{novels.length} 部作品</Text>
      )}

      {novels.length === 0 ? (
        <View style={s.empty}>
          <View style={s.emptyIconWrap}>
            <Icon.book size={40} color={T.accent} />
          </View>
          <Text style={s.emptyTitle}>开始创作</Text>
          <Text style={s.emptySub}>你的第一部小说，从这里出发</Text>
        </View>
      ) : (
        <FlatList
          data={novels}
          keyExtractor={item => item.id}
          contentContainerStyle={s.list}
          renderItem={({ item, index }) => (
            <TouchableOpacity style={s.card} onPress={() => navigation.navigate('NovelDetail', { novelId: item.id })} activeOpacity={0.7}>
              <View style={[s.cardAccent, { backgroundColor: index % 3 === 0 ? T.accent : index % 3 === 1 ? T.accentPink : T.accentBlue }]} />
              <View style={s.cardBody}>
                <View style={s.cardRow}>
                  <Text style={s.cardTitle} numberOfLines={1}>{item.title}</Text>
                  <TouchableOpacity onPress={() => setDeleteTarget(item)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Icon.delete size={14} color={T.textMuted} />
                  </TouchableOpacity>
                </View>
                <View style={s.cardMeta}>
                  <View style={s.genreBadge}>
                    <Text style={s.genreText}>{item.genre}</Text>
                  </View>
                  <Text style={s.cardChapters}>{item.totalChapters} 章</Text>
                </View>
                <Text style={s.cardSynopsis} numberOfLines={2}>{truncate(item.synopsis, 80)}</Text>
                <View style={s.cardFooter}>
                  <Text style={s.cardTime}>{formatTime(item.updatedAt)}</Text>
                  <TouchableOpacity style={s.continueBtn} onPress={() => navigation.navigate('Chat', { novelId: item.id })}>
                    <Text style={s.continueBtnText}>继续创作</Text>
                    <Icon.continueWrite size={12} color={T.accent} />
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      <TouchableOpacity style={s.fab} onPress={() => navigation.navigate('CreateNovel')} activeOpacity={0.8}>
        <Icon.add size={24} color="#FFF" />
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: T.sp.xl, paddingTop: 56, paddingBottom: T.sp.md },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoWrap: { width: 32, height: 32, borderRadius: 10, backgroundColor: T.accent + '15', justifyContent: 'center', alignItems: 'center' },
  logoText: { fontSize: 22, fontWeight: '800', color: T.text, letterSpacing: 0.5 },
  headerRight: { flexDirection: 'row', gap: 8 },
  headerBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: T.card, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: T.border },
  subtitle: { fontSize: 13, color: T.textMuted, paddingHorizontal: T.sp.xl, marginBottom: T.sp.sm },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 80 },
  emptyIconWrap: { width: 80, height: 80, borderRadius: 24, backgroundColor: T.accent + '10', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: T.text, marginBottom: 8 },
  emptySub: { fontSize: 14, color: T.textMuted },
  list: { paddingHorizontal: T.sp.lg, paddingBottom: 100 },
  card: { backgroundColor: T.card, borderRadius: T.r.lg, marginBottom: T.sp.md, borderWidth: 1, borderColor: T.border, overflow: 'hidden' },
  cardAccent: { height: 3 },
  cardBody: { padding: T.sp.lg },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 17, fontWeight: '700', color: T.text, flex: 1, marginRight: 8 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  genreBadge: { backgroundColor: T.accent + '15', paddingHorizontal: 8, paddingVertical: 3, borderRadius: T.r.sm },
  genreText: { fontSize: 11, color: T.accent, fontWeight: '600' },
  cardChapters: { fontSize: 12, color: T.textMuted },
  cardSynopsis: { fontSize: 13, color: T.textSec, marginTop: 8, lineHeight: 18 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  cardTime: { fontSize: 11, color: T.textMuted },
  continueBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: T.r.sm, backgroundColor: T.accent + '12' },
  continueBtnText: { fontSize: 11, color: T.accent, fontWeight: '600' },
  fab: { position: 'absolute', bottom: 32, right: 24, width: 56, height: 56, borderRadius: 18, backgroundColor: T.accent, justifyContent: 'center', alignItems: 'center', elevation: 12, shadowColor: T.accent, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 12 },
});
