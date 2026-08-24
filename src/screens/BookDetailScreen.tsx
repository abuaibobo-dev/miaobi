import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Image, Linking, ScrollView, StatusBar,
  Text, TouchableOpacity, View,
} from 'react-native';
import { T } from '../lib/theme';
import { Icon } from '../lib/icons';
import { officialSearchLinks } from '../lib/bookSources';
import { addToShelf, downloadWikisource, findLibraryBook, prepareReadableFile } from '../lib/library';
import type { BookRecord } from '../types/book';

type Props = any;

export default function BookDetailScreen({ navigation, route }: Props) {
  const initial: BookRecord = route.params?.book;
  const [book, setBook] = useState<BookRecord>(initial);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    findLibraryBook(initial.id).then(saved => { if (saved) setBook(saved); });
  }, [initial.id]);

  const ensureSaved = async () => {
    const saved = await addToShelf(book, 'reading');
    setBook(saved);
    return saved;
  };

  const startReading = async () => {
    if (busy) return;
    if (book.localUri || book.source === 'local') {
      const saved = await ensureSaved();
      navigation.navigate('Reader', { bookId: saved.id });
      return;
    }
    try {
      setBusy(book.source === 'wikisource' ? '正在获取维基文库正文…' : '正在下载正文…');
      setNotice('');
      await addToShelf(book, 'reading');
      const uri = book.source === 'wikisource'
        ? await downloadWikisource(book)
        : await prepareReadableFile(book);
      const updated = { ...book, localUri: uri };
      setBook(updated);
      navigation.navigate('Reader', { bookId: updated.id });
    } catch (error: any) {
      setNotice(error.message || '无法获取正文');
    } finally {
      setBusy('');
    }
  };

  return (
    <View style={s.screen}>
      <StatusBar barStyle="light-content" backgroundColor={T.bg} />
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backButton}>
          <Icon.back size={20} color={T.text} />
        </TouchableOpacity>
        <Text style={s.topLabel}>详情</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={s.content}>
        <View style={s.hero}>
          <View style={s.cover}>
            {book.coverUrl
              ? <Image source={{ uri: book.coverUrl }} style={s.coverImage} />
              : <Icon.book size={30} color="#666" />}
          </View>
          <View style={s.meta}>
            <Text style={s.title}>{book.title}</Text>
            {!!book.authors.length && <Text style={s.authors}>{book.authors.join(' / ')}</Text>}
            <Text style={s.badge}>{book.sourceLabel}</Text>
            <View style={s.tags}>
              <Text style={s.tag}>{book.category}</Text>
              {book.year ? <Text style={s.tag}>{book.year}</Text> : null}
              {book.language ? <Text style={s.tag}>{book.language}</Text> : null}
            </View>
          </View>
        </View>

        {!!book.description && (
          <View style={s.sectionCard}>
            <Text style={s.sectionTitle}>简介</Text>
            <Text style={s.description}>{book.description}</Text>
          </View>
        )}

        {!!book.subjects?.length && (
          <View style={[s.sectionCard, s.subjectCard]}>
            {book.subjects.map((subject, index) => (
              <Text key={`${subject}-${index}`} style={s.subject}>{String(subject).slice(0, 60)}</Text>
            ))}
          </View>
        )}

        <TouchableOpacity style={[s.primaryButton, busy && s.buttonDisabled]} onPress={startReading} disabled={!!busy}>
          {busy ? <ActivityIndicator color="#111" /> : <Text style={s.primaryText}>{book.localUri ? '继续阅读' : '下载并阅读'}</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={s.secondaryButton} onPress={async () => { await addToShelf(book); setNotice('已加入书架'); }}>
          <Text style={s.secondaryText}>加入书架</Text>
        </TouchableOpacity>

        {!!notice && <Text style={s.notice}>{notice}</Text>}

        <View style={s.linksWrap}>
          {officialSearchLinks(book.title, book.authors[0]).map(link => (
            <TouchableOpacity key={link.name} style={s.linkButton} onPress={() => Linking.openURL(link.url)}>
              <Text style={s.linkText}>{link.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const s = require('./BookDetailScreen.styles').default;
