import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Modal,
} from 'react-native';
import * as Speech from 'expo-speech';
import { getChatHistory, appendChatMessage, clearChatHistory, getNovels } from '../lib/storage';
import { buildSystemPrompt, processPostWrite, addChapter, getStoryBible } from '../lib/novelMemory';
import { chatCompletion } from '../lib/llm';
import { parseThinking } from '../lib/thinkingParser';
import CapsuleAlert from '../components/CapsuleAlert';
import { T } from '../lib/theme';
import { Icon } from '../lib/icons';
import type { ChatMessage } from '../types/novel';

function uid(): string { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }

function parseChapter(content: string): { outline: string; body: string; preview: string } {
  let outline = '', body = '', preview = '';
  const outlineMatch = content.match(/【本章大纲】\s*\n([\s\S]*?)(?=\n【|\n\n|$)/);
  if (outlineMatch) outline = outlineMatch[1].trim();
  const previewMatch = content.match(/【下一章预告】\s*\n([\s\S]*?)(?=\n```json|$)/);
  if (previewMatch) preview = previewMatch[1].trim();
  let bodyText = content;
  if (outlineMatch) bodyText = bodyText.slice(bodyText.indexOf(outlineMatch[0]) + outlineMatch[0].length);
  if (previewMatch) bodyText = bodyText.slice(0, bodyText.indexOf(previewMatch[0]));
  body = bodyText.replace(/```json[\s\S]*?```/g, '').trim();
  return { outline, body, preview };
}

function OutlinePanel({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <View style={p.card}>
      <TouchableOpacity style={p.header} onPress={() => setOpen(!open)} activeOpacity={0.7}>
        <Icon.outline size={14} color={T.accent} />
        <Text style={p.label}>本章大纲</Text>
        {open ? <Icon.up size={14} color={T.textMuted} /> : <Icon.down size={14} color={T.textMuted} />}
      </TouchableOpacity>
      {open && <View style={p.body}><Text style={p.text}>{text}</Text></View>}
    </View>
  );
}

function PreviewPanel({ text, onContinue, onModify }: { text: string; onContinue: () => void; onModify: () => void }) {
  const [open, setOpen] = useState(true);
  if (!text) return null;
  return (
    <View style={[p.card, { borderColor: T.accentOrange + '30', backgroundColor: T.accentOrange + '06' }]}>
      <TouchableOpacity style={p.header} onPress={() => setOpen(!open)} activeOpacity={0.7}>
        <Icon.preview size={14} color={T.accentOrange} />
        <Text style={[p.label, { color: T.accentOrange }]}>下一章预告</Text>
        {open ? <Icon.up size={14} color={T.textMuted} /> : <Icon.down size={14} color={T.textMuted} />}
      </TouchableOpacity>
      {open && (
        <View style={p.body}>
          <Text style={p.text}>{text}</Text>
          <View style={p.actions}>
            <TouchableOpacity style={p.btn} onPress={onModify}>
              <Icon.modify size={12} color={T.textSec} />
              <Text style={p.btnText}>修改预告</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[p.btn, p.btnPrimary]} onPress={onContinue}>
              <Text style={p.btnPrimaryText}>续写</Text>
              <Icon.continueWrite size={12} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const p = StyleSheet.create({
  card: { borderRadius: T.r.md, borderWidth: 1, borderColor: T.accent + '20', backgroundColor: T.accent + '06', marginBottom: 8, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 6 },
  label: { fontSize: 12, fontWeight: '600', color: T.accent, flex: 1 },
  body: { paddingHorizontal: 12, paddingBottom: 10, borderTopWidth: 1, borderTopColor: T.border },
  text: { fontSize: 13, color: T.textSec, lineHeight: 20, marginTop: 8 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btn: { flexDirection: 'row', flex: 1, paddingVertical: 8, borderRadius: T.r.sm, backgroundColor: T.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: T.border },
  btnText: { fontSize: 12, color: T.textSec, fontWeight: '600' },
  btnPrimary: { backgroundColor: T.accent, borderWidth: 0 },
  btnPrimaryText: { fontSize: 12, color: '#FFF', fontWeight: '700' },
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
  const isNearBottomRef = useRef(true);
  const [chapterCount, setChapterCount] = useState(1);
  const [showCountModal, setShowCountModal] = useState(false);
  const [outlineMap, setOutlineMap] = useState<Record<string, string>>({});
  const [previewMap, setPreviewMap] = useState<Record<string, string>>({});

  useEffect(() => { getChatHistory(novelId).then(setMessages); }, [novelId]);
  const scrollToBottom = (force = false) => {
    if (force || isNearBottomRef.current) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 50);
    }
  };
  useEffect(() => { if (messages.length > 0) scrollToBottom(true); }, [messages]);

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
      const { apiMsgs } = await buildApiMessages(userText);
      const res = await chatCompletion(apiMsgs);
      if (res.error) { setLoading(false); return; }
      const { thinking } = parseThinking(res.content);
      const aiMsg: ChatMessage = { id: uid(), role: 'assistant', content: res.content, timestamp: new Date().toISOString() };
      if (thinking) setThinkingMap(prev => ({ ...prev, [aiMsg.id]: thinking }));
      const chapter = parseChapter(res.content);
      if (chapter.outline) setOutlineMap(prev => ({ ...prev, [aiMsg.id]: chapter.outline }));
      if (chapter.preview) setPreviewMap(prev => ({ ...prev, [aiMsg.id]: chapter.preview }));
      setMessages(prev => [...prev, aiMsg]);
      await appendChatMessage(novelId, aiMsg);
      try {
        let jsonStr = '';
        const jsonMatch = res.content.match(/```json\s*([\s\S]*?)```/);
        if (jsonMatch) jsonStr = jsonMatch[1].trim();
        else { const braceMatch = parseThinking(res.content).body.match(/\{[\s\S]*\}/); if (braceMatch) jsonStr = braceMatch[0]; }
        if (jsonStr) {
          jsonStr = jsonStr.replace(/，/g, ',').replace(/：/g, ':');
          try {
            const update = JSON.parse(jsonStr);
            if (update.summary || update.characterChanges) {
              const novels = await getNovels();
              const novel = novels.find(n => n.id === novelId);
              const nextCh = (novel?.totalChapters || 0) + 1;
              await processPostWrite(novelId, nextCh, update.summary || '', update.characterChanges || [], update.newForeshadowing || [], update.resolvedForeshadowing || []);
              if (update.summary) await addChapter(novelId, '第' + nextCh + '章', parseThinking(res.content).body, update.summary);
            }
          } catch {}
        }
      } catch {}
    } catch {}
    setLoading(false);
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const userMsg: ChatMessage = { id: uid(), role: 'user', content: input.trim(), timestamp: new Date().toISOString() };
    const text = input.trim();
    setInput('');
    setMessages(prev => [...prev, userMsg]);
    await appendChatMessage(novelId, userMsg);
    setLoading(true);
    await sendToAI(text);
  };

  const handleAutoWrite = () => { setShowCountModal(true); };

  const startAutoWrite = async (count: number) => {
    setShowCountModal(false);
    if (loading) return;
    setChapterCount(count);
    setLoading(true);
    const novel = await getStoryBible(novelId);
    const startCh = (novel?.totalChapters || 0) + 1;
    try {
      const chRange = count === 1 ? `第${startCh}章` : `第${startCh}章到第${startCh + count - 1}章`;
      const { apiMsgs } = await buildApiMessages(`根据之前的剧情，请为${chRange}各生成一个简要大纲（每章100-200字），包括：核心事件、角色发展、冲突与转折。输出格式：每章用"## 第X章 标题"开头，后面跟大纲内容。`);
      const res = await chatCompletion(apiMsgs);
      if (!res.error) { setPendingOutline(res.content); setOutlineModal(true); }
    } catch {}
    setLoading(false);
  };

  const handleOutlineConfirm = async () => {
    setOutlineModal(false);
    setLoading(true);
    const userMsg: ChatMessage = { id: uid(), role: 'user', content: `请按照以下大纲写出完整章节（每章5000字左右）：\n\n${pendingOutline}`, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    await appendChatMessage(novelId, userMsg);
    await sendToAI(userMsg.content);
    setPendingOutline('');
  };

  const handleContinueFromPreview = async (previewText: string) => {
    if (loading) return;
    setLoading(true);
    try {
      const { apiMsgs } = await buildApiMessages('根据以下预告内容，直接开始写下一章正文（5000字左右）：\n\n' + previewText);
      const res = await chatCompletion(apiMsgs);
      if (!res.error) {
        const userMsg: ChatMessage = { id: uid(), role: 'user', content: '续写下一章', timestamp: new Date().toISOString() };
        setMessages(prev => [...prev, userMsg]);
        await appendChatMessage(novelId, userMsg);
        const parsed = parseThinking(res.content);
        const aiMsg: ChatMessage = { id: uid(), role: 'assistant', content: res.content, timestamp: new Date().toISOString() };
        if (parsed.thinking) setThinkingMap(prev => ({ ...prev, [aiMsg.id]: parsed.thinking }));
        const chapter = parseChapter(res.content);
        if (chapter.outline) setOutlineMap(prev => ({ ...prev, [aiMsg.id]: chapter.outline }));
        if (chapter.preview) setPreviewMap(prev => ({ ...prev, [aiMsg.id]: chapter.preview }));
        setMessages(prev => [...prev, aiMsg]);
        await appendChatMessage(novelId, aiMsg);
        try {
          let jsonStr = '';
          const jsonMatch = res.content.match(/```json\s*([\s\S]*?)```/);
          if (jsonMatch) jsonStr = jsonMatch[1].trim();
          else { const braceMatch = parsed.body.match(/\{[\s\S]*\}/); if (braceMatch) jsonStr = braceMatch[0]; }
          if (jsonStr) {
            jsonStr = jsonStr.replace(/，/g, ',').replace(/：/g, ':');
            const update = JSON.parse(jsonStr);
            if (update.summary || update.characterChanges) {
              const novels = await getNovels();
              const novel = novels.find(n => n.id === novelId);
              const nextCh = (novel?.totalChapters || 0) + 1;
              await processPostWrite(novelId, nextCh, update.summary || '', update.characterChanges || [], update.newForeshadowing || [], update.resolvedForeshadowing || []);
              if (update.summary) await addChapter(novelId, '第' + nextCh + '章', parsed.body, update.summary);
            }
          }
        } catch {}
      }
    } catch {}
    setLoading(false);
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    const think = thinkingMap[item.id] || '';
    const outline = outlineMap[item.id] || '';
    const preview = previewMap[item.id] || '';
    let display = item.content;
    if (!isUser) {
      display = parseThinking(item.content).body.replace(/```json[\s\S]*?```/g, '').trim();
      display = display.replace(/【本章大纲】[\s\S]*?(?=\n\n|$)/, '').trim();
      display = display.replace(/【下一章预告】[\s\S]*$/, '').trim();
    }
    return (
      <View style={[s.bubble, isUser ? s.userBub : s.aiBub]}>
        {!isUser && (
          <View style={s.aiHeader}>
            <View style={s.aiAvatar}><Icon.logo size={12} color={T.accent} /></View>
            <Text style={s.aiLabel}>妙笔</Text>
            <TouchableOpacity onPress={() => Speech.speak(display, { language: 'zh-CN' })} style={s.ttsBtn}>
              <Icon.tts size={12} color={T.textMuted} />
            </TouchableOpacity>
          </View>
        )}
        {!isUser && think ? <OutlinePanel text={think} /> : null}
        {!isUser && outline ? <OutlinePanel text={outline} /> : null}
        <Text style={[s.bubbleText, isUser ? s.userTxt : s.aiTxt]}>{display}</Text>
        {!isUser && preview ? (
          <PreviewPanel text={preview} onContinue={() => handleContinueFromPreview(preview)} onModify={() => setInput('请修改预告方向：' + preview)} />
        ) : null}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={s.container} behavior="padding" keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}>
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.topBtn}>
          <Icon.back size={20} color={T.accent} />
        </TouchableOpacity>
        <Text style={s.topTitle}>AI 写作</Text>
        <TouchableOpacity onPress={() => setClearConfirm(true)} style={s.topBtn}>
          <Icon.delete size={16} color={T.textMuted} />
        </TouchableOpacity>
      </View>

      <View style={s.quickBar}>
        <TouchableOpacity style={s.quickBtn} onPress={handleAutoWrite} disabled={loading}>
          <Icon.autoWrite size={14} color={T.accent} />
          <Text style={s.quickText}>续写</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.quickBtn} onPress={() => setInput('请帮我写新一章')} disabled={loading}>
          <Icon.newChapter size={14} color={T.accent} />
          <Text style={s.quickText}>新章</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={renderMessage}
        contentContainerStyle={s.list}
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          const isNearBottom = contentSize.height - layoutMeasurement.height - contentOffset.y < 100;
          isNearBottomRef.current = isNearBottom;
          setShowScrollBtn(!isNearBottom);
        }}
        onContentSizeChange={() => { if (isNearBottomRef.current) scrollToBottom(false); }}
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
          <Icon.down size={16} color={T.accent} />
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
          <Icon.send size={18} color="#FFF" />
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

      <Modal visible={showCountModal} transparent animationType="fade">
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>续写几章？</Text>
            <Text style={s.countHint}>输入要续写的章节数量</Text>
            <View style={s.countInputRow}>
              <Text style={s.countInputLabel}>章节数量</Text>
              <TextInput
                style={s.countInput}
                value={String(chapterCount)}
                onChangeText={(t) => { const n = parseInt(t) || 1; setChapterCount(Math.min(Math.max(n, 1), 50)); }}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="1"
                placeholderTextColor={T.textMuted}
              />
              <Text style={s.countInputHint}>（1-50）</Text>
            </View>
            <View style={s.modalBtns}>
              <TouchableOpacity style={s.modalBtnCancel} onPress={() => setShowCountModal(false)}>
                <Text style={s.modalBtnCancelTxt}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalBtnOk} onPress={() => startAutoWrite(chapterCount)}>
                <Text style={s.modalBtnOkTxt}>开始续写</Text>
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
  topBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: T.card, justifyContent: 'center', alignItems: 'center' },
  topTitle: { fontSize: 16, fontWeight: '700', color: T.text },
  quickBar: { flexDirection: 'row', paddingHorizontal: T.sp.lg, paddingVertical: T.sp.sm, gap: 8, borderBottomWidth: 1, borderBottomColor: T.border },
  quickBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 7, borderRadius: T.r.full, backgroundColor: T.card, borderWidth: 1, borderColor: T.border },
  quickText: { fontSize: 12, color: T.accent, fontWeight: '600' },
  list: { padding: T.sp.lg, paddingBottom: 8 },
  bubble: { marginBottom: 12, maxWidth: '88%' },
  userBub: { alignSelf: 'flex-end', backgroundColor: T.userBubble, borderRadius: T.r.lg, borderBottomRightRadius: 4, padding: 12 },
  aiBub: { alignSelf: 'flex-start', backgroundColor: T.aiBubble, borderRadius: T.r.lg, borderBottomLeftRadius: 4, padding: 12, borderWidth: 1, borderColor: T.border },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  aiAvatar: { width: 24, height: 24, borderRadius: 8, backgroundColor: T.accent + '18', justifyContent: 'center', alignItems: 'center' },
  aiLabel: { fontSize: 12, fontWeight: '700', color: T.accent, flex: 1 },
  ttsBtn: { width: 28, height: 28, borderRadius: 10, backgroundColor: T.surface, justifyContent: 'center', alignItems: 'center' },
  bubbleText: { fontSize: 15, lineHeight: 23 },
  userTxt: { color: T.text },
  aiTxt: { color: '#CCCCDD' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: T.aiBubble, borderRadius: T.r.lg, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: T.border, gap: 8 },
  loadingText: { fontSize: 13, color: T.textMuted },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: T.sp.lg, paddingVertical: T.sp.sm, paddingBottom: T.sp.lg, borderTopWidth: 1, borderTopColor: T.border, gap: 8, backgroundColor: T.surface },
  textInput: { flex: 1, backgroundColor: T.card, borderRadius: T.r.xl, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: T.text, maxHeight: 140, minHeight: 44, borderWidth: 1, borderColor: T.border, lineHeight: 20 },
  scrollBtn: { position: 'absolute', bottom: 70, right: 20, width: 36, height: 36, borderRadius: 12, backgroundColor: T.card, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: T.border, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, zIndex: 10 },
  sendBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: T.accent, justifyContent: 'center', alignItems: 'center' },
  sendDisabled: { backgroundColor: T.border },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modal: { backgroundColor: T.card, borderRadius: T.r.xl, padding: 20, width: '85%', borderWidth: 1, borderColor: T.borderLight },
  modalTitle: { fontSize: 17, fontWeight: '700', color: T.text, marginBottom: 4, textAlign: 'center' },
  modalBody: { fontSize: 13, color: T.textSec, lineHeight: 20, marginBottom: 16, maxHeight: 200 },
  modalBtns: { flexDirection: 'row', gap: 10 },
  modalBtnCancel: { flex: 1, paddingVertical: 12, borderRadius: T.r.md, backgroundColor: T.surface, alignItems: 'center', borderWidth: 1, borderColor: T.border },
  modalBtnCancelTxt: { fontSize: 14, color: T.textSec },
  modalBtnOk: { flex: 1, paddingVertical: 12, borderRadius: T.r.md, backgroundColor: T.accent, alignItems: 'center' },
  modalBtnOkTxt: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  countHint: { fontSize: 13, color: T.textMuted, textAlign: 'center', marginBottom: 16 },
  countInputRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 20 },
  countInputLabel: { fontSize: 14, color: T.textSec, fontWeight: '600' },
  countInput: { width: 60, height: 44, borderRadius: T.r.md, backgroundColor: T.surface, borderWidth: 1, borderColor: T.accent, textAlign: 'center', fontSize: 20, fontWeight: '700', color: T.accent },
  countInputHint: { fontSize: 12, color: T.textMuted },
});
