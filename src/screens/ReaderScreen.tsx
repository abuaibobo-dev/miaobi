import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, ScrollView, StatusBar, TextInput,
  Text, TouchableOpacity, View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';
import { T } from '../lib/theme';
import { Icon } from '../lib/icons';
import { FlatList } from 'react-native';
import { findLibraryBook, readBookContent, splitChapters, updateLibraryBook } from '../lib/library';

type Props = any;
type ReaderTheme = 'dark' | 'sepia' | 'paper';

const THEMES: Record<ReaderTheme, { bg: string; text: string; secondary: string; bar: string; border: string; dark: boolean }> = {
  dark: { bg: T.bg, text: '#D6D6D6', secondary: '#8A8A8A', bar: T.surface, border: T.border, dark: true },
  sepia: { bg: '#F4EAD5', text: '#3E342A', secondary: '#796852', bar: '#EBDFC6', border: '#D9CBAF', dark: false },
  paper: { bg: '#F7F7F5', text: '#222', secondary: '#666', bar: '#EFEFEF', border: '#DDD', dark: false },
};

export default function ReaderScreen({ navigation, route }: Props) {
  const bookId: string = route.params?.bookId;
  const [chapters, setChapters] = useState<Array<{ title: string; body: string; index: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [current, setCurrent] = useState(0);
  const [fontSize, setFontSize] = useState(18);
  const [showChrome, setShowChrome] = useState(true);
  const [theme, setTheme] = useState<ReaderTheme>('dark');
  const [showSettings, setShowSettings] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ chapterIndex: number; title: string; snippet: string }>>([]);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const content = await readBookContent(bookId);
        const parsed = splitChapters(content);
        if (!mounted) return;
        setChapters(parsed);
        const saved = await findLibraryBook(bookId);
        if (Number.isInteger(saved?.currentChapterIndex)) {
          setCurrent(Math.max(0, Math.min(saved!.currentChapterIndex!, parsed.length - 1)));
        } else if (saved?.progress) {
          // Older versions stored (chapter + 1) / chapterCount.
          setCurrent(Math.max(0, Math.min(Math.round(saved.progress * parsed.length) - 1, parsed.length - 1)));
        }
      } catch (e: any) {
        if (mounted) setError(e.message || '无法加载内容');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [bookId]);

  useEffect(() => {
    AsyncStorage.getItem('miaobi.reader.fontSize').then(value => {
      const size = Number(value);
      if (size >= 14 && size <= 28) setFontSize(size);
    });
    AsyncStorage.getItem('miaobi.reader.theme').then(value => {
      if (value === 'dark' || value === 'sepia' || value === 'paper') setTheme(value);
    });
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    if (chapters.length) updateLibraryBook(bookId, {
      currentChapterIndex: current,
      progress: (current + 1) / chapters.length,
      lastReadAt: new Date().toISOString(),
    });
  }, [current, chapters.length]);

  useEffect(() => () => { Speech.stop(); }, []);

  const jump = useCallback((direction: number) => {
    Speech.stop();
    setIsSpeaking(false);
    setIsPaused(false);
    setCurrent(prev => Math.max(0, Math.min(chapters.length - 1, prev + direction)));
  }, [chapters.length]);

  const [isPaused, setIsPaused] = useState(false);

  const toggleSpeech = () => {
    if (isSpeaking) { Speech.stop(); setIsSpeaking(false); setIsPaused(false); return; }
    if (!chapters[current]?.body) return;
    setIsSpeaking(true);
    AsyncStorage.getItem('miaobi.reader.speechRate').then(rateValue => {
      const rate = Number(rateValue) || 1.0;
      const body = chapters[current].body;
      const speakPart = (index: number) => {
        if (index >= body.length) { setIsSpeaking(false); return; }
        Speech.speak(body.slice(index, index + 12000), {
          language: 'zh-CN', rate,
          onDone: () => speakPart(index + 12000),
          onError: () => setIsSpeaking(false),
          onStopped: () => setIsSpeaking(false),
        });
      };
      speakPart(0);
    });
  };

  const searchInBook = (query: string) => {
    setSearchQuery(query);
    if (!query.trim() || query.trim().length < 2) { setSearchResults([]); return; }
    const q = query.toLowerCase();
    const results: Array<{ chapterIndex: number; title: string; snippet: string }> = [];
    chapters.forEach((chapter) => {
      const lowerBody = chapter.body.toLowerCase();
      let pos = 0;
      while ((pos = lowerBody.indexOf(q, pos)) !== -1 && results.length < 50) {
        const start = Math.max(0, pos - 30);
        const end = Math.min(chapter.body.length, pos + q.length + 40);
        results.push({
          chapterIndex: chapter.index,
          title: chapter.title,
          snippet: `${start > 0 ? '…' : ''}${chapter.body.slice(start, end).replace(/\n/g, ' ')}${end < chapter.body.length ? '…' : ''}`,
        });
        pos += q.length;
      }
    });
    setSearchResults(results);
  };

  const colors = THEMES[theme];

  if (loading) return <View style={[s.center, { backgroundColor: colors.bg }]}><StatusBar barStyle={colors.dark ? 'light-content' : 'dark-content'} backgroundColor={colors.bg} /><ActivityIndicator color={colors.secondary} /></View>;

  if (error || !chapters.length) return (
    <View style={[s.screen, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle={colors.dark ? 'light-content' : 'dark-content'} backgroundColor={colors.bg} />
      <View style={[s.topBar, { backgroundColor: colors.bar, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={[s.iconButton, { borderColor: colors.border }]}><Icon.back size={19} color={colors.text} /></TouchableOpacity>
        <Text style={[s.topTitle, { color: colors.text }]}>阅读</Text><View style={{ width: 37 }} />
      </View>
      <View style={s.center}><Icon.book size={40} color={colors.secondary} /><Text style={[s.error, { color: colors.secondary }]}>{error || '没有内容'}</Text></View>
    </View>
  );

  const chapter = chapters[current];
  return (
    <View style={[s.screen, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle={colors.dark ? 'light-content' : 'dark-content'} backgroundColor={colors.bg} />
      {showChrome && (
        <View style={[s.topBar, { backgroundColor: colors.bar, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={[s.iconButton, { borderColor: colors.border }]}><Icon.back size={19} color={colors.text} /></TouchableOpacity>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[s.topTitle, { color: colors.text }]} numberOfLines={1}>{chapter.title}</Text>
            <Text style={[s.pageInfo, { color: colors.secondary }]}>{current + 1} / {chapters.length}</Text>
          </View>
          <View style={s.toolbarActions}>
            <TouchableOpacity onPress={() => setShowSearch(v => !v)} style={[s.toolButton, { borderColor: colors.border }]}>
              <Icon.search size={14} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity accessibilityLabel={isSpeaking ? '停止朗读' : '朗读'} onPress={toggleSpeech} style={[s.toolButton, { borderColor: isSpeaking ? T.grey : colors.border }]}>
              <Icon.tts size={15} color={isSpeaking ? T.grey : colors.text} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowSettings(v => !v)} style={[s.iconButton, { borderColor: colors.border }]}><Text style={[s.fontLabel, { color: colors.text }]}>Aa</Text></TouchableOpacity>
          </View>
        </View>
      )}

      {showSearch && showChrome && (
        <View style={[s.searchBarWrap, { backgroundColor: colors.bar, borderBottomColor: colors.border }]}>
          <TextInput
            value={searchQuery}
            onChangeText={searchInBook}
            placeholder="在书内搜索…"
            placeholderTextColor={colors.secondary}
            style={[s.searchInput, { color: colors.text, borderColor: colors.border }]}
          />
          {!!searchResults.length && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 6 }}>
              {searchResults.map((result, index) => (
                <TouchableOpacity key={`${result.chapterIndex}_${index}`} style={[s.searchChip, { borderColor: colors.border }]}
                  onPress={() => { setCurrent(result.chapterIndex); setSearchQuery(''); setSearchResults([]); setShowSearch(false); }}>
                  <Text style={{ color: colors.text, fontSize: 10 }} numberOfLines={2}>{result.title}: {result.snippet}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={s.readerBody}>
        <TouchableOpacity activeOpacity={1} onPress={() => setShowChrome(v => !v)}>
          <Text style={[s.chapterTitle, { fontSize: fontSize + 4, color: colors.text }]}>{chapter.title}</Text>
          <Text style={[s.body, { fontSize, color: colors.text }]}>{chapter.body}</Text>
        </TouchableOpacity>
      </ScrollView>

      {showSettings && showChrome && (
        <View style={[s.settingsPanel, { backgroundColor: colors.bar, borderTopColor: colors.border }]}>
          <Text style={[s.settingLabel, { color: colors.secondary }]}>背景</Text>
          <View style={s.themeRow}>
            {Object.entries(THEMES).map(([key, value]) => (
              <TouchableOpacity key={key} onPress={() => { setTheme(key as ReaderTheme); AsyncStorage.setItem('miaobi.reader.theme', key); }} style={[s.themeButton, { backgroundColor: value.bg, borderColor: theme === key ? T.grey : value.border }]}>
                <Text style={{ color: value.text, fontSize: 10 }}>{key === 'dark' ? '夜间' : key === 'sepia' ? '护眼' : '纸张'}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[s.settingLabel, { color: colors.secondary }]}>字号</Text>
          <View style={s.fontRow}>
            {[15, 17, 19, 22, 25].map(size => (
              <TouchableOpacity key={size} onPress={() => { setFontSize(size); AsyncStorage.setItem('miaobi.reader.fontSize', String(size)); }} style={[s.fontButton, { borderColor: fontSize === size ? T.grey : colors.border }]}>
                <Text style={{ color: colors.text, fontSize: Math.min(size - 3, 15) }}>A</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {showChrome && (
        <View style={[s.bottomBar, { backgroundColor: colors.bar, borderTopColor: colors.border }]}>
          <TouchableOpacity disabled={!current} onPress={() => jump(-1)} style={[s.navButton, !current && s.disabled, { borderColor: colors.border }]}>
            <Icon.back size={14} color={current ? colors.text : colors.secondary} /><Text style={[s.navText, { color: colors.text }]}>上一章</Text>
          </TouchableOpacity>
          <View style={[s.progressTrack, { backgroundColor: colors.border }]}><View style={[s.progressFill, { width: `${((current + 1) / chapters.length) * 100}%`, backgroundColor: colors.text }]} /></View>
          <TouchableOpacity disabled={current >= chapters.length - 1} onPress={() => jump(1)} style={[s.navButton, current >= chapters.length - 1 && s.disabled, { borderColor: colors.border }]}>
            <Text style={[s.navText, { color: colors.text }]}>下一章</Text><Icon.forward size={14} color={current < chapters.length - 1 ? colors.text : colors.secondary} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const s = require('./ReaderScreen.styles').default;
