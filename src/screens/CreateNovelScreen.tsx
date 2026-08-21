import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, StatusBar } from 'react-native';
import { createNovel } from '../lib/novelMemory';
import { getSettings } from '../lib/storage';
import CapsuleAlert, { CapsuleToast } from '../components/CapsuleAlert';
import { T } from '../lib/theme';
import { Icon } from '../lib/icons';

type Props = any;
const GENRES = ['玄幻', '言情', '悬疑', '科幻', '历史', '武侠', '都市', '恐怖', '奇幻', '其他'];

export default function CreateNovelScreen({ navigation }: Props) {
  const [title, setTitle] = useState('');
  const [genre, setGenre] = useState('');
  const [synopsis, setSynopsis] = useState('');
  const [styleGuide, setStyleGuide] = useState('');
  const [protagonist, setProtagonist] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [confirmModal, setConfirmModal] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) { setToast('请输入书名'); return; }
    if (!genre) { setToast('请选择类型'); return; }
    const settings = await getSettings();
    if (!settings.apiKey) { setConfirmModal(true); return; }
    await doCreate();
  };

  const doCreate = async () => {
    setLoading(true);
    try {
      const novel = await createNovel(title.trim(), genre, synopsis.trim(), styleGuide.trim() + (protagonist.trim() ? '\n\n## 主角人设\n' + protagonist.trim() : ''));
      navigation.replace('NovelDetail', { novelId: novel.id });
    } catch (e: any) { setToast('创建失败：' + e.message); }
    finally { setLoading(false); }
  };

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      {/* Header */}
      <View style={s.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Icon.back size={18} color={T.accent} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>创建新作品</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Title */}
      <Text style={s.label}>书名 *</Text>
      <TextInput style={s.input} value={title} onChangeText={setTitle} placeholder="给你的小说起个名字" placeholderTextColor={T.textMuted} />

      {/* Genre */}
      <Text style={s.label}>类型 *</Text>
      <View style={s.genreGrid}>
        {GENRES.map(g => (
          <TouchableOpacity key={g} style={[s.genreChip, genre === g && s.genreActive]} onPress={() => setGenre(g)} activeOpacity={0.7}>
            <Text style={[s.genreTxt, genre === g && s.genreTxtActive]}>{g}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Synopsis */}
      <Text style={s.label}>简介</Text>
      <TextInput style={[s.input, s.textArea]} value={synopsis} onChangeText={setSynopsis} placeholder="一句话描述你的故事核心" placeholderTextColor={T.textMuted} multiline numberOfLines={3} />

      {/* Style */}
      <Text style={s.label}>风格指南</Text>
      <TextInput style={[s.input, s.textArea]} value={styleGuide} onChangeText={setStyleGuide} placeholder="如：第一人称，节奏紧凑，对话多" placeholderTextColor={T.textMuted} multiline numberOfLines={3} />

      {/* Protagonist */}
      <Text style={s.label}>👤 主角人设</Text>
      <TextInput style={[s.input, s.textArea, { minHeight: 100 }]} value={protagonist} onChangeText={setProtagonist} placeholder="姓名/年龄/职业/性格/背景/外貌/目标" placeholderTextColor={T.textMuted} multiline numberOfLines={6} />

      {/* Submit */}
      <TouchableOpacity style={[s.submitBtn, loading && { opacity: 0.5 }]} onPress={handleCreate} disabled={loading} activeOpacity={0.8}>
        <View style={{flexDirection: "row", alignItems: "center", gap: 6}}><Text style={s.submitTxt}>{loading ? '创建中...' : '开始创作'}</Text><Icon.forward size={16} color="#FFF" /></View>
      </TouchableOpacity>

      <CapsuleToast visible={!!toast} text={toast} onHide={() => setToast('')} />
      <CapsuleAlert visible={confirmModal} title="提示" message="请先在设置中配置 DeepSeek API Key" confirmText="去设置" onCancel={() => setConfirmModal(false)} onConfirm={() => { setConfirmModal(false); navigation.navigate('Settings'); }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },
  content: { padding: T.sp.xl, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: (StatusBar.currentHeight || 44), paddingBottom: T.sp.lg },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: T.card, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: T.border },
  backIcon: { fontSize: 18, color: T.accent },
  headerTitle: { fontSize: 18, fontWeight: '800', color: T.text },
  label: { fontSize: 13, color: T.textSec, marginBottom: 6, marginTop: 16, fontWeight: '600' },
  input: { backgroundColor: T.card, borderRadius: T.r.md, padding: 14, fontSize: 15, color: T.text, borderWidth: 1, borderColor: T.border },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  genreGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  genreChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: T.r.full, backgroundColor: T.card, borderWidth: 1, borderColor: T.border },
  genreActive: { backgroundColor: T.accent, borderColor: T.accent },
  genreTxt: { fontSize: 13, color: T.textSec },
  genreTxtActive: { color: '#FFF', fontWeight: '700' },
  submitBtn: { marginTop: 32, backgroundColor: T.accent, borderRadius: T.r.md, paddingVertical: 16, alignItems: 'center' },
  submitTxt: { fontSize: 16, fontWeight: '700', color: '#FFF' },
});
