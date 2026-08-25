import React, { useCallback, useState } from 'react';
import { FlatList, Image, StatusBar, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { T } from '../lib/theme';
import { showAlert } from '../components/CustomAlert';
import { Icon } from '../lib/icons';
import { importLocalBook, removeFromShelf, updateLibraryBook } from '../lib/library';
import type { LibraryBook, ShelfStatus } from '../types/book';

type Props = any;

const TABS: Array<{ id: ShelfStatus | 'all'; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'reading', label: '在看' },
  { id: 'want', label: '想看' },
  { id: 'finished', label: '看完' },
  { id: 'dropped', label: '弃了' },
];

export default function ShelfScreen({ navigation }: Props) {
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [tab, setTab] = useState<ShelfStatus | 'all'>('all');
  const [notice, setNotice] = useState('');

  useFocusEffect(useCallback(() => {
    import('../lib/library').then(({ getLibrary }) => getLibrary().then(setBooks));
  }, []));

  const filtered = tab === 'all' ? books : books.filter(book => book.status === tab);
  const refresh = async () => setBooks(await (await import('../lib/library')).getLibrary());

  const remove = (book: LibraryBook) => {
    showAlert('移出书架', book.title, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: async () => { await removeFromShelf(book.id); refresh(); } },
    ]);
  };

  const setStatus = async (book: LibraryBook, status: ShelfStatus) => {
    await updateLibraryBook(book.id, { status });
    refresh();
  };

  return (
    <View style={s.screen}>
      <StatusBar barStyle="light-content" backgroundColor={T.bg} />
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backButton}><Icon.back size={19} color={T.text} /></TouchableOpacity>
        <Text style={s.topTitle}>我的书架</Text>
        <TouchableOpacity
          style={s.importButton}
          onPress={async () => {
            try {
              const result = await importLocalBook();
              if (result.message) setNotice(result.message);
              refresh();
            } catch (error: any) {
              setNotice(error.message || '导入失败');
            }
          }}
        >
          <Text style={s.importText}>导入TXT/书单</Text>
        </TouchableOpacity>
      </View>

      <View style={s.tabs}>
        {TABS.map(item => (
          <TouchableOpacity key={item.id} style={[s.tabChip, tab === item.id && s.activeTab]} onPress={() => setTab(item.id)}>
            <Text style={[s.tabText, tab === item.id && s.activeTabText]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {!!notice && <Text style={s.notice}>{notice}</Text>}
      {!filtered.length ? (
        <View style={s.empty}><Icon.book size={44} color="#333" /><Text style={s.emptyText}>书架空空</Text></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          contentContainerStyle={s.list}
          renderItem={({ item }) => (
            <View style={s.card}>
              <TouchableOpacity
                style={{ flex: 1, flexDirection: 'row', gap: 12 }}
                onPress={() => navigation.navigate('BookDetail', { book: item })}
                onLongPress={() => remove(item)}
              >
                <View style={s.cover}>
                  {item.coverUrl ? <Image source={{ uri: item.coverUrl }} style={s.coverImage} /> : <Icon.book size={20} color="#666" />}
                </View>
                <View style={s.body}>
                  <Text style={s.title} numberOfLines={2}>{item.title}</Text>
                  <Text style={s.meta} numberOfLines={1}>{item.sourceLabel}</Text>
                  <Text style={s.status}>{TABS.find(tabItem => tabItem.id === item.status)?.label || '想看'}{item.localUri ? ' · 已下载' : ''}</Text>
                </View>
              </TouchableOpacity>
              <View style={s.actions}>
                <TouchableOpacity onPress={() => setStatus(item, 'reading')} style={s.miniButton}><Text style={s.miniText}>在读</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => setStatus(item, 'finished')} style={s.miniButton}><Text style={s.miniText}>看完</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => remove(item)} style={[s.miniButton, s.danger]}><Text style={s.miniText}>删</Text></TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const s = require('./ShelfScreen.styles').default;
