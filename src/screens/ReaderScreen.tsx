import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, StatusBar, Dimensions,
} from 'react-native';
import { getChapters } from '../lib/storage';
import { T } from '../lib/theme';
import { Icon } from '../lib/icons';
import type { Chapter } from '../types/novel';

type Props = any;
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export default function ReaderScreen({ navigation, route }: Props) {
  const { novelId, startChapter } = route.params || {};
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [fontSize, setFontSize] = useState(18);
  const [showToolbar, setShowToolbar] = useState(true);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    getChapters(novelId).then(list => {
      const sorted = [...list].sort((a, b) => a.chapterNumber - b.chapterNumber);
      setChapters(sorted);
      if (startChapter) {
        const idx = sorted.findIndex(c => c.id === startChapter);
        if (idx >= 0) setCurrentIndex(idx);
      }
    });
  }, [novelId, startChapter]);

  const currentChapter = chapters[currentIndex];

  const goToPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      flatListRef.current?.scrollToIndex({ index: currentIndex - 1, animated: false });
    }
  }, [currentIndex]);

  const goToNext = useCallback(() => {
    if (currentIndex < chapters.length - 1) {
      setCurrentIndex(prev => prev + 1);
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: false });
    }
  }, [currentIndex, chapters.length]);

  const onViewableConfig = useRef({ viewAreaCoveragePercentThreshold: 50 });
  const onViewableChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index || 0);
    }
  });

  if (!currentChapter) {
    return (
      <View style={s.container}>
        <StatusBar barStyle="light-content" backgroundColor={T.bg} />
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Icon.back size={20} color={T.text} />
          </TouchableOpacity>
          <Text style={s.topTitle}>阅读</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={s.emptyWrap}>
          <Icon.book size={48} color={T.textMuted} />
          <Text style={s.emptyText}>还没有章节，先去创作吧</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={T.bg} />

      {/* 顶部栏 */}
      {showToolbar && (
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Icon.back size={20} color={T.text} />
          </TouchableOpacity>
          <Text style={s.topTitle} numberOfLines={1}>{currentChapter.title}</Text>
          <Text style={s.topChapter}>{currentIndex + 1}/{chapters.length}</Text>
        </View>
      )}

      {/* 章节内容 */}
      <FlatList
        ref={flatListRef}
        data={chapters}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={item => item.id}
        initialScrollIndex={currentIndex}
        getItemLayout={(_, index) => ({ length: SCREEN_W, offset: SCREEN_W * index, index })}
        onViewableItemsChanged={onViewableChanged.current}
        viewabilityConfig={onViewableConfig.current}
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={1}
            style={s.page}
            onPress={() => setShowToolbar(prev => !prev)}
          >
            <Text style={s.chapterTitle}>{item.title}</Text>
            <Text style={[s.content, { fontSize }]}>{item.body || item.summary}</Text>
          </TouchableOpacity>
        )}
      />

      {/* 底部工具栏 */}
      {showToolbar && (
        <View style={s.bottomBar}>
          <TouchableOpacity style={s.toolBtn} onPress={goToPrev} disabled={currentIndex === 0}>
            <Icon.back size={18} color={currentIndex === 0 ? T.textMuted : T.text} />
            <Text style={[s.toolText, currentIndex === 0 && { color: T.textMuted }]}>上一章</Text>
          </TouchableOpacity>

          <View style={s.fontSizeControl}>
            <TouchableOpacity style={s.fontBtn} onPress={() => setFontSize(prev => Math.max(14, prev - 2))}>
              <Text style={s.fontBtnText}>A-</Text>
            </TouchableOpacity>
            <Text style={s.fontSizeLabel}>{fontSize}</Text>
            <TouchableOpacity style={s.fontBtn} onPress={() => setFontSize(prev => Math.min(28, prev + 2))}>
              <Text style={s.fontBtnText}>A+</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={s.toolBtn} onPress={goToNext} disabled={currentIndex >= chapters.length - 1}>
            <Text style={[s.toolText, currentIndex >= chapters.length - 1 && { color: T.textMuted }]}>下一章</Text>
            <Icon.forward size={18} color={currentIndex >= chapters.length - 1 ? T.textMuted : T.text} />
          </TouchableOpacity>
        </View>
      )}

      {/* 阅读进度 */}
      {showToolbar && (
        <View style={s.progressBar}>
          <View style={[s.progressFill, { width: `${((currentIndex + 1) / chapters.length) * 100}%` }]} />
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 48, paddingBottom: 12, backgroundColor: T.surface, borderBottomWidth: 1, borderBottomColor: T.border },
  backBtn: { padding: 8 },
  topTitle: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '600', color: T.text },
  topChapter: { fontSize: 12, color: T.textMuted, padding: 8 },
  page: { width: SCREEN_W, flex: 1, paddingHorizontal: 24, paddingTop: 20 },
  chapterTitle: { fontSize: 20, fontWeight: '700', color: T.text, marginBottom: 20, textAlign: 'center' },
  content: { color: T.text, lineHeight: 32, letterSpacing: 0.3 },
  bottomBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12, paddingBottom: 34, backgroundColor: T.surface, borderTopWidth: 1, borderTopColor: T.border },
  toolBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 8 },
  toolText: { fontSize: 13, color: T.text, fontWeight: '600' },
  fontSizeControl: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fontBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: T.bg, borderWidth: 1, borderColor: T.border, alignItems: 'center', justifyContent: 'center' },
  fontBtnText: { fontSize: 14, fontWeight: '700', color: T.text },
  fontSizeLabel: { fontSize: 13, color: T.textSec, minWidth: 24, textAlign: 'center' },
  progressBar: { height: 2, backgroundColor: T.border },
  progressFill: { height: 2, backgroundColor: T.accent, borderRadius: 1 },
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  emptyText: { fontSize: 14, color: T.textMuted },
});
