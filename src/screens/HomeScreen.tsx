import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, Image, KeyboardAvoidingView, Platform,
  StatusBar, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { T } from '../lib/theme';
import { Icon } from '../lib/icons';
import { searchAllSources } from '../lib/bookSources';
import { parseBookQuery, rankBooks } from '../lib/deepseekBooks';
import { getLibrary } from '../lib/library';
import type { BookRecord, ContentCategory } from '../types/book';

type Props = any;

const CATEGORIES: Array<{ id: ContentCategory; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'book', label: '小说' },
  { id: 'story', label: '故事' },
  { id: 'magazine', label: '杂志' },
  { id: 'newspaper', label: '报纸' },
  { id: 'art', label: '写真艺术' },
];

const QUICK_TAGS = ['鲁迅', '张爱玲', 'Grimm fairy tales', 'Sherlock Holmes', '民国杂志', '老照片'];

export default function HomeScreen({ navigation }: Props) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ContentCategory>('all');
  const [books, setBooks] = useState<BookRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [notice, setNotice] = useState('');
  const [shelfCount, setShelfCount] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const listRef = useRef<FlatList<BookRecord>>(null);

  useFocusEffect(useCallback(() => {
    getLibrary().then(list => setShelfCount(list.length));
    AsyncStorage.getItem('miaobi.recentSearches').then(raw => {
      const value = raw ? JSON.parse(raw) : [];
      setRecent(Array.isArray(value) ? value.slice(0, 8) : []);
    });
  }, []));

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 2600);
    return () => clearTimeout(timer);
  }, [notice]);

  const rememberQuery = async (value: string) => {
    const next = [value, ...recent.filter(item => item !== value)].slice(0, 10);
    setRecent(next);
    await AsyncStorage.setItem('miaobi.recentSearches', JSON.stringify(next));
  };

  const search = async (rawQuery?: string, forcedCategory?: ContentCategory) => {
    const input = (rawQuery ?? query).trim();
    if (!input || loading) return;
    const activeCategory = forcedCategory ?? category;
    setLoading(true);
    setSearched(true);
    setNotice('');
    await rememberQuery(input);

    try {
      let queries = [input];
      let parsedCategory = activeCategory;
      try {
        const parsed = await parseBookQuery(input);
        if (parsed.queries?.length) queries = parsed.queries;
        if (activeCategory === 'all' && parsed.category) parsedCategory = parsed.category;
      } catch {}

      const result = await searchAllSources(queries, parsedCategory);
      let ranked = result.books;
      try {
        const scores = await rankBooks(input, result.books);
        ranked = [...result.books].sort((a, b) => (scores[b.id]?.score || 0) - (scores[a.id]?.score || 0));
      } catch {}

      setBooks(ranked);
      if (!ranked.length) setNotice('没有找到结果，试试换关键词或分类');
      else if (result.errors.length) setNotice(`部分源未响应：${result.errors.join('、')}`);
    } catch (error: any) {
      setBooks([]);
      setNotice(error?.message || '搜索失败，请检查网络');
    } finally {
      setLoading(false);
    }
  };

  const renderItem = ({ item }: { item: BookRecord }) => (
    <TouchableOpacity
      style={s.resultCard}
      activeOpacity={0.75}
      onPress={() => navigation.navigate('BookDetail', { book: item })}
    >
      <View style={s.coverBox}>
        {item.coverUrl ? <Image source={{ uri: item.coverUrl }} style={s.coverImage} />
          : <Icon.book size={24} color="#666" />}
      </View>
      <View style={s.resultBody}>
        <Text style={s.title} numberOfLines={2}>{item.title}</Text>
        {!!item.authors.length && <Text style={s.author} numberOfLines={1}>{item.authors.join(' / ')}</Text>}
        <Text style={s.source}>{item.sourceLabel}{item.year ? ` · ${item.year}` : ''}</Text>
        {!!item.description && <Text style={s.description} numberOfLines={2}>{item.description}</Text>}
        {item.locallyReadable && <Text style={s.readable}>可本地阅读</Text>}
      </View>
    </TouchableOpacity>
  );

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="light-content" backgroundColor={T.bg} />
      <View style={s.header}>
        <View style={s.headerTitle}>
          <Text style={s.brand}>书海</Text>
          <Text style={s.subline}>公开来源 · 本地阅读</Text>
        </View>
        <TouchableOpacity style={s.headerButton} onPress={() => navigation.navigate('Shelf')}>
          <Icon.book size={17} color={T.text} />
          <Text style={s.headerButtonText}>书架{shelfCount ? ` ${shelfCount}` : ''}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.iconButton} onPress={() => navigation.navigate('Settings')}>
          <Icon.settings size={18} color={T.textSec} />
        </TouchableOpacity>
      </View>

      <View style={s.searchBar}>
        <Icon.search size={17} color={T.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="搜小说、杂志、报纸、老照片…"
          placeholderTextColor="#666"
          style={s.input}
          returnKeyType="search"
          onSubmitEditing={() => search()}
          multiline
        />
        <TouchableOpacity onPress={() => search()} style={s.searchButton}>
          <Text style={s.searchButtonText}>找书</Text>
        </TouchableOpacity>
      </View>

      <View style={s.categories}>
        {CATEGORIES.map(item => (
          <TouchableOpacity
            key={item.id}
            style={[s.categoryChip, category === item.id && s.categoryActive]}
            onPress={() => { setCategory(item.id); if (searched && query.trim()) search(query, item.id); }}
          >
            <Text style={[s.categoryText, category === item.id && s.categoryActiveText]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {!searched && (
        <View style={s.startBlock}>
          <Text style={s.sectionLabel}>最近搜索</Text>
          {recent.length ? (
            <View style={s.tagWrap}>
              {recent.map(tag => (
                <TouchableOpacity key={tag} style={s.tag} onPress={() => { setQuery(tag); search(tag); }}>
                  <Text style={s.tagText} numberOfLines={1}>{tag}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : <Text style={s.emptySmall}>暂无记录</Text>}
          <Text style={s.sectionLabel}>热门起点</Text>
          <View style={s.tagWrap}>
            {QUICK_TAGS.map(tag => (
              <TouchableOpacity key={tag} style={s.tag} onPress={() => { setQuery(tag); search(tag); }}>
                <Text style={s.tagText}>{tag}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={s.infoCard}>
            <Text style={s.infoTitle}>内容来自公开库</Text>
            <Text style={s.infoText}>古登堡、Open Library、Google Books、Internet Archive、中文维基文库、美国国会图书馆、大都会博物馆、Wikimedia Commons。</Text>
          </View>
        </View>
      )}

      {loading ? (
        <View style={s.loading}>
          <ActivityIndicator color="#E5E5E5" />
          <Text style={s.loadingText}>正在检索公开来源…</Text>
        </View>
      ) : searched && (
        <FlatList
          ref={listRef}
          data={books}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={s.results}
          ListEmptyComponent={<Text style={s.noResult}>没有匹配内容</Text>}
          onScrollBeginDrag={() => setNotice('')}
        />
      )}

      {!!notice && (
        <View style={s.notice}><Text style={s.noticeText}>{notice}</Text></View>
      )}
    </KeyboardAvoidingView>
  );
}

const s = require('./HomeScreen.styles').default;
