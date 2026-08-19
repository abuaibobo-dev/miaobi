import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Modal,
} from 'react-native';
import { getChatHistory, appendChatMessage, clearChatHistory, getNovels } from '../lib/storage';
import { buildSystemPrompt, processPostWrite, addChapter, getStoryBible } from '../lib/novelMemory';
import { chatCompletion } from '../lib/llm';
import { parseThinking } from '../lib/thinkingParser';
import { generateConflict, getConflictTypes } from '../lib/conflictEngine';
import { reviewChapter } from '../lib/reviewEngine';
import { expandScene } from '../lib/sceneExpander';
import { clashIdeas } from '../lib/inspirationClash';
import { analyzeEmotionCurve, detectRepetition, checkConsistency } from '../lib/qualityTools';
import CapsuleAlert from '../components/CapsuleAlert';
import { T, ICON } from '../lib/theme';
import type { ChatMessage } from '../types/novel';

function uid(): string { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }

/* ── 可折叠思考面板 ── */
function ThinkingPanel({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <View style={th.c}>
      <TouchableOpacity style={th.h} onPress={() => setOpen(!open)} activeOpacity={0.7}>
        <Text style={th.icon}>{ICON.thinking}</Text>
        <Text style={th.label}>思考过程</Text>
        <Text style={th.arrow}>{open ? '▾' : '▸'}</Text>
      </TouchableOpacity>
      {open && (
        <View style={th.body}>
          {text.split('\n').filter(Boolean).map((l, i) => (
            <Text key={i} style={th.line}>{l}</Text>
          ))}
        </View>
      )}
    </View>
  );
}
const th = StyleSheet.create({
  c: { backgroundColor: T.surface, borderRadius: T.r.md, borderWidth: 1, borderColor: T.border, marginBottom: 8, overflow: 'hidden' },
  h: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, gap: 6 },
  icon: { fontSize: 12, color: T.accent },
  label: { fontSize: 11, color: T.textMuted, flex: 1 },
  arrow: { fontSize: 10, color: T.textMuted },
  body: { paddingHorizontal: 10, paddingBottom: 8, borderTopWidth: 1, borderTopColor: T.border },
  line: { fontSize: 12, color: T.textSec, lineHeight: 18, marginTop: 4 },
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
  const [toolModal, setToolModal] = useState<'conflict' | 'review' | 'expand' | 'clash' | 'emotion' | 'repeat' | 'consistency' | null>(null);
  const [conflictChars, setConflictChars] = useState({ a: '', b: '', type: '' });
  const [toolResult, setToolResult] = useState('');
  const [toolLoading, setToolLoading] = useState(false);
  const [reviewChapterNum, setReviewChapterNum] = useState('');
  const [expandText, setExpandText] = useState('');
  const [clashKeywords, setClashKeywords] = useState('');
  const [thinkingMap, setThinkingMap] = useState<Record<string, string>>({});

  useEffect(() => { getChatHistory(novelId).then(setMessages); }, [novelId]);
  useEffect(() => { if (messages.length > 0) setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100); }, [messages]);
  // 自动触发分析工具
  useEffect(() => {
    if (toolModal === "emotion" && !toolResult && !toolLoading) handleEmotion();
    if (toolModal === "repeat" && !toolResult && !toolLoading) handleRepeat();
    if (toolModal === "consistency" && !toolResult && !toolLoading) handleConsistency();
  }, [toolModal]);

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
      // 保存章节
      let chapterSaved = false;
      try {
        let jsonStr = '';
        const jm = res.content.match(/```json\s*([\s\S]*?)```/);
        if (jm) jsonStr = jm[1].trim();
        else { const bm = body.match(/\{[\s\S]*\}/); if (bm) jsonStr = bm[0]; }
        if (jsonStr) {
          jsonStr = jsonStr.replace(/，/g, ',').replace(/：/g, ':');
          try {
            const u = JSON.parse(jsonStr);
            if (u.summary || u.characterChanges || u.newForeshadowing) {
              await processPostWrite(novelId, nextCh, u.summary || '', u.characterChanges || [], u.newForeshadowing || [], u.resolvedForeshadowing || []);
              if (u.summary) { await addChapter(novelId, `第${nextCh}章`, body, u.summary); chapterSaved = true; }
            }
          } catch {
            const sm = jsonStr.match(/"summary"\s*:\s*"([^"]+)"/);
            if (sm) { await addChapter(novelId, `第${nextCh}章`, body, sm[1]); chapterSaved = true; }
          }
        }
      } catch {}
      if (!chapterSaved && body.length > 50) {
        await addChapter(novelId, `第${nextCh}章`, body, body.slice(0, 200) + '...');
      }
    } catch {}
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

  // 矛盾冲突生成
  const handleConflict = async () => {
    if (!conflictChars.a || !conflictChars.b) return;
    setToolLoading(true);
    setToolResult('');
    const result = await generateConflict(novelId, conflictChars.a, conflictChars.b, conflictChars.type || undefined);
    setToolResult(result);
    setToolLoading(false);
  };

  // AI 审稿
  const handleReview = async () => {
    const num = parseInt(reviewChapterNum);
    if (!num) return;
    setToolLoading(true);
    setToolResult('');
    const result = await reviewChapter(novelId, num);
    if (typeof result === 'string') {
      setToolResult(result);
    } else {
      setToolResult(
        `综合评分：${result.overallScore}/100\n\n` +
        `✅ 优点：\n${result.strengths.map(s => '  • ' + s).join('\n')}\n\n` +
        `⚠️ 问题：\n${result.issues.map(s => '  • ' + s).join('\n')}\n\n` +
        `💡 建议：\n${result.suggestions.map(s => '  • ' + s).join('\n')}\n\n` +
        `📊 节奏：${result.pacingAnalysis}\n` +
        `💬 对话：${result.dialogueQuality}\n\n` +
        `${result.detailedFeedback}`
      );
    }
    setToolLoading(false);
  };

  // 场景扩写
  const handleExpand = async () => {
    if (!expandText.trim()) return;
    setToolLoading(true); setToolResult('');
    const result = await expandScene(novelId, expandText);
    setToolResult(result); setToolLoading(false);
  };

  // 灵感碰撞
  const handleClash = async () => {
    if (!clashKeywords.trim()) return;
    setToolLoading(true); setToolResult('');
    const result = await clashIdeas(clashKeywords);
    setToolResult(result); setToolLoading(false);
  };

  // 情绪曲线
  const handleEmotion = async () => {
    setToolLoading(true); setToolResult('');
    const result = await analyzeEmotionCurve(novelId);
    setToolResult(result); setToolLoading(false);
  };

  // 重复检测
  const handleRepeat = async () => {
    setToolLoading(true); setToolResult('');
    const result = await detectRepetition(novelId);
    setToolResult(result); setToolLoading(false);
  };

  // 一致性检查
  const handleConsistency = async () => {
    setToolLoading(true); setToolResult('');
    const result = await checkConsistency(novelId);
    setToolResult(result); setToolLoading(false);
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
        {!isUser && <Text style={s.aiLabel}>{ICON.write} 妙笔</Text>}
        {!isUser && <ThinkingPanel text={think} />}
        <Text style={[s.bubbleText, isUser ? s.userTxt : s.aiTxt]}>{display}</Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Top bar */}
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.topBtn}>
          <Text style={s.backIcon}>{ICON.back}</Text>
        </TouchableOpacity>
        <Text style={s.topTitle}>AI 写作</Text>
        <TouchableOpacity onPress={() => setClearConfirm(true)} style={s.topBtn}>
          <Text style={s.clearIcon}>{ICON.delete}</Text>
        </TouchableOpacity>
      </View>

      {/* Quick actions */}
      <View style={s.quickBar}>
        <TouchableOpacity style={s.quickBtn} onPress={handleAutoWrite} disabled={loading}>
          <Text style={s.quickText}>⚡ 续写</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.quickBtn} onPress={() => setInput('请帮我写新一章')} disabled={loading}>
          <Text style={s.quickText}>✎ 新章</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.quickBtn} onPress={() => setToolModal('conflict')} disabled={loading}>
          <Text style={s.quickText}>🔥 冲突</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.quickBtn} onPress={() => setToolModal('review')} disabled={loading}>
          <Text style={s.quickText}>📋 审稿</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.quickBtn} onPress={() => setToolModal('expand')} disabled={loading}>
          <Text style={s.quickText}>📐 扩写</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.quickBtn} onPress={() => setToolModal('clash')} disabled={loading}>
          <Text style={s.quickText}>🎲 灵感</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.quickBtn} onPress={() => setToolModal('emotion')} disabled={loading}>
          <Text style={s.quickText}>📈 情绪</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.quickBtn} onPress={() => setToolModal('repeat')} disabled={loading}>
          <Text style={s.quickText}>🔍 重复</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.quickBtn} onPress={() => setToolModal('consistency')} disabled={loading}>
          <Text style={s.quickText}>🎯 一致</Text>
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={renderMessage}
        contentContainerStyle={s.list}
        ListFooterComponent={loading ? (
          <View style={s.loadingRow}>
            <ActivityIndicator color={T.accent} size="small" />
            <Text style={s.loadingText}>思考中...</Text>
          </View>
        ) : null}
      />

      {/* Input */}
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

      {/* 冲突生成弹窗 */}
      <Modal visible={toolModal === 'conflict'} transparent animationType="fade">
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>🔥 矛盾冲突引擎</Text>
            <Text style={{ fontSize: 12, color: T.textMuted, marginBottom: 10 }}>选择两个角色，生成一场冲突场景</Text>
            <Text style={{ fontSize: 12, color: T.textSec, marginBottom: 4 }}>角色 A</Text>
            <TextInput style={s.modalInput} value={conflictChars.a} onChangeText={v => setConflictChars(p => ({ ...p, a: v }))} placeholder="第一个角色名" placeholderTextColor={T.textMuted} />
            <Text style={{ fontSize: 12, color: T.textSec, marginBottom: 4, marginTop: 8 }}>角色 B</Text>
            <TextInput style={s.modalInput} value={conflictChars.b} onChangeText={v => setConflictChars(p => ({ ...p, b: v }))} placeholder="第二个角色名" placeholderTextColor={T.textMuted} />
            <Text style={{ fontSize: 12, color: T.textSec, marginBottom: 4, marginTop: 8 }}>冲突类型（可选）</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {getConflictTypes().map(ct => (
                <TouchableOpacity key={ct.key} style={[s.typeChip, conflictChars.type === ct.key && s.typeChipActive]} onPress={() => setConflictChars(p => ({ ...p, type: p.type === ct.key ? '' : ct.key }))}>
                  <Text style={[s.typeChipTxt, conflictChars.type === ct.key && s.typeChipTxtActive]}>{ct.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {toolResult ? <Text style={s.modalResult}>{toolResult}</Text> : null}
            {toolLoading ? <ActivityIndicator color={T.accent} style={{ marginVertical: 12 }} /> : null}
            <View style={s.modalBtns}>
              <TouchableOpacity style={s.modalBtnCancel} onPress={() => { setToolModal(null); setToolResult(''); setConflictChars({ a: '', b: '', type: '' }); }}>
                <Text style={s.modalBtnCancelTxt}>关闭</Text>
              </TouchableOpacity>
              {!toolResult && !toolLoading ? (
                <TouchableOpacity style={s.modalBtnOk} onPress={handleConflict}>
                  <Text style={s.modalBtnOkTxt}>生成</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>

      {/* AI 审稿弹窗 */}
      <Modal visible={toolModal === 'review'} transparent animationType="fade">
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>📋 AI 审稿</Text>
            <Text style={{ fontSize: 12, color: T.textMuted, marginBottom: 10 }}>输入要审查的章节号</Text>
            <TextInput style={s.modalInput} value={reviewChapterNum} onChangeText={setReviewChapterNum} placeholder="如：1" placeholderTextColor={T.textMuted} keyboardType="numeric" />
            {toolResult ? <Text style={s.modalResult}>{toolResult}</Text> : null}
            {toolLoading ? <ActivityIndicator color={T.accent} style={{ marginVertical: 12 }} /> : null}
            <View style={s.modalBtns}>
              <TouchableOpacity style={s.modalBtnCancel} onPress={() => { setToolModal(null); setToolResult(''); setReviewChapterNum(''); }}>
                <Text style={s.modalBtnCancelTxt}>关闭</Text>
              </TouchableOpacity>
              {!toolResult && !toolLoading ? (
                <TouchableOpacity style={s.modalBtnOk} onPress={handleReview}>
                  <Text style={s.modalBtnOkTxt}>审查</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>

      {/* 场景扩写 */}
      <Modal visible={toolModal === 'expand'} transparent animationType="fade">
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>📐 场景扩写</Text>
            <Text style={{ fontSize: 12, color: T.textMuted, marginBottom: 10 }}>输入场景骨架，AI 扩写成完整描写</Text>
            <TextInput style={[s.modalInput, { minHeight: 80 }]} value={expandText} onChangeText={setExpandText} placeholder="如：阿强在雨夜走进小卖部，看到春桃在等他..." placeholderTextColor={T.textMuted} multiline />
            {toolResult ? <Text style={s.modalResult}>{toolResult}</Text> : null}
            {toolLoading ? <ActivityIndicator color={T.accent} style={{ marginVertical: 12 }} /> : null}
            <View style={s.modalBtns}>
              <TouchableOpacity style={s.modalBtnCancel} onPress={() => { setToolModal(null); setToolResult(''); setExpandText(''); }}>
                <Text style={s.modalBtnCancelTxt}>关闭</Text>
              </TouchableOpacity>
              {!toolResult && !toolLoading ? (
                <TouchableOpacity style={s.modalBtnOk} onPress={handleExpand}>
                  <Text style={s.modalBtnOkTxt}>扩写</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>

      {/* 灵感碰撞 */}
      <Modal visible={toolModal === 'clash'} transparent animationType="fade">
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>🎲 灵感碰撞</Text>
            <Text style={{ fontSize: 12, color: T.textMuted, marginBottom: 10 }}>输入关键词，生成5个创意方向</Text>
            <TextInput style={s.modalInput} value={clashKeywords} onChangeText={setClashKeywords} placeholder="如：背叛、复仇、雨夜" placeholderTextColor={T.textMuted} />
            {toolResult ? <Text style={s.modalResult}>{toolResult}</Text> : null}
            {toolLoading ? <ActivityIndicator color={T.accent} style={{ marginVertical: 12 }} /> : null}
            <View style={s.modalBtns}>
              <TouchableOpacity style={s.modalBtnCancel} onPress={() => { setToolModal(null); setToolResult(''); setClashKeywords(''); }}>
                <Text style={s.modalBtnCancelTxt}>关闭</Text>
              </TouchableOpacity>
              {!toolResult && !toolLoading ? (
                <TouchableOpacity style={s.modalBtnOk} onPress={handleClash}>
                  <Text style={s.modalBtnOkTxt}>碰撞</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>

      {/* 情绪曲线 / 重复检测 / 一致性检查 —— 一键触发 */}
      <Modal visible={toolModal === 'emotion' || toolModal === 'repeat' || toolModal === 'consistency'} transparent animationType="fade">
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>{toolModal === 'emotion' ? '📈 情绪曲线' : toolModal === 'repeat' ? '🔍 重复检测' : '🎯 一致性检查'}</Text>
            {toolLoading && !toolResult ? <ActivityIndicator color={T.accent} style={{ marginVertical: 20 }} /> : null}
            {toolResult ? <Text style={s.modalResult}>{toolResult}</Text> : null}
            <View style={s.modalBtns}>
              <TouchableOpacity style={s.modalBtnCancel} onPress={() => { setToolModal(null); setToolResult(''); }}>
                <Text style={s.modalBtnCancelTxt}>关闭</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Outline modal */}
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
  aiLabel: { fontSize: 11, color: T.accent, marginBottom: 6, fontWeight: '700', letterSpacing: 0.5 },
  bubbleText: { fontSize: 15, lineHeight: 23 },
  userTxt: { color: T.text },
  aiTxt: { color: '#CCCCDD' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: T.aiBubble, borderRadius: T.r.lg, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: T.border, gap: 8 },
  loadingText: { fontSize: 13, color: T.textMuted },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', padding: T.sp.md, borderTopWidth: 1, borderTopColor: T.border, gap: 8, backgroundColor: T.surface },
  textInput: { flex: 1, backgroundColor: T.card, borderRadius: T.r.xl, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: T.text, maxHeight: 120, borderWidth: 1, borderColor: T.border },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: T.accent, justifyContent: 'center', alignItems: 'center' },
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
  modalInput: { backgroundColor: T.surface, borderRadius: T.r.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: T.text, borderWidth: 1, borderColor: T.border, marginBottom: 4 },
  modalResult: { fontSize: 12, color: T.textSec, lineHeight: 18, maxHeight: 250, backgroundColor: T.surface, borderRadius: T.r.sm, padding: 10, marginTop: 8, borderWidth: 1, borderColor: T.border },
  typeChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: T.r.full, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border },
  typeChipActive: { backgroundColor: T.accent, borderColor: T.accent },
  typeChipTxt: { fontSize: 11, color: T.textSec },
  typeChipTxtActive: { color: '#FFF', fontWeight: '600' },
});
