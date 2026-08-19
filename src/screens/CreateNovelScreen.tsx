import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView,
} from 'react-native';
import { createNovel } from '../lib/novelMemory';
import { getSettings } from '../lib/storage';
// navigation types simplified

const COLORS = {
  bg: '#0D0D0D', card: '#1A1A1A', border: '#2A2A2A',
  text: '#FFFFFF', sub: '#888888', accent: '#00FF41',
};

type Props = any;

const GENRES = ['玄幻', '言情', '悬疑', '科幻', '历史', '武侠', '都市', '恐怖', '奇幻', '其他'];

export default function CreateNovelScreen({ navigation }: Props) {
  const [title, setTitle] = useState('');
  const [genre, setGenre] = useState('');
  const [synopsis, setSynopsis] = useState('');
  const [styleGuide, setStyleGuide] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) { Alert.alert('提示', '请输入书名'); return; }
    if (!genre) { Alert.alert('提示', '请选择类型'); return; }

    const settings = await getSettings();
    if (!settings.apiKey) {
      Alert.alert('提示', '请先在设置中配置 DeepSeek API Key', [
        { text: '去设置', onPress: () => navigation.navigate('Settings') },
        { text: '继续', onPress: () => doCreate() },
      ]);
      return;
    }
    await doCreate();
  };

  const doCreate = async () => {
    setLoading(true);
    try {
      const novel = await createNovel(title.trim(), genre, synopsis.trim(), styleGuide.trim());
      navigation.replace('NovelDetail', { novelId: novel.id });
    } catch (e: any) {
      Alert.alert('创建失败', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.header}>✨ 创建新作品</Text>

      <Text style={styles.label}>书名 *</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="给你的小说起个名字"
        placeholderTextColor="#555"
      />

      <Text style={styles.label}>类型 *</Text>
      <View style={styles.genreGrid}>
        {GENRES.map(g => (
          <TouchableOpacity
            key={g}
            style={[styles.genreChip, genre === g && styles.genreChipActive]}
            onPress={() => setGenre(g)}
          >
            <Text style={[styles.genreText, genre === g && styles.genreTextActive]}>{g}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>简介</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={synopsis}
        onChangeText={setSynopsis}
        placeholder="一句话描述你的故事核心"
        placeholderTextColor="#555"
        multiline
        numberOfLines={3}
      />

      <Text style={styles.label}>风格指南（可选）</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={styleGuide}
        onChangeText={setStyleGuide}
        placeholder="如：第一人称，节奏紧凑，对话多，少用形容词"
        placeholderTextColor="#555"
        multiline
        numberOfLines={3}
      />

      <TouchableOpacity
        style={[styles.createBtn, loading && styles.createBtnDisabled]}
        onPress={handleCreate}
        disabled={loading}
      >
        <Text style={styles.createBtnText}>{loading ? '创建中...' : '开始创作 🚀'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 20, paddingBottom: 40 },
  header: { fontSize: 22, fontWeight: 'bold', color: COLORS.text, marginBottom: 24 },
  label: { fontSize: 14, color: COLORS.sub, marginBottom: 8, marginTop: 16 },
  input: {
    backgroundColor: COLORS.card, borderRadius: 10, padding: 14, fontSize: 16,
    color: COLORS.text, borderWidth: 1, borderColor: COLORS.border,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  genreGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  genreChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
  },
  genreChipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  genreText: { fontSize: 14, color: COLORS.sub },
  genreTextActive: { color: '#000', fontWeight: '600' },
  createBtn: {
    marginTop: 30, backgroundColor: COLORS.accent, borderRadius: 12,
    paddingVertical: 16, alignItems: 'center',
  },
  createBtnDisabled: { opacity: 0.5 },
  createBtnText: { fontSize: 16, fontWeight: 'bold', color: '#000' },
});
