import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, StatusBar,
} from 'react-native';
import * as Speech from 'expo-speech';
import { getChatHistory, appendChatMessage, clearChatHistory, getNovels } from '../lib/storage';
import { buildSystemPrompt, processPostWrite, addChapter, getStoryBible } from '../lib/novelMemory';
import { chatCompletion } from '../lib/llm';
import { shouldUseLocalModel, INTIMATE_SYSTEM_PROMPT } from '../lib/intimatePrompt';
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
  const [outlineMap, setOutlineMap] = useState<Record<string, string>>({});
  const [previewMap, setPreviewMap] = useState<Record<string, string>>({});
  const [showCountModal, setShowCountModal] = useState(false);
  const [chapterCountInput, setChapterCountInput] = useState('1');
  const [chatMode, setChatMode] = useState<'writing' | 'chat'>('writing');
  const [providerMap, setProviderMap] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const history = await getChatHistory(novelId);
      if (history && history.length > 0) setMessages(history);
    })();
  }, [novelId]);

  useEffect(() => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100);
  }, [messages]);

  const getNextChapterNumber = async (): Promise<number> => {
    const novels = await getNovels();
    const novel = novels.find(n => n.id === novelId);
    return (novel?.totalChapters || 0) + 1;
  };

  const buildApiMessages = async (userContent: string, systemPrompt?: string) => {
    const nextCh = await getNextChapterNumber();
    const system = systemPrompt || await buildSystemPrompt(novelId, nextCh);
    const apiMsgs: { role: 'system' | 'user' | 'assistant'; content: string }[] = [{ role: 'system', content: system }];
    const recent = messages.slice(-20);
    for (const m of recent) {
      apiMsgs.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content });
    }
    apiMsgs.push({ role: 'user', content: userContent });
    return { apiMsgs };
  };

  const sendToAI = async (text: string) => {
    try {
      const userMsg: ChatMessage = { id: uid(), role: 'user', content: text, timestamp: new Date().toISOString() };
      setMessages(prev => [...prev, userMsg]);
      await appendChatMessage(novelId, userMsg);

      const nextCh = await getNextChapterNumber();
      const sensitive = shouldUseLocalModel(text);
      let systemPrompt: string;
      if (sensitive) {
        const storyContext = chatMode === 'writing' ? await buildSystemPrompt(novelId, nextCh) : '';
        systemPrompt = `${INTIMATE_SYSTEM_PROMPT}\n\n${storyContext}\n\n请保持当前作品设定，直接继续用户要求的情节。`;
      } else if (chatMode === 'writing') {
        const basePrompt = await buildSystemPrompt(novelId, nextCh);
        systemPrompt = `${basePrompt}\n\n回复开头先输出思考过程，格式如下：\n🧠 思考中：\n- 关键判断\n- 情节安排\n\n然后输出正文。`;
      } else {
        systemPrompt = '你是一个友好的AI助手，可以自由聊天、回答问题、讨论任何话题。请用中文回复。';
      }

      const { apiMsgs } = await buildApiMessages(text, systemPrompt);
      const intent = chatMode === 'writing' ? 'writing' : 'chat';
      const res = await chatCompletion(apiMsgs, { intent, forceLocal: sensitive });

      if (res.error) {
        const errMsg: ChatMessage = { id: uid(), role: 'assistant', content: '⚠️ ' + res.error, timestamp: new Date().toISOString() };
        setMessages(prev => [...prev, errMsg]);
        await appendChatMessage(novelId, errMsg);
      } else if (res.content && res.content.trim()) {
        const aiMsg: ChatMessage = { id: uid(), role: 'assistant', content: res.content, timestamp: new Date().toISOString() };
        
        if (chatMode === 'writing') {
          const parsed = parseThinking(res.content);
          if (parsed.thinking) setThinkingMap(prev => ({ ...prev, [aiMsg.id]: parsed.thinking }));
          const chapter = parseChapter(res.content);
          if (chapter.outline) setOutlineMap(prev => ({ ...prev, [aiMsg.id]: chapter.outline }));
          if (chapter.preview) setPreviewMap(prev => ({ ...prev, [aiMsg.id]: chapter.preview }));
          try {
            let jsonStr = '';
            const jsonMatch = res.content.match(/```json\s*([\s\S]*?)```/);
            if (jsonMatch) jsonStr = jsonMatch[1].trim();
            else { const braceMatch = parseThinking(res.content).body.match(/\{[\s\S]*\}/); if (braceMatch) jsonStr = braceMatch[0]; }
            if (jsonStr) {
              jsonStr = jsonStr.replace(/，/g, ',').replace(/：/g, ':');
              const update = JSON.parse(jsonStr);
              if (update.summary || update.characterChanges) {
                const novels = await getNovels();
                const novel = novels.find(n => n.id === novelId);
                const nCh = (novel?.totalChapters || 0) + 1;
                await processPostWrite(novelId, nCh, update.summary || '', update.characterChanges || [], update.newForeshadowing || [], update.resolvedForeshadowing || []);
                if (update.summary) await addChapter(novelId, '第' + nCh + '章', parseThinking(res.content).body, update.summary);
              }
            }
          } catch {}
        }
        setProviderMap(prev => ({ ...prev, [aiMsg.id]: res.provider || '' }));
        setMessages(prev => [...prev, aiMsg]);
        await appendChatMessage(novelId, aiMsg);
      } else {
        const errMsg: ChatMessage = { id: uid(), role: 'assistant', content: '⚠️ AI 返回了空内容，请重试。', timestamp: new Date().toISOString() };
        setMessages(prev => [...prev, errMsg]);
        await appendChatMessage(novelId, errMsg);
      }
    } catch (e: any) {
      const errMsg: ChatMessage = { id: uid(), role: 'assistant', content: '⚠️ 发送失败：' + (e.message || '未知错误'), timestamp: new Date().toISOString() };
      setMessages(prev => [...prev, errMsg]);
    }
    setLoading(false);
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const text = input.trim();
    setInput('');
    setLoading(true);
    await sendToAI(text);
  };

  const handleAutoWrite = () => { setShowCountModal(true); };

  const startAutoWrite = async (count: number) => {
    setShowCountModal(false);
    if (loading) return;
    setLoading(true);
    try {
      const novel = await getStoryBible(novelId);
      const startCh = (novel?.totalChapters || 0) + 1;
      const chRange = count === 1 ? `第${startCh}章` : `第${startCh}章到第${startCh + count - 1}章`;
      const { apiMsgs } = await buildApiMessages(`根据之前的剧情，请为${chRange}各生成一个简要大纲（每章100-200字），包括：核心事件、角色发展、冲突与转折。输出格式：每章用"## 第X章 标题"开头，后面跟大纲内容。`);
      const res = await chatCompletion(apiMsgs, { intent: 'writing' });
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
      const userMsg: ChatMessage = { id: uid(), role: 'user', content: '续写下一章', timestamp: new Date().toISOString() };
      setMessages(prev => [...prev, userMsg]);
      await appendChatMessage(novelId, userMsg);

      const { apiMsgs } = await buildApiMessages('根据以下预告内容，直接开始写下一章正文（5000字左右）：\n\n' + previewText);
      const res = await chatCompletion(apiMsgs, { intent: 'writing' });

      if (!res.error && res.content) {
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
              const nCh = (novel?.totalChapters || 0) + 1;
              await processPostWrite(novelId, nCh, update.summary || '', update.characterChanges || [], update.newForeshadowing || [], update.resolvedForeshadowing || []);
              if (update.summary) await addChapter(novelId, '第' + nCh + '章', parsed.body, update.summary);
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
      display = parseThinking(item.content).body || item.content;
      display = display.replace(/```json[\s\S]*?```/g, '').trim();
    }
    return (
      <View style={[s.row, isUser ? s.rowUser : s.rowAI]}>
        <View style={[s.bubble, isUser ? s.bubbleUser : s.bubbleAI]}>
          {think ? <OutlinePanel text={think} /> : null}
          {outline ? <OutlinePanel text={outline} /> : null}
          <Text style={[s.text, isUser ? s.textUser : s.textAI]}>{display}</Text>
          {!isUser && providerMap[item.id] ? <Text style={s.providerTag}>{providerMap[item.id]}</Text> : null}
          {preview ? <PreviewPanel text={preview} onContinue={() => handleContinueFromPreview(preview)} onModify={() => {}} /> : null}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}>
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Icon.back size={20} color={T.text} />
        </TouchableOpacity>
        <View style={s.modeSwitch}>
          <TouchableOpacity style={[s.modeBtn, chatMode === 'writing' && s.modeBtnActive]} onPress={() => setChatMode('writing')}>
            <Icon.edit size={14} color={chatMode === 'writing' ? '#FFF' : T.textMuted} />
            <Text style={[s.modeBtnText, chatMode === 'writing' && s.modeBtnTextActive]}>AI写作</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.modeBtn, chatMode === 'chat' && s.modeBtnActive]} onPress={() => setChatMode('chat')}>
            <Icon.chat size={14} color={chatMode === 'chat' ? '#FFF' : T.textMuted} />
            <Text style={[s.modeBtnText, chatMode === 'chat' && s.modeBtnTextActive]}>自由对话</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={() => setClearConfirm(true)} style={s.clearBtn}>
          <Icon.trash size={18} color={T.textMuted} />
        </TouchableOpacity>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={item => item.id}
        contentContainerStyle={s.list}
        onScrollBeginDrag={() => setShowScrollBtn(false)}
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset.y;
          const h = e.nativeEvent.contentSize.height - e.nativeEvent.layoutMeasurement.height;
          setShowScrollBtn(h - y > 200);
        }}
      />

      {showScrollBtn && (
        <TouchableOpacity style={s.scrollBtn} onPress={() => flatListRef.current?.scrollToEnd({ animated: true })}>
          <Icon.down size={18} color="#FFF" />
        </TouchableOpacity>
      )}

      <View style={s.inputBar}>
        {chatMode === 'writing' && (
          <TouchableOpacity style={s.autoBtn} onPress={handleAutoWrite}>
            <Icon.auto size={18} color={T.accent} />
          </TouchableOpacity>
        )}
        <TextInput
          style={s.input}
          value={input}
          onChangeText={setInput}
          placeholder={chatMode === 'writing' ? '输入剧情或指令...' : '随便聊点什么...'}
          placeholderTextColor={T.textMuted}
          multiline
          maxLength={4000}
        />
        <TouchableOpacity style={[s.sendBtn, (!input.trim() || loading) && s.sendBtnDisabled]} onPress={handleSend} disabled={!input.trim() || loading}>
          {loading ? <ActivityIndicator size="small" color="#FFF" /> : <Icon.send size={18} color="#FFF" />}
        </TouchableOpacity>
      </View>

      {outlineModal && (
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>确认大纲</Text>
            <Text style={s.modalContent} numberOfLines={15}>{pendingOutline}</Text>
            <View style={s.modalActions}>
              <TouchableOpacity style={s.modalBtn} onPress={() => setOutlineModal(false)}>
                <Text style={s.modalBtnText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalBtn, s.modalBtnPrimary]} onPress={handleOutlineConfirm}>
                <Text style={s.modalBtnTextPrimary}>开始写作</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {showCountModal && (
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>生成章节数量</Text>
            <TextInput style={s.countInput} value={chapterCountInput} onChangeText={setChapterCountInput} keyboardType="number-pad" placeholder="输入数量" placeholderTextColor={T.textMuted} />
            <View style={s.modalActions}>
              <TouchableOpacity style={s.modalBtn} onPress={() => setShowCountModal(false)}>
                <Text style={s.modalBtnText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalBtn, s.modalBtnPrimary]} onPress={() => {
                const count = parseInt(chapterCountInput) || 1;
                startAutoWrite(Math.min(Math.max(count, 1), 50));
              }}>
                <Text style={s.modalBtnTextPrimary}>确认</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      <CapsuleAlert visible={clearConfirm} title="清空对话" message="确定要清空所有对话记录吗？此操作不可恢复。" onConfirm={async () => { await clearChatHistory(novelId); setMessages([]); setClearConfirm(false); }} onCancel={() => setClearConfirm(false)} />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: (StatusBar.currentHeight || 44), paddingBottom: 12, backgroundColor: T.surface, borderBottomWidth: 1, borderBottomColor: T.border },
  backBtn: { padding: 8 },
  clearBtn: { padding: 8 },
  modeSwitch: { flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 8 },
  modeBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, gap: 4 },
  modeBtnActive: { backgroundColor: T.accent },
  modeBtnText: { fontSize: 13, fontWeight: '600', color: T.textMuted },
  modeBtnTextActive: { color: '#FFF' },
  list: { padding: 16, paddingBottom: 8 },
  row: { marginBottom: 12 },
  rowUser: { alignItems: 'flex-end' },
  rowAI: { alignItems: 'flex-start' },
  bubble: { maxWidth: '85%', borderRadius: T.r.lg, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleUser: { backgroundColor: T.accent, borderBottomRightRadius: 4 },
  bubbleAI: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderBottomLeftRadius: 4 },
  text: { fontSize: 15, lineHeight: 22 },
  textUser: { color: '#FFF' },
  textAI: { color: T.text },
  scrollBtn: { position: 'absolute', bottom: 100, right: 20, width: 36, height: 36, borderRadius: 18, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center', elevation: 4 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingBottom: 8, paddingTop: 8, backgroundColor: T.surface, borderTopWidth: 1, borderTopColor: T.border, gap: 8 },
  autoBtn: { padding: 10, borderRadius: 20, backgroundColor: T.accent + '15' },
  input: { flex: 1, minHeight: 40, maxHeight: 120, borderRadius: T.r.lg, borderWidth: 1, borderColor: T.border, backgroundColor: T.bg, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: T.text, textAlignVertical: 'center' },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.5 },
  modalOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', zIndex: 100 },
  modalBox: { width: '85%', maxHeight: '70%', backgroundColor: T.surface, borderRadius: T.r.lg, padding: 20 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: T.text, marginBottom: 12 },
  modalContent: { fontSize: 14, color: T.textSec, lineHeight: 20, marginBottom: 16 },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalBtn: { flex: 1, paddingVertical: 10, borderRadius: T.r.sm, backgroundColor: T.bg, alignItems: 'center' },
  modalBtnPrimary: { backgroundColor: T.accent },
  modalBtnText: { fontSize: 14, fontWeight: '600', color: T.textSec },
  modalBtnTextPrimary: { fontSize: 14, fontWeight: '600', color: '#FFF' },
  countInput: { height: 44, borderRadius: T.r.sm, borderWidth: 1, borderColor: T.border, backgroundColor: T.bg, paddingHorizontal: 12, fontSize: 16, color: T.text, marginBottom: 16, textAlign: 'center' },
  providerTag: { fontSize: 10, color: T.textMuted, marginTop: 4, opacity: 0.7 },
});
