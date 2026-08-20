import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Modal,
} from 'react-native';
import { getChatHistory, appendChatMessage, clearChatHistory, getNovels } from '../lib/storage';
import { buildSystemPrompt, processPostWrite, addChapter, getStoryBible } from '../lib/novelMemory';
import { chatCompletion } from '../lib/llm';
import { parseThinking } from '../lib/thinkingParser';
import CapsuleAlert from '../components/CapsuleAlert';
import { T, ICON } from '../lib/theme';
import type { ChatMessage } from '../types/novel';

function uid(): string { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }

function ThinkingPanel({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [pulse, setPulse] = useState(true);
  
  React.useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setPulse(p => !p), 1200);
    return () => clearInterval(t);
  }, [open]);
  
  if (!text) return null;
  const steps = text.split('\n').filter(l => l.trim());
  
  return (
    <View style={th.c}>
      <TouchableOpacity style={th.h} onPress={() => setOpen(!open)} activeOpacity={0.7}>
        <View style={[th.pulseDot, pulse && th.pulseActive]} />
        <Text style={th.icon}>◎</Text>
        <Text style={th.label}>本章大纲</Text>
        <Text style={th.count}>{steps.length} 步</Text>
        <Text style={th.arrow}>{open ? '▾' : '▸'}</Text>
      </TouchableOpacity>
      {open && (
        <View style={th.body}>
          {steps.map((line, i) => (
            <View key={i} style={th.stepRow}>
              <View style={th.stepNum}>
                <Text style={th.stepNumText}>{i + 1}</Text>
              </View>
              <Text style={th.stepLine}>{line.replace(/^[\-•·]\s*/, '')}</Text>
            </View>
          ))}
          <View style={th.thinkingBar}>
            <View style={th.thinkingBarFill} />
          </View>
        </View>
      )}
    </View>
  );
}
const th = StyleSheet.create({
  c: { backgroundColor: T.accent + '08', borderRadius: T.r.lg, borderWidth: 1, borderColor: T.accent + '20', marginBottom: 10, overflow: 'hidden' },
  h: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 7 },
  pulseDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: T.accent, opacity: 0.4 },
  pulseActive: { opacity: 1 },
  icon: { fontSize: 13, color: T.accent, fontWeight: '600' },
  label: { fontSize: 12, color: T.accent, fontWeight: '600', flex: 1, letterSpacing: 0.5 },
  count: { fontSize: 10, color: T.textMuted, backgroundColor: T.card, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, overflow: 'hidden' },
  arrow: { fontSize: 10, color: T.accent, fontWeight: '700' },
  body: { paddingHorizontal: 12, paddingBottom: 10, borderTopWidth: 1, borderTopColor: T.accent + '15' },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 8 },
  stepNum: { width: 20, height: 20, borderRadius: 10, backgroundColor: T.accent + '20', justifyContent: 'center', alignItems: 'center', marginTop: 1 },
  stepNumText: { fontSize: 10, fontWeight: '700', color: T.accent },
  stepLine: { flex: 1, fontSize: 12, color: T.textSec, lineHeight: 18 },
  thinkingBar: { height: 3, backgroundColor: T.accent + '15', borderRadius: 2, marginTop: 10, overflow: 'hidden' },
  thinkingBarFill: { height: '100%', width: '60%', backgroundColor: T.accent + '40', borderRadius: 2 },
});

type Props = any;

export default function ChatScreen({ navigation, route }: Props) {
  const { novelId } = route.params;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const [outlineModal, setOutlineModal] = useState(false);
  const [pendingOutline, setPendingOutline] = useState('');
  const [clearConfirm, setClearConfirm] = useState(false);
  const [thinkingMap, setThinkingMap] = useState<Record<string, string>>({});
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  useEffect(() => { getChatHistory(novelId).then(setMessages); }, [novelId]);
  const scrollToBottom = () => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 50);
  };
  useEffect(() => { if (messages.length > 0) scrollToBottom(); }, [messages]);

  const buildApiMessages = async (extra?: string) => {
    const novels = await getNovels();
    const novel = novels.find(n => n.id === novelId);
    const nextCh = (novel?.totalChapters || 0) + 1;
    const sys = await buildSystemPrompt(novelId, nextCh);
    const recent = messages.slice(-20);
    const apiMsgs = [
      { role: 'system' as const, content: sys },
      ...recent.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ];
    if (extra) apiMsgs.push({ role: 'user' as const, content: extra });
    return { apiMsgs, novel, nextCh };
  };

  const sendToAI = async (userText: string) => {
    try {
      const { apiMsgs, nextCh } = await buildApiMessages(userText);
      const res = await chatCompletion(apiMsgs);
      if (res.error) { setLoading(false); return; }
      const { thinking, body } = parseThinking(res.content);
      const aiMsg: ChatMessage = { id: uid(), role: 'assistant', content: res.content, timestamp: new Date().toISOString() };
      if (thinking) setThinkingMap(prev => ({ ...prev, [aiMsg.id]: thinking }));
      setMessages(prev => [...prev, aiMsg]);
      await appendChatMessage(novelId, aiMsg);
      try {
        let jsonStr = '';
        const jsonMatch = res.content.match(/```json\s*([\s\S]*?)```/);
        if (jsonMatch) { jsonStr = jsonMatch[1].trim(); }
        else { const braceMatch = body.match(/\{[\s\S]*\}/); if (braceMatch) jsonStr = braceMatch[0]; }
        if (jsonStr) {
          jsonStr = jsonStr.replace(/，/g, ',').replace(/：/g, ':');
          try {
            const update = JSON.parse(jsonStr);
            if (update.summary || update.characterChanges || update.newForeshadowing) {
              await processPostWrite(novelId, nextCh, update.summary || '', update.characterChanges || [], update.newForeshadowing || [], update.resolvedForeshadowing || []);
              if (update.summary) await addChapter(novelId, `第${nextCh}章`, body, update.summary);
            }
          } catch {
            const summaryMatch = jsonStr.match(/"summary"\s*:\s*"([^"]+)"/);
            if (summaryMatch) await addChapter(novelId, `第${nextCh}章`, body, summaryMatch[1]);
          }
        }
      } catch {}
    } catch (e: any) { console.error(e); }
    setLoading(false);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const userMsg: ChatMessage = { id: uid(), role: 'user', content: text, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    await appendChatMessage(novelId, userMsg);
    await sendToAI(userMsg.content);
  };

  const handleAutoWrite = async () => {
    if (loading) return;
    setLoading(true);
    const novel = await getStoryBible(novelId);
    const nextCh = (novel?.totalChapters || 0) + 1;
    try {
      const { apiMsgs } = await buildApiMessages(`根据之前的剧情，请为第${nextCh}章生成一个详细大纲（200-300字），包括：本章核心事件、角色发展、冲突与转折。只输出大纲文本。`);
      const res = await chatCompletion(apiMsgs);
      if (!res.error) { setPendingOutline(res.content); setOutlineModal(true); }
    } catch {}
    setLoading(false);
  };

  const handleOutlineConfirm = async () => {
    setOutlineModal(false);
    setLoading(true);
    const userMsg: ChatMessage = { id: uid(), role: 'user', content: `请按照以下大纲写出完整章节：\n\n${pendingOutline}`, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    await appendChatMessage(novelId, userMsg);
    await sendToAI(userMsg.content);
    setPendingOutline('');
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    const think = thinkingMap[item.id] || '';
    let display = item.content;
    if (!isUser) {
      display = parseThinking(item.content).body.replace(/```json[\s\S]*?```/g, '').trim();
    }
    return (
      <View style={[s.bubble, isUser ? s.userBub : s.aiBub]}>
        {!isUser && (
            <View style={s.aiHeader}>
              <View style={s.aiAvatar}>
                <Text style={s.aiAvatarText}>◆</Text>
              </View>
              <Text style={s.aiLabel}>妙笔</Text>
            </View>
          )}
        {!isUser && <ThinkingPanel text={think} />}
        <Text style={[s.bubbleText, isUser ? s.userTxt : s.aiTxt]}>{display}</Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={s.container} behavior="padding" keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}>
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.topBtn}>
          <Text style={s.backIcon}>{ICON.back}</Text>
        </TouchableOpacity>
        <Text style={s.topTitle}>AI 写作</Text>
        <TouchableOpacity onPress={() => setClearConfirm(true)} style={s.topBtn}>
          <Text style={s.clearIcon}>{ICON.delete}</Text>
        </TouchableOpacity>
      </View>

      <View style={s.quickBar}>
        <TouchableOpacity style={s.quickBtn} onPress={handleAutoWrite} disabled={loading}>
          <Text style={s.quickText}>⚡ 续写</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.quickBtn} onPress={() => setInput('请帮我写新一章')} disabled={loading}>
          <Text style={s.quickText}>✎ 新章</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={renderMessage}
        contentContainerStyle={s.list}
        onContentSizeChange={() => scrollToBottom()}
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          const isNearBottom = contentSize.height - layoutMeasurement.height - contentOffset.y < 100;
          setShowScrollBtn(!isNearBottom);
        }}
        scrollEventThrottle={100}
        ListFooterComponent={loading ? (
          <View style={s.loadingRow}>
            <ActivityIndicator color={T.accent} size="small" />
            <Text style={s.loadingText}>构思中...</Text>
          </View>
        ) : null}
      />

      {showScrollBtn && (
        <TouchableOpacity style={s.scrollBtn} onPress={() => flatListRef.current?.scrollToEnd({ animated: true })} activeOpacity={0.7}>
          <Text style={s.scrollBtnText}>{ICON.arrow}</Text>
        </TouchableOpacity>
      )}
      <View style={s.inputBar}>
        <TextInput
          style={s.textInput}
          value={input}
          onChangeText={setInput}
          placeholder="输入灵感、剧情..."
          placeholderTextColor={T.textMuted}
          multiline
          maxLength={4000}
          editable={!loading}
        />
        <TouchableOpacity
          style={[s.sendBtn, (!input.trim() || loading) && s.sendDisabled]}
          onPress={handleSend}
          disabled={loading || !input.trim()}
          activeOpacity={0.7}
        >
          <Text style={s.sendIcon}>{ICON.arrow}</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={outlineModal} transparent animationType="fade">
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>大纲确认</Text>
            <Text style={s.modalBody} numberOfLines={8}>{pendingOutline}</Text>
            <View style={s.modalBtns}>
              <TouchableOpacity style={s.modalBtnCancel} onPress={() => setOutlineModal(false)}>
                <Text style={s.modalBtnCancelTxt}>修改</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalBtnOk} onPress={handleOutlineConfirm}>
                <Text style={s.modalBtnOkTxt}>确认写作</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <CapsuleAlert
        visible={clearConfirm}
        title="清空对话"
        message="确定清空所有对话记录？"
        danger
        confirmText="清空"
        onCancel={() => setClearConfirm(false)}
        onConfirm={async () => { await clearChatHistory(novelId); setMessages([]); setClearConfirm(false); }}
      />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: T.sp.lg, paddingTop: 50, paddingBottom: T.sp.sm, borderBottomWidth: 1, borderBottomColor: T.border },
  topBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: T.card, justifyContent: 'center', alignItems: 'center' },
  backIcon: { fontSize: 18, color: T.accent },
  clearIcon: { fontSize: 14, color: T.textMuted },
  topTitle: { fontSize: 16, fontWeight: '700', color: T.text, letterSpacing: 0.5 },
  quickBar: { flexDirection: 'row', paddingHorizontal: T.sp.lg, paddingVertical: T.sp.sm, gap: 8, borderBottomWidth: 1, borderBottomColor: T.border },
  quickBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: T.r.full, backgroundColor: T.card, borderWidth: 1, borderColor: T.border },
  quickText: { fontSize: 12, color: T.accent, fontWeight: '600' },
  list: { padding: T.sp.lg, paddingBottom: 8 },
  bubble: { marginBottom: 12, maxWidth: '88%' },
  userBub: { alignSelf: 'flex-end', backgroundColor: T.userBubble, borderRadius: T.r.lg, borderBottomRightRadius: 4, padding: 12 },
  aiBub: { alignSelf: 'flex-start', backgroundColor: T.aiBubble, borderRadius: T.r.lg, borderBottomLeftRadius: 4, padding: 12, borderWidth: 1, borderColor: T.border },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  aiAvatar: { width: 22, height: 22, borderRadius: 11, backgroundColor: T.accent + '20', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: T.accent + '40' },
  aiAvatarText: { fontSize: 11, color: T.accent, fontWeight: '800' },
  aiLabel: { fontSize: 12, color: T.accent, fontWeight: '700', letterSpacing: 0.3 },
  bubbleText: { fontSize: 15, lineHeight: 23 },
  userTxt: { color: T.text },
  aiTxt: { color: '#CCCCDD' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: T.aiBubble, borderRadius: T.r.lg, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: T.border, gap: 8 },
  loadingText: { fontSize: 13, color: T.textMuted },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: T.sp.lg, paddingVertical: T.sp.sm, paddingBottom: T.sp.lg, borderTopWidth: 1, borderTopColor: T.border, gap: 8, backgroundColor: T.surface },
  textInput: { flex: 1, backgroundColor: T.card, borderRadius: T.r.xl, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: T.text, maxHeight: 140, minHeight: 44, borderWidth: 1, borderColor: T.border, lineHeight: 20 },
  scrollBtn: { position: 'absolute', bottom: 70, right: 20, width: 36, height: 36, borderRadius: 18, backgroundColor: T.card, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: T.border, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, zIndex: 10 },
  scrollBtnText: { fontSize: 14, color: T.accent, fontWeight: '700', transform: [{ rotate: '90deg' }] },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: T.accent, justifyContent: 'center', alignItems: 'center', marginBottom: 0 },
  sendDisabled: { backgroundColor: T.border },
  sendIcon: { fontSize: 18, color: '#FFF', fontWeight: '700' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modal: { backgroundColor: T.card, borderRadius: T.r.xl, padding: 20, width: '85%', borderWidth: 1, borderColor: T.borderLight },
  modalTitle: { fontSize: 16, fontWeight: '700', color: T.text, marginBottom: 10, textAlign: 'center' },
  modalBody: { fontSize: 13, color: T.textSec, lineHeight: 20, marginBottom: 16, maxHeight: 200 },
  modalBtns: { flexDirection: 'row', gap: 10 },
  modalBtnCancel: { flex: 1, paddingVertical: 11, borderRadius: T.r.md, backgroundColor: T.surface, alignItems: 'center', borderWidth: 1, borderColor: T.border },
  modalBtnCancelTxt: { fontSize: 13, color: T.textSec },
  modalBtnOk: { flex: 1, paddingVertical: 11, borderRadius: T.r.md, backgroundColor: T.accent, alignItems: 'center' },
  modalBtnOkTxt: { fontSize: 13, fontWeight: '700', color: '#FFF' },
});
