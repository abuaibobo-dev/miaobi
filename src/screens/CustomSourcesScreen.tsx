import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, FlatList, Image, StatusBar, Text, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { T } from '../lib/theme';
import { Icon } from '../lib/icons';
import { searchCustomSource } from '../lib/bookSources';
import { getCustomSources } from '../lib/library';
import type { BookRecord, CustomBookSource } from '../types/book';

type Props = any;

interface SourceWithBooks {
  source: CustomBookSource;
  books: BookRecord[];
  loading: boolean;
  error?: string;
}

export default function CustomSourcesScreen({ navigation }: Props) {
  const [items, setItems] = useState<SourceWithBooks[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  useFocusEffect(useCallback(() => {
    let mounted = true;
    (async () => {
      const sources = await getCustomSources();
      if (!mounted) return;
      setTotalCount(sources.length);
      const initial = sources.map(source => ({ source, books: [] as BookRecord[], loading: true }));
      setItems(initial);

      const results = await Promise.allSettled(
        sources.map(async source => {
          const tried: BookRecord[] = [];
          for (const q of ['classic', 'popular', '小说']) {
            const result = await searchCustomSource(source, q).catch(() => [] as BookRecord[]);
            tried.push(...result);
            if (tried.length > 0) break;
          }
          return tried;
        })
      );
      if (!mounted) return;
      setItems(sources.map((source, index) => ({
        source,
        books: results[index].status === 'fulfilled' ? results[index].value.slice(0, 12) : [],
        error: results[index].status === 'rejected' ? '请求失败' : (results[index].status === 'fulfilled' && results[index].value.length === 0 ? '该源未返回结果' : undefined),
        loading: false,
      })));
    })();
    return () => { mounted = false; };
  }, []));

  const loadMore = async (sourceId: string) => {
    setItems(prev => prev.map(item =>
      item.source.id === sourceId ? { ...item, loading: true } : item
    ));
    try {
      const source = items.find(item => item.source.id === sourceId)?.source;
      if (!source) return;
      const allBooks: BookRecord[] = [];
      for (const q of ['popular', 'classic', '小说', '文学']) {
        const result = await searchCustomSource(source, q).catch(() => [] as BookRecord[]);
        allBooks.push(...result);
        if (allBooks.length >= 12) break;
      }
      setItems(prev => prev.map(item =>
        item.source.id === sourceId ? { ...item, books: allBooks.slice(0, 20), loading: false, error: allBooks.length === 0 ? '该源未返回结果' : undefined } : item
      ));
    } catch {
      setItems(prev => prev.map(item =>
        item.source.id === sourceId ? { ...item, loading: false, error: '请求出错' } : item
      ));
    }
  };

  return (
    <View style={s.screen}>
      <StatusBar barStyle="light-content" backgroundColor={T.bg} />
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
          <Icon.back size={19} color={T.text} />
        </TouchableOpacity>
        <Text style={s.title}>自定义书源</Text>
        <Text style={s.countBadge}>{totalCount} 个</Text>
      </View>

      <FlatList
        data={items}
        keyExtractor={item => item.source.id}
        contentContainerStyle={s.list}
        ListEmptyComponent={
          <View style={s.empty}>
            <Icon.book size={40} color="#444" />
            <Text style={s.emptyText}>还没有导入书源</Text>
            <Text style={s.emptyHint}>去书源管理页面导入 JSON 书源文件</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={s.sourceBlock}>
            <View style={s.sourceHeader}>
              <View style={s.sourceInfo}>
                <Text style={s.sourceName}>{item.source.name}</Text>
                <Text style={s.sourceMeta}>{item.source.kind.toUpperCase()} · {item.books.length} 本</Text>
              </View>
              <TouchableOpacity
                style={s.moreButton}
                onPress={() => navigation.navigate('Home' as any)}
              >
                <Text style={s.moreText}>查看全部</Text>
                <Icon.forward size={13} color={T.textSec} />
              </TouchableOpacity>
            </View>

            {item.loading ? (
              <View style={s.loadingRow}>
                <ActivityIndicator color={T.textMuted} />
                <Text style={s.loadingText}>加载中…</Text>
              </View>
            ) : item.error ? (
              <Text style={s.errorText}>{item.error}</Text>
            ) : item.books.length === 0 ? (
              <Text style={s.noBooks}>暂无内容</Text>
            ) : (
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={item.books}
                keyExtractor={book => book.id}
                contentContainerStyle={{ gap: 8, paddingRight: 16 }}
                renderItem={({ item: book }) => (
                  <TouchableOpacity
                    style={s.bookCard}
                    onPress={() => navigation.navigate('BookDetail', { book })}
                    activeOpacity={0.7}
                  >
                    <View style={[s.bookCover, !book.coverUrl && { alignItems: 'center', justifyContent: 'center' }]}>
                      {book.coverUrl
                        ? <Image source={{ uri: book.coverUrl }} style={s.bookImage} />
                        : <Icon.book size={16} color="#555" />
                      }
                    </View>
                    <Text style={s.bookTitle} numberOfLines={2}>{book.title}</Text>
                    <Text style={s.bookAuthor} numberOfLines={1}>{book.authors?.[0] || book.sourceLabel}</Text>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        )}
      />
    </View>
  );
}

const s = require('./CustomSourcesScreen.styles').default;
