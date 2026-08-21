import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, StyleSheet, Alert, ScrollView, TextInput, Modal,
  StatusBar,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getStoryBible, updateNovelBible } from '../lib/novelMemory';
import { createMemorySnapshot } from '../lib/storage';
import { getChapters, getCharacters, getForeshadowing, getSnapshots, saveChapter } from '../lib/storage';
import { exportAsTxt, exportAsMarkdown, exportChapter } from '../lib/export';
import { getWritingStats } from '../lib/writingStats';
import { getIdeas, addIdea, deleteIdea, type Idea } from '../lib/ideas';
import { truncate, formatTime } from '../lib/utils';
import ForeshadowBoard from '../components/ForeshadowBoard';
import CharacterCard from '../components/CharacterCard';
import StoryTimeline from '../components/StoryTimeline';
import { CapsuleToast } from '../components/CapsuleAlert';
import type { NovelProject, Chapter, Character, Foreshadowing, MemorySnapshot } from '../types/novel';

const COLORS = {
  bg: '#0D0D0D', card: '#1A1A1A', border: '#2A2A2A',
  text: '#F5F5F5', sub: '#A3A3A3', accent: '#F5F5F5', danger: '#737373',
};

type Props = any;
type TabKey = 'chapters' | 'volumes' | 'characters' | 'foreshadowing' | 'timeline' | 'memory' | 'stats' | 'ideas' | 'relations' | 'search';

export default function NovelDetailScreen({ navigation, route }: Props) {
  const { novelId } = route.params;
  const [novel, setNovel] = useState<NovelProject | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [foreshadowing, setForeshadowing] = useState<Foreshadowing[]>([]);
  const [snapshots, setSnapshots] = useState<MemorySnapshot[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [tab, setTab] = useState<TabKey>('chapters');
  const [sortBy, setSortBy] = useState<'asc' | 'desc'>('asc');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Chapter[]>([]);
  const [toast, setToast] = useState('');
  const [newIdea, setNewIdea] = useState('');

  // 编辑弹窗
  const [editModal, setEditModal] = useState(false);
  const [editChapter, setEditChapter] = useState<Chapter | null>(null);
  const [editBody, setEditBody] = useState('');


  // 视角设置
  const [pov, setPov] = useState(novel?.styleGuide?.includes('第一人称') ? 'first' : novel?.styleGuide?.includes('第三人称') ? 'third' : 'third');

  const reload = useCallback(() => {
    getStoryBible(novelId).then(n => { setNovel(n); if (n) setPov(n.styleGuide?.includes('第一人称') ? 'first' : 'third'); });
    getChapters(novelId).then(list => setChapters(sortBy === 'asc' ? list : [...list].reverse()));
    getCharacters(novelId).then(setCharacters);
    getForeshadowing(novelId).then(setForeshadowing);
    getSnapshots(novelId).then(setSnapshots);
    getWritingStats(novelId).then(setStats);
    getIdeas(novelId).then(setIdeas);
  }, [novelId, sortBy]);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  if (!novel) return <View style={styles.container}><Text style={styles.loading}>加载中...</Text></View>;

  const chaptersByVolume: Record<number, Chapter[]> = {};
  for (const ch of chapters) { const v = ch.volumeNumber || 1; if (!chaptersByVolume[v]) chaptersByVolume[v] = []; chaptersByVolume[v].push(ch); }
  const volumes = Object.keys(chaptersByVolume).map(Number).sort();

  // 搜索
  const handleSearch = (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) { setSearchResults([]); return; }
    const results = chapters.filter(c => c.body.includes(q) || c.title.includes(q) || c.summary?.includes(q));
    setSearchResults(results);
  };

  // 编辑章节
  const handleEdit = (ch: Chapter) => { setEditChapter(ch); setEditBody(ch.body); setEditModal(true); };
  const handleSaveEdit = async () => {
    if (!editChapter) return;
    const updated = { ...editChapter, body: editBody, wordCount: editBody.length };
    await saveChapter(updated);
    setEditModal(false);
    reload();
    setToast('✅ 已保存');
  };


  // 灵感
  const handleAddIdea = async () => {
    if (!newIdea.trim()) return;
    await addIdea(novelId, newIdea.trim());
    setNewIdea('');
    getIdeas(novelId).then(setIdeas);
  };

  // 视角切换
  const handlePovChange = async (p: string) => {
    setPov(p);
    const guide = novel.styleGuide || '';
    const newGuide = p === 'first' ? guide.replace(/第三人称/g, '').trim() + ' 第一人称视角' : guide.replace(/第一人称/g, '').trim() + ' 第三人称视角';
    await updateNovelBible(novelId, { styleGuide: newGuide.trim() });
  };

  // 角色关系图（简单文本图）
  const renderRelationMap = () => {
    if (characters.length === 0) return <Text style={styles.empty}>还没有角色</Text>;
    const lines: string[] = [];
    for (const c of characters) {
      const connections = characters.filter(o => o.id !== c.id && (
        c.backstory?.includes(o.name) || o.backstory?.includes(c.name) ||
        c.currentState?.includes(o.name) || o.currentState?.includes(c.name)
      ));
      const connStr = connections.length > 0 ? connections.map(o => `── ${o.name}`).join('\n') : '── (无关联)';
      lines.push(`👤 ${c.name} [${c.status}]\n${connStr}`);
    }
    return <Text style={styles.relationText}>{lines.join('\n\n')}</Text>;
  };

  const TABS: Array<{ key: TabKey; label: string }> = [
    { key: 'chapters', label: `📝 ${chapters.length}章` },
    { key: 'volumes', label: `📚 ${volumes.length}卷` },
    { key: 'characters', label: `👥 ${characters.length}人` },
    { key: 'foreshadowing', label: `🔮 ${foreshadowing.length}` },
    { key: 'memory', label: `🧠 ${snapshots.length}` },
    { key: 'stats', label: `📊 统计` },
    { key: 'ideas', label: `💡 ${ideas.length}` },
    { key: 'timeline', label: `📅 时间线` },
    { key: 'relations', label: `🕸️ 关系` },
    { key: 'search', label: `🔍` },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.backBtn}>← 返回</Text></TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{novel.title}</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={() => navigation.navigate('Reader', { novelId })}><Text style={styles.iconBtn}>📖</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('WritingChat', { novelId })}><Text style={styles.iconBtn}>💬</Text></TouchableOpacity>
        </View>
      </View>

      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <Text style={styles.infoGenre}>{novel.genre} · {pov === 'first' ? '第一人称' : '第三人称'}</Text>
          <TouchableOpacity onPress={() => handlePovChange(pov === 'first' ? 'third' : 'first')}>
            <Text style={styles.povBtn}>切换视角</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.infoSyn}>{novel.synopsis || '暂无简介'}</Text>
        <View style={styles.actionRow}>
          {[
            { label: '📄 TXT', fn: () => exportAsTxt(novelId) },
            { label: '📝 MD', fn: () => exportAsMarkdown(novelId) },
            { label: '📸 快照', fn: async () => { await createMemorySnapshot(novelId, `手动快照 — 第${novel.totalChapters}章`, novel.totalChapters, novel.currentVolume); reload(); setToast('✅ 快照已创建'); } },
          ].map(a => (
            <TouchableOpacity key={a.label} style={styles.actionBtn} onPress={a.fn}>
              <Text style={styles.actionText}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.tabBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {TABS.map(t => (
            <TouchableOpacity key={t.key} style={[styles.tab, tab === t.key && styles.tabActive]} onPress={() => setTab(t.key)}>
              <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={{ flex: 1 }}>
        {/* Chapters */}
        {tab === 'chapters' && (
          <View style={{ flex: 1 }}>
            <View style={styles.sortRow}><TouchableOpacity onPress={() => setSortBy(s => s === 'asc' ? 'desc' : 'asc')}><Text style={styles.sortBtn}>{sortBy === 'asc' ? '↑ 正序' : '↓ 倒序'}</Text></TouchableOpacity></View>
            <FlatList data={chapters} keyExtractor={c => c.id} contentContainerStyle={styles.list}
              ListEmptyComponent={<Text style={styles.empty}>还没有章节 ✍️</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('Reader', { novelId, startChapter: item.id })}>
                  <View style={styles.cardRow}>
                    <Text style={styles.cardTitle} numberOfLines={1}>第{item.chapterNumber}章 {item.title}</Text>
                    <TouchableOpacity style={styles.editChip} onPress={() => handleEdit(item)} hitSlop={8}>
                      <Text style={styles.editChipText}>编辑</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.cardSummary}>{truncate(item.summary || item.body, 80)}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        )}

        {/* Volumes */}
        {tab === 'volumes' && (
          <ScrollView contentContainerStyle={styles.list}>
            {volumes.map(vol => (
              <View key={vol} style={styles.volSection}>
                <View style={styles.volHeader}><Text style={styles.volTitle}>📚 第{vol}卷</Text><Text style={styles.volCount}>{chaptersByVolume[vol].length}章</Text></View>
                {chaptersByVolume[vol].map(ch => (
                  <View key={ch.id} style={styles.volChapter}><Text style={styles.volChapterText}>第{ch.chapterNumber}章 {ch.title}</Text><Text style={styles.volChapterMeta}>{ch.wordCount}字</Text></View>
                ))}
              </View>
            ))}
            <TouchableOpacity style={styles.addVolBtn} onPress={async () => { const nv = (novel.totalVolumes || 1) + 1; await updateNovelBible(novelId, { totalVolumes: nv, currentVolume: nv }); reload(); }}>
              <Text style={styles.addVolBtnText}>+ 新建一卷</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* Characters */}
        {tab === 'characters' && (
          <CharacterCard
            characters={characters}
            onUpdateDialogueStyle={async (charId, style) => {
              const ch = characters.find(c => c.id === charId);
              if (ch) {
                ch.dialogueStyle = style;
                const Store = require('../lib/storage');
                await Store.saveCharacter(ch);
                reload();
              }
            }}
          />
        )}

        {/* Foreshadowing */}
        {tab === 'foreshadowing' && (
          <ForeshadowBoard items={foreshadowing} />
        )}

        {/* Timeline */}
        {tab === 'timeline' && (
          <StoryTimeline chapters={chapters} />
        )}

        {/* Memory */}
        {tab === 'memory' && (
          <FlatList data={snapshots} keyExtractor={s => s.id} contentContainerStyle={styles.list}
            ListEmptyComponent={<Text style={styles.empty}>还没有快照</Text>}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>📸 {item.label}</Text>
                <Text style={styles.cardMeta}>第{item.chapterNumber}章 · {formatTime(item.createdAt)}</Text>
              </View>
            )}
          />
        )}

        {/* Stats */}
        {tab === 'stats' && stats && (
          <ScrollView contentContainerStyle={styles.list}>
            <View style={styles.statsGrid}>
              {[
                { label: '总字数', value: stats.totalWords.toLocaleString(), color: COLORS.accent },
                { label: '总章节', value: String(stats.totalChapters), color: COLORS.text },
                { label: '写作天数', value: String(stats.totalDays), color: COLORS.text },
                { label: '连续天数', value: String(stats.streakDays), color: stats.streakDays > 0 ? COLORS.accent : COLORS.sub },
                { label: '日均字数', value: String(stats.avgWordsPerDay), color: COLORS.text },
              ].map(s => (
                <View key={s.label} style={styles.statCard}>
                  <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
                  <Text style={styles.statLabel}>{s.label}</Text>
                </View>
              ))}
            </View>
            {/* 绿格子日历 */}
            <Text style={styles.sectionTitle}>📅 写作日历</Text>
            <View style={styles.calendarGrid}>
              {Object.entries(stats.dailyStats).slice(-30).map(([date, words]) => (
                <View key={date} style={[styles.calCell, { opacity: Math.min(1, (words as number) / 2000) }]}>
                  <Text style={styles.calText}>{date.slice(5)}</Text>
                  <Text style={styles.calWords}>{Math.round((words as number) / 100)}百</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        )}

        {/* Ideas */}
        {tab === 'ideas' && (
          <View style={{ flex: 1 }}>
            <View style={styles.ideaInput}>
              <TextInput style={styles.ideaTextInput} value={newIdea} onChangeText={setNewIdea} placeholder="记录一个灵感..." placeholderTextColor="#555" />
              <TouchableOpacity style={styles.ideaAddBtn} onPress={handleAddIdea}><Text style={styles.ideaAddText}>+</Text></TouchableOpacity>
            </View>
            <FlatList data={ideas} keyExtractor={i => i.id} contentContainerStyle={styles.list}
              ListEmptyComponent={<Text style={styles.empty}>还没有灵感便签 💡</Text>}
              renderItem={({ item }) => (
                <View style={styles.card}>
                  <View style={styles.cardRow}>
                    <Text style={styles.cardSummary} numberOfLines={3}>{item.content}</Text>
                    <TouchableOpacity onPress={async () => { await deleteIdea(novelId, item.id); getIdeas(novelId).then(setIdeas); }}>
                      <Text style={styles.deleteBtn}>🗑️</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.cardMeta}>{formatTime(item.createdAt)}</Text>
                </View>
              )}
            />
          </View>
        )}

        {/* Relations */}
        {tab === 'relations' && (
          <ScrollView contentContainerStyle={styles.list}>
            {renderRelationMap()}
          </ScrollView>
        )}

        {/* Search */}
        {tab === 'search' && (
          <View style={{ flex: 1 }}>
            <View style={styles.searchBar}>
              <TextInput style={styles.searchInput} value={searchQuery} onChangeText={handleSearch} placeholder="搜索章节内容..." placeholderTextColor="#555" />
            </View>
            <FlatList data={searchResults} keyExtractor={c => c.id} contentContainerStyle={styles.list}
              ListEmptyComponent={<Text style={styles.empty}>{searchQuery ? '没有找到匹配内容' : '输入关键词搜索'}</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.card} onPress={() => handleEdit(item)}>
                  <Text style={styles.cardTitle}>第{item.chapterNumber}章 {item.title}</Text>
                  <Text style={styles.cardSummary}>{truncate(item.body, 120)}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        )}
      </View>

      {/* Edit Modal - 胶囊 */}
      <Modal visible={editModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.capsuleModal}>
            <Text style={styles.capsuleTitle}>✏️ 编辑章节</Text>
            <TextInput style={styles.editInput} value={editBody} onChangeText={setEditBody} multiline textAlignVertical="top" />
            <View style={styles.capsuleBtnRow}>
              <TouchableOpacity style={styles.capsuleBtnCancel} onPress={() => setEditModal(false)}><Text style={styles.capsuleBtnCancelText}>取消</Text></TouchableOpacity>
              <TouchableOpacity style={styles.capsuleBtnConfirm} onPress={handleSaveEdit}><Text style={styles.capsuleBtnConfirmText}>保存</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  loading: { color: COLORS.sub, textAlign: 'center', marginTop: 100 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: (StatusBar.currentHeight || 44), paddingBottom: 12 },
  backBtn: { fontSize: 14, color: COLORS.accent },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text, flex: 1, textAlign: 'center', marginHorizontal: 8 },
  headerRight: { flexDirection: 'row', gap: 8 },
  iconBtn: { fontSize: 18 },
  infoCard: { marginHorizontal: 16, backgroundColor: COLORS.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: COLORS.border, marginBottom: 8 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  infoGenre: { fontSize: 12, color: COLORS.accent, fontWeight: '600' },
  povBtn: { fontSize: 11, color: COLORS.accent, borderWidth: 1, borderColor: COLORS.accent, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  infoSyn: { fontSize: 13, color: COLORS.sub, marginTop: 6, lineHeight: 18 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  actionBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: '#2A2A2A' },
  actionText: { fontSize: 11, color: COLORS.text },
  tabBar: { paddingVertical: 8, paddingHorizontal: 12 },
  tab: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, marginRight: 6 },
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
  editChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: '#242424', borderWidth: 1, borderColor: '#333' },
  editChipText: { fontSize: 10, color: '#D4D4D4', fontWeight: '700' },
  cardBadge: { fontSize: 11, color: COLORS.sub },
  cardSummary: { fontSize: 13, color: COLORS.sub, marginTop: 6, lineHeight: 18 },
  cardMeta: { fontSize: 12, color: COLORS.sub, marginTop: 6 },
  deleteBtn: { fontSize: 14, padding: 4 },
  volSection: { marginBottom: 16 },
  volHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  volTitle: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  volCount: { fontSize: 12, color: COLORS.sub },
  volChapter: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 6, backgroundColor: COLORS.card, borderRadius: 8, marginBottom: 4 },
  volChapterText: { fontSize: 13, color: COLORS.text },
  volChapterMeta: { fontSize: 12, color: COLORS.sub },
  addVolBtn: { marginTop: 8, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: COLORS.accent, borderStyle: 'dashed', alignItems: 'center' },
  addVolBtnText: { fontSize: 14, color: COLORS.accent },
  // Stats
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: { width: '30%', backgroundColor: COLORS.card, borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  statValue: { fontSize: 22, fontWeight: 'bold' },
  statLabel: { fontSize: 11, color: COLORS.sub, marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: COLORS.text, marginTop: 20, marginBottom: 10 },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  calCell: { width: 60, height: 50, backgroundColor: COLORS.card, borderRadius: 6, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  calText: { fontSize: 10, color: COLORS.sub },
  calWords: { fontSize: 11, color: COLORS.accent, fontWeight: '600' },
  // Ideas
  ideaInput: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  ideaTextInput: { flex: 1, backgroundColor: COLORS.card, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border, fontSize: 14 },
  ideaAddBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.accent, justifyContent: 'center', alignItems: 'center' },
  ideaAddText: { fontSize: 20, color: '#000', fontWeight: 'bold', marginTop: -2 },
  // Relations
  relationText: { fontSize: 14, color: COLORS.text, lineHeight: 24, fontFamily: 'monospace' },
  // Search
  searchBar: { paddingHorizontal: 16, paddingVertical: 8 },
  searchInput: { backgroundColor: COLORS.card, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border, fontSize: 14 },
  // 胶囊弹窗
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  capsuleModal: { backgroundColor: '#2A2A2A', borderRadius: 20, padding: 16, width: '90%', alignSelf: 'center', borderWidth: 1, borderColor: '#3A3A3A', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8, maxHeight: '85%' },
  capsuleTitle: { fontSize: 15, fontWeight: '600', color: COLORS.text, marginBottom: 10, textAlign: 'center' },
  capsuleBtnRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  capsuleBtnCancel: { flex: 1, paddingVertical: 10, borderRadius: 14, backgroundColor: '#3A3A3A', alignItems: 'center' },
  capsuleBtnCancelText: { fontSize: 13, color: COLORS.sub },
  capsuleBtnConfirm: { flex: 1, paddingVertical: 10, borderRadius: 14, backgroundColor: COLORS.accent, alignItems: 'center' },
  capsuleBtnConfirmText: { fontSize: 13, fontWeight: '600', color: '#000' },
  editInput: { backgroundColor: COLORS.bg, borderRadius: 12, padding: 12, color: COLORS.text, fontSize: 14, lineHeight: 20, minHeight: 180, borderWidth: 1, borderColor: COLORS.border },
  formatRow: { marginBottom: 8 },
});
