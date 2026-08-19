import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Modal,
} from 'react-native';
import { getChatHistory, appendChatMessage, clearChatHistory, getNovels } from '../lib/storage';
import { buildSystemPrompt, processPostWrite, addChapter, getStoryBible, updateNovelBible } from '../lib/novelMemory';
import { chatCompletion } from '../lib/llm';
import type { ChatMessage } from '../types/novel';
import { v4 as uuid } from 'uuid';

const COLORS = {
  bg: '#0D0D0D', card: '#1A1A1A', border: '#2A2A2A',
  text: '#FFFFFF', sub: '#888888', accent: '#00FF41',
  userBg: '#1A2A1A', aiBg: '#1A1A1A', danger: '#FF0044',
};

type Props = any;

export default function ChatScreen({ navigation, route }: Props) {
  const { novelId } = route.params;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [autoWriting, setAutoWriting] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // 大纲确认弹窗
  const [outlineModal, setOutlineModal] = useState(false);
  const [outline, setOutline] = useState('');
  const [pendingOutline, setPendingOutline] = useState('');

  useEffect(() => { getChatHistory(novelId).then(setMessages); }, [novelId]);
  useEffect(() => {
    if (messages.length > 0) setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages]);

  const buildApiMessages = async (extraUserMsg?: string) => {
    const novels = await getNovels();
    const novel = novels.find(n => n.id === novelId);
    const nextCh = (novel?.totalChapters || 0) + 1;
    const systemPrompt = await buildSystemPrompt(novelId, nextCh);
    const recentMsgs = messages.slice(-20);
    const apiMsgs = [
      { role: 'system' as const, content: systemPrompt },
      ...recentMsgs.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ];
    if (extraUserMsg) apiMsgs.push({ role: 'user' as const, content: extraUserMsg });
    return { apiMsgs, novel, nextCh };
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const userMsg: ChatMessage = { id: uuid(), role: 'user', content: text, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    await appendChatMessage(novelId, userMsg);
    await sendToAI(userMsg.content);
  };

  const sendToAI = async (userText: string) => {
    try {
      const { apiMsgs, novel, nextCh } = await buildApiMessages(userText);
      const res = await chatCompletion(apiMsgs);
      if (res.error) { Alert.alert('错误', res.error); setLoading(false); return; }
      const aiMsg: ChatMessage = { id: uuid(), role: 'assistant', content: res.content, timestamp: new Date().toISOString() };
      setMessages(prev => [...prev, aiMsg]);
      await appendChatMessage(novelId, aiMsg);
      try {
        const jsonMatch = res.content.match(/```json\s*([\s\S]*?)```/);
        if (jsonMatch) {
          const update = JSON.parse(jsonMatch[1]);
          if (update.summary || update.characterChanges || update.newForeshadowing) {
            await processPostWrite(novelId, nextCh, update.summary || '', update.characterChanges || [], update.newForeshadowing || [], update.resolvedForeshadowing || []);
            if (update.summary) await addChapter(novelId, `第${nextCh}章`, res.content, update.summary);
          }
        }
      } catch {}
    } catch (e: any) { Alert.alert('错误', e.message); }
    setLoading(false);
  };

  // ★ 一键续写：先出大纲，用户确认后再写
  const handleAutoWrite = async () => {
    if (autoWriting || loading) return;
    setAutoWriting(true);
    setLoading(true);
    const novel = await getStoryBible(novelId);
    const nextCh = (novel?.totalChapters || 0) + 1;
    // 第一步：请求大纲
    const outlinePrompt = `根据之前的剧情，请为第${nextCh}章生成一个详细大纲（200-300字），包括：本章核心事件、出场角色、情绪走向、结尾钩子。只输出大纲，不要写正文。`;
    try {
      const { apiMsgs } = await buildApiMessages(outlinePrompt);
      const res = await chatCompletion(apiMsgs);
      if (res.error) { Alert.alert('错误', res.error); setLoading(false); setAutoWriting(false); return; }
      setPendingOutline(res.content);
      setOutlineModal(true);
    } catch (e: any) { Alert.alert('错误', e.message); }
    setLoading(false);
    setAutoWriting(false);
  };

  // 用户确认大纲，开始写正文
  const handleOutlineConfirm = async () => {
    setOutlineModal(false);
    setLoading(true);
    const novel = await getStoryBible(novelId);
    const nextCh = (novel?.totalChapters || 0) + 1;
    const writePrompt = `已确认大纲：\n${pendingOutline}\n\n请根据以上大纲写出第${chNum(nextCh)}章的完整正文（1500-2500字）。写完后输出 JSON 更新指令。`;
    const userMsg: ChatMessage = { id: uuid(), role: 'user', content: `✅ 确认大纲，开始写作`, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    await appendChatMessage(novelId, userMsg);
    await sendToAI(writePrompt);
    setPendingOutline('');
  };

  const chNum = (n: number) => n <= 10 ? ['零','一','二','三','四','五','六','七','八','九','十'][n] : String(n);

  const handleClear = () => {
    Alert.alert('清空对话', '确定清空所有对话记录？', [
      { text: '取消', style: 'cancel' },
      { text: '清空', style: 'destructive', onPress: async () => { await clearChatHistory(novelId); setMessages([]); } },
    ]);
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}>
        {!isUser && <Text style={styles.aiLabel}>✍️ 妙笔</Text>}
        <Text style={[styles.bubbleText, isUser ? styles.userText : styles.aiText]}>{item.content}</Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.backBtn}>← 返回</Text></TouchableOpacity>
        <Text style={styles.topTitle}>💬 写作对话</Text>
        <TouchableOpacity onPress={handleClear}><Text style={styles.clearBtn}>🗑️</Text></TouchableOpacity>
      </View>

      <View style={styles.quickBar}>
        <TouchableOpacity style={styles.quickBtn} onPress={handleAutoWrite} disabled={autoWriting || loading}>
          <Text style={styles.quickBtnText}>{autoWriting ? '⏳ 大纲生成中...' : '⚡ 一键续写'}</Text>
        </TouchableOpacity>
      </View>

      <FlatList ref={flatListRef} data={messages} keyExtractor={item => item.id} renderItem={renderMessage}
        contentContainerStyle={styles.messageList}
        ListFooterComponent={loading ? <View style={styles.loadingBubble}><ActivityIndicator color={COLORS.accent} size="small" /><Text style={styles.loadingText}>思考中...</Text></View> : null}
      />

      <View style={styles.inputBar}>
        <TextInput style={styles.textInput} value={input} onChangeText={setInput} placeholder="输入灵感、剧情、角色设定..." placeholderTextColor="#555" multiline maxLength={4000} editable={!loading} />
        <TouchableOpacity style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]} onPress={handleSend} disabled={loading || !input.trim()}>
          <Text style={styles.sendBtnText}>↑</Text>
        </TouchableOpacity>
      </View>

      {/* ★ 大纲确认弹窗 */}
      <Modal visible={outlineModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>📋 本章大纲确认</Text>
            <Text style={styles.modalHint}>请检查大纲，确认后 AI 将据此写正文</Text>
            <Text style={styles.modalOutline}>{pendingOutline}</Text>
            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setOutlineModal(false)}>
                <Text style={styles.modalCancelText}>修改</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={handleOutlineConfirm}>
                <Text style={styles.modalConfirmText}>✅ 确认写作</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn: { fontSize: 14, color: COLORS.accent },
  topTitle: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  clearBtn: { fontSize: 16 },
  quickBar: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8, gap: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  quickBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border },
  quickBtnText: { fontSize: 12, color: COLORS.accent },
  messageList: { padding: 16, paddingBottom: 8 },
  bubble: { marginBottom: 12, maxWidth: '88%' },
  userBubble: { alignSelf: 'flex-end', backgroundColor: COLORS.userBg, borderRadius: 16, borderTopRightRadius: 4, padding: 12 },
  aiBubble: { alignSelf: 'flex-start', backgroundColor: COLORS.aiBg, borderRadius: 16, borderTopLeftRadius: 4, padding: 12, borderWidth: 1, borderColor: COLORS.border },
  aiLabel: { fontSize: 11, color: COLORS.accent, marginBottom: 4, fontWeight: '600' },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  userText: { color: COLORS.text },
  aiText: { color: '#CCCCCC' },
  loadingBubble: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: COLORS.aiBg, borderRadius: 16, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border, gap: 8 },
  loadingText: { fontSize: 13, color: COLORS.sub },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', padding: 12, borderTopWidth: 1, borderTopColor: COLORS.border, gap: 8 },
  textInput: { flex: 1, backgroundColor: COLORS.card, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: COLORS.text, maxHeight: 120, borderWidth: 1, borderColor: COLORS.border },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.accent, justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled: { backgroundColor: '#333' },
  sendBtnText: { fontSize: 20, color: '#000', fontWeight: 'bold', marginTop: -1 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard: { backgroundColor: COLORS.card, borderRadius: 16, padding: 20, width: '100%', maxHeight: '80%', borderWidth: 1, borderColor: COLORS.border },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text, marginBottom: 8 },
  modalHint: { fontSize: 13, color: COLORS.sub, marginBottom: 12 },
  modalOutline: { fontSize: 14, color: '#CCCCCC', lineHeight: 22, marginBottom: 16, maxHeight: 300 },
  modalBtnRow: { flexDirection: 'row', gap: 12 },
  modalCancel: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#2A2A2A', alignItems: 'center' },
  modalCancelText: { fontSize: 15, color: COLORS.sub },
  modalConfirm: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: COLORS.accent, alignItems: 'center' },
  modalConfirmText: { fontSize: 15, fontWeight: 'bold', color: '#000' },
});
