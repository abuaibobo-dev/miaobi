import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, ScrollView, StatusBar,
  Text, TouchableOpacity, View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { T } from '../lib/theme';
import { Icon } from '../lib/icons';
import { findLibraryBook, readBookContent, splitChapters, updateLibraryBook } from '../lib/library';

type Props = any;

export default function ReaderScreen({ navigation, route }: Props) {
  const bookId: string = route.params?.bookId;
  const [chapters, setChapters] = useState<Array<{ title: string; body: string; index: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [current, setCurrent] = useState(0);
  const [fontSize, setFontSize] = useState(18);
  const [showChrome, setShowChrome] = useState(true);
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
        if (saved?.progress) setCurrent(Math.min(Math.round(saved.progress * parsed.length), parsed.length - 1));
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
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    if (chapters.length) updateLibraryBook(bookId, { progress: (current + 1) / chapters.length });
  }, [current, chapters.length]);

  const cycleFont = () => {
    const sizes = [15, 17, 19, 22, 25];
    const next = sizes[(sizes.indexOf(fontSize) + 1) % sizes.length];
    setFontSize(next);
    AsyncStorage.setItem('miaobi.reader.fontSize', String(next));
  };

  const jump = useCallback((direction: number) => {
    setCurrent(prev => Math.max(0, Math.min(chapters.length - 1, prev + direction)));
  }, [chapters.length]);

  if (loading) return (
    <View style={s.center}><StatusBar barStyle="light-content" backgroundColor={T.bg} /><ActivityIndicator color="#E5E5E5" /></View>
  );

  if (error || !chapters.length) return (
    <View style={s.screen}>
      <StatusBar barStyle="light-content" backgroundColor={T.bg} />
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.iconButton}><Icon.back size={19} color={T.text} /></TouchableOpacity>
        <Text style={s.topTitle}>阅读</Text><View style={{ width: 37 }} />
      </View>
      <View style={s.center}><Icon.book size={40} color="#444" /><Text style={s.error}>{error || '没有内容'}</Text></View>
    </View>
  );

  const chapter = chapters[current];
  return (
    <View style={s.screen}>
      <StatusBar barStyle="light-content" backgroundColor={T.bg} />
      {showChrome && (
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.iconButton}><Icon.back size={19} color={T.text} /></TouchableOpacity>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.topTitle} numberOfLines={1}>{chapter.title}</Text>
            <Text style={s.pageInfo}>{current + 1} / {chapters.length}</Text>
          </View>
          <TouchableOpacity onPress={cycleFont} style={s.iconButton}><Text style={s.fontLabel}>Aa</Text></TouchableOpacity>
        </View>
      )}

      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={s.readerBody}>
        <TouchableOpacity activeOpacity={1} onPress={() => setShowChrome(v => !v)}>
          <Text style={[s.chapterTitle, { fontSize: fontSize + 4 }]}>{chapter.title}</Text>
          <Text style={[s.body, { fontSize }]}>{chapter.body}</Text>
        </TouchableOpacity>
      </ScrollView>

      {showChrome && (
        <View style={s.bottomBar}>
          <TouchableOpacity disabled={!current} onPress={() => jump(-1)} style={[s.navButton, !current && s.disabled]}>
            <Icon.back size={14} color={current ? T.text : '#555'} /><Text style={s.navText}>上一章</Text>
          </TouchableOpacity>
          <View style={s.progressTrack}><View style={[s.progressFill, { width: `${((current + 1) / chapters.length) * 100}%` }]} /></View>
          <TouchableOpacity disabled={current >= chapters.length - 1} onPress={() => jump(1)} style={[s.navButton, current >= chapters.length - 1 && s.disabled]}>
            <Text style={s.navText}>下一章</Text><Icon.forward size={14} color={current < chapters.length - 1 ? T.text : '#555'} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const s = require('./ReaderScreen.styles').default;
