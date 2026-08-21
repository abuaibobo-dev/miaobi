import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { getChapters } from '../lib/storage';
import { T } from '../lib/theme';
import { Icon } from '../lib/icons';
import type { Chapter } from '../types/novel';

type Props = any;

export default function ReaderScreen({ navigation, route }: Props) {
  const novelId: string = route.params?.novelId;
  const startChapter = route.params?.startChapter;
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [fontSize, setFontSize] = useState(18);
  const [showToolbar, setShowToolbar] = useState(true);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    let mounted = true;
    getChapters(novelId).then(list => {
      if (!mounted) return;
      const sorted = [...list].sort((a, b) => a.chapterNumber - b.chapterNumber);
      setChapters(sorted);
      if (startChapter) {
        const index = sorted.findIndex(item => item.id === startChapter);
        if (index >= 0) setCurrentIndex(index);
      }
    });
    return () => { mounted = false; };
  }, [novelId, startChapter]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [currentIndex]);

  const currentChapter = chapters[currentIndex];
  const changeChapter = useCallback((direction: number) => {
    setCurrentIndex(previous => Math.min(Math.max(previous + direction, 0), chapters.length - 1));
  }, [chapters.length]);

  if (!currentChapter) {
    return (
      <View style={styles.screen}>
        <StatusBar barStyle="light-content" backgroundColor={T.bg} />
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
            <Icon.back size={19} color={T.text} />
          </TouchableOpacity>
          <Text style={styles.topTitle}>阅读</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={styles.empty}>
          <Icon.book size={44} color="#333" />
          <Text style={styles.emptyText}>还没有章节</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={T.bg} />
      {showToolbar && (
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
            <Icon.back size={19} color={T.text} />
          </TouchableOpacity>
          <View style={styles.titleWrap}>
            <Text style={styles.topTitle} numberOfLines={1}>{currentChapter.title}</Text>
            <Text style={styles.chapterCount}>{currentIndex + 1} / {chapters.length}</Text>
          </View>
          <TouchableOpacity style={styles.iconButton} onPress={() => setFontSize(value => value === 18 ? 20 : 18)}>
            <Text style={styles.sizeButtonText}>Aa</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        style={styles.reader}
        contentContainerStyle={styles.readerContent}
      >
        <TouchableOpacity activeOpacity={1} onPress={() => setShowToolbar(value => !value)}>
          <Text style={styles.chapterTitle}>{currentChapter.title}</Text>
          <Text style={[styles.content, { fontSize }]}>{currentChapter.body || currentChapter.summary}</Text>
        </TouchableOpacity>
      </ScrollView>

      {showToolbar && (
        <>
          <View style={styles.bottomBar}>
            <TouchableOpacity style={styles.chapterButton} disabled={currentIndex === 0} onPress={() => changeChapter(-1)}>
              <Icon.back size={15} color={currentIndex === 0 ? '#555' : T.text} />
              <Text style={[styles.chapterButtonText, currentIndex === 0 && styles.disabledText]}>上一章</Text>
            </TouchableOpacity>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${((currentIndex + 1) / chapters.length) * 100}%` }]} />
            </View>
            <TouchableOpacity style={styles.chapterButton} disabled={currentIndex >= chapters.length - 1} onPress={() => changeChapter(1)}>
              <Text style={[styles.chapterButtonText, currentIndex >= chapters.length - 1 && styles.disabledText]}>下一章</Text>
              <Icon.forward size={15} color={currentIndex >= chapters.length - 1 ? '#555' : T.text} />
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: (StatusBar.currentHeight || 44), paddingBottom: 10, backgroundColor: T.surface, borderBottomWidth: 1, borderBottomColor: '#242424' },
  iconButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#2A2A2A', alignItems: 'center', justifyContent: 'center' },
  titleWrap: { flex: 1, minWidth: 0 },
  topTitle: { fontSize: 15, fontWeight: '700', color: T.text },
  chapterCount: { marginTop: 1, fontSize: 11, color: T.textMuted },
  sizeButtonText: { fontSize: 11, fontWeight: '800', color: T.text },
  reader: { flex: 1 },
  readerContent: { padding: 24, paddingBottom: 48 },
  chapterTitle: { marginBottom: 18, fontSize: 21, lineHeight: 29, fontWeight: '800', color: T.text },
  content: { lineHeight: 32, letterSpacing: 0.2, color: '#D9D9D9' },
  bottomBar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 22, backgroundColor: T.surface, borderTopWidth: 1, borderTopColor: '#242424' },
  chapterButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 36, borderRadius: 18, backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#2E2E2E' },
  chapterButtonText: { fontSize: 12, fontWeight: '600', color: T.text },
  disabledText: { color: '#555' },
  progressTrack: { flex: 1, height: 3, borderRadius: 2, backgroundColor: '#242424' },
  progressFill: { height: 3, borderRadius: 2, backgroundColor: '#E5E5E5' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { fontSize: 14, color: T.textMuted },
});
