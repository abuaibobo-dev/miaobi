import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, StatusBar,
} from 'react-native';
import { getChatHistory, appendChatMessage, clearChatHistory, getNovels } from '../lib/storage';
import { buildSystemPrompt, processPostWrite, addChapter } from '../lib/novelMemory';
import { streamChatCompletion, chatCompletion, getActiveModelInfo, type LLMMessage } from '../lib/llm';
import { shouldUseLocalModel, INTIMATE_SYSTEM_PROMPT } from '../lib/intimatePrompt';
import { parseThinking } from '../lib/thinkingParser';
import CapsuleAlert from '../components/CapsuleAlert';
import { T } from '../lib/theme';
import { Icon } from '../lib/icons';
import type { ChatMessage } from '../types/novel';

type ChatMode = 'writing' | 'chat';

function uid(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function parseChapter(content: string) {
  const outlineMatch = content.match(/【本章大纲】\s*\n([\s\S]*?)(?=\n【|\n\n|$)/);
  const previewMatch = content.match(/【下一章预告】\s*\n([\s\S]*?)(?=\n```json|$)/i);
  let body = content;
  if (outlineMatch) body = body.slice(body.indexOf(outlineMatch[0]) + outlineMatch[0].length);
  if (previewMatch) body = body.slice(0, body.indexOf(previewMatch[0]));
  return {
    outline: outlineMatch?.[1]?.trim() || '',
    preview: previewMatch?.[1]?.trim() || '',
    body: body.replace(/```json[\s\S]*?```/g, '').trim(),
  };
}

function Panel({ title, text, icon, muted }: { title: string; text: string; icon: React.ReactNode; muted?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <View style={[panel.card, muted && panel.mutedCard]}>
      <TouchableOpacity style={panel.header} onPress={() => setOpen(!open)} activeOpacity={0.7}>
        {icon}
        <Text style={[panel.label, muted && panel.mutedLabel]} numberOfLines={1}>{title}</Text>
        <Icon.down size={13} color={T.textMuted} />
      </TouchableOpacity>
      {open && (
        <View style={panel.body}>
          <Text style={panel.text}>{text}</Text>
        </View>
      )}
    </View>
  );
}

function PreviewPanel({ text, onContinue }: { text: string; onContinue: () => void }) {
  const [open, setOpen] = useState(true);
  if (!text) return null;
  return (
    <View style={[panel.card, panel.previewCard]}>
      <TouchableOpacity style={panel.header} onPress={() => setOpen(!open)} activeOpacity={0.7}>
        <Icon.preview size={13} color={T.text} />
        <Text style={panel.label}>下一章预告</Text>
        <Icon.up size={13} color={T.textMuted} />
      </TouchableOpacity>
      {open && (
        <View style={panel.body}>
          <Text style={panel.text}>{text}</Text>
          <TouchableOpacity style={panel.button} onPress={onContinue} activeOpacity={0.8}>
            <Text style={panel.buttonText}>续写下一章</Text>
            <Icon.continueWrite size={12} color="#0D0D0D" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const panel = StyleSheet.create({
  card: { marginTop: 10, borderRadius: 14, borderWidth: 1, borderColor: '#2E2E2E', backgroundColor: '#181818', overflow: 'hidden' },
  mutedCard: { borderColor: '#262626', backgroundColor: '#161616' },
  previewCard: { borderColor: '#3A3A3A' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 10 },
  label: { flex: 1, fontSize: 12, fontWeight: '700', color: T.text },
  mutedLabel: { color: T.textSec },
  body: { borderTopWidth: 1, borderTopColor: '#262626', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12 },
  text: { fontSize: 13, lineHeight: 20, color: '#C9C9C9' },
  button: { flexDirection: 'row', alignSelf: 'flex-end', alignItems: 'center', gap: 5, marginTop: 10, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: T.accent },
  buttonText: { fontSize: 12, fontWeight: '700', color: '#0D0D0D' },
});

type Props = any;

export default function ChatScreen({ navigation, route }: Props) {
  const mode: ChatMode = route.params?.mode === 'chat' ? 'chat' : 'writing';
  const novelId: string = route.params.novelId;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [modelLabel, setModelLabel] = useState('检测模型...');
  const [streamThinking, setStreamThinking] = useState('');
  const [outlineModal, setOutlineModal] = useState(false);
  const [pendingOutline, setPendingOutline] = useState('');
  const [showCountModal, setShowCountModal] = useState(false);
  const [chapterCountInput, setChapterCountInput] = useState('1');
  const [clearConfirm, setClearConfirm] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const abortRef = useRef<AbortController | null>(null);
  const rawContentRef = useRef('');
  const reasoningRef = useRef('');
  const nearBottomRef = useRef(true);

  const refreshModel = useCallback(async () => {
    const info = await getActiveModelInfo(mode);
    setModelLabel(info ? (info.provider === 'local' ? `本地 · ${info.label}` : `云端 · ${info.label}`) : '未连接');
  }, [mode]);

  useEffect(() => {
    getChatHistory(novelId).then(history => setMessages(history));
    refreshModel();
  }, [novelId, refreshModel]);

  useEffect(() => {
    if (!nearBottomRef.current) return;
    const timer = setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(timer);
  }, [messages, streamThinking]);

  const scrollOnScroll = (event: any) => {
    const { y, contentSize, layoutMeasurement } = event.nativeEvent;
    const distance = contentSize.height - layoutMeasurement.height - y;
    nearBottomRef.current = distance < 80;
    setShowScrollButton(distance > 240);
  };

  const getNextChapterNumber = async () => {
    const novels = await getNovels();
    return (novels.find(item => item.id === novelId)?.totalChapters || 0) + 1;
  };

  const buildApiMessages = async (userContent: string, systemPrompt?: string): Promise<LLMMessage[]> => {
    const nextChapter = await getNextChapterNumber();
    const system = systemPrompt || await buildSystemPrompt(novelId, nextChapter);
    const recent: LLMMessage[] = messages.slice(-12).map(message => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content,
    }));
    return [{ role: 'system' as const, content: system }, ...recent, { role: 'user' as const, content: userContent }];
  };

  const runStreaming = async (apiMessages: any[], sensitive: boolean) => {
    const assistantId = uid();
    const placeholder: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
    };
    rawContentRef.current = '';
    reasoningRef.current = '';
    setStreamThinking('');
    setMessages(previous => [...previous, placeholder]);
    setLoading(true);
    nearBottomRef.current = true;

    const controller = new AbortController();
    abortRef.current = controller;
    let activeProvider = '';

    try {
      const response = await streamChatCompletion(apiMessages, {
        intent: mode,
        forceLocal: sensitive,
        signal: controller.signal,
        onProvider: provider => {
          activeProvider = provider;
          setModelLabel(provider);
          setMessages(previous => previous.map(item => item.id === assistantId ? { ...item, provider } : item));
        },
        onThinking: delta => {
          reasoningRef.current += delta;
          setStreamThinking(reasoningRef.current);
        },
        onContent: delta => {
          rawContentRef.current += delta;
          const current = parseThinking(rawContentRef.current);
          setMessages(previous => previous.map(item => item.id === assistantId ? { ...item, content: current.body || '' } : item));
          if (current.thinking) setStreamThinking(current.thinking);
        },
      });

      const raw = rawContentRef.current || response.content || '';
      const parsed = parseThinking(raw);
      const thinking = [reasoningRef.current, parsed.thinking, response.thinking].filter(Boolean).join('\n').trim();
      const body = parsed.body.trim();
      const provider = response.provider || activeProvider;

      if (!body && !thinking) {
        const errorMessage = response.error || '模型没有返回内容，请重试。';
        setMessages(previous => previous.map(item => item.id === assistantId ? {
          ...item,
          content: `⚠️ ${errorMessage}`,
          provider,
        } : item));
        return null;
      }

      const finalMessage: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: body || thinking,
        timestamp: new Date().toISOString(),
        provider,
      };
      setMessages(previous => previous.map(item => item.id === assistantId ? finalMessage : item));
      return { id: assistantId, body, thinking, provider, message: finalMessage };
    } catch (error) {
      const message = `⚠️ ${(error as Error).message}`;
      setMessages(previous => previous.map(item => item.id === assistantId ? { ...item, content: message } : item));
      return null;
    } finally {
      abortRef.current = null;
      setLoading(false);
      setStreamThinking('');
      refreshModel();
    }
  };

  const sendToAI = async (text: string) => {
    const cleanText = text.trim();
    if (!cleanText || loading) return;
    const userMessage: ChatMessage = { id: uid(), role: 'user', content: cleanText, timestamp: new Date().toISOString() };
    setMessages(previous => [...previous, userMessage]);
    await appendChatMessage(novelId, userMessage);

    const sensitive = shouldUseLocalModel(cleanText);
    const nextChapter = await getNextChapterNumber();
    let systemPrompt: string;

    if (sensitive) {
      const storyContext = mode === 'writing' ? await buildSystemPrompt(novelId, nextChapter) : '';
      systemPrompt = `${INTIMATE_SYSTEM_PROMPT}\n\n${storyContext}\n\n先用 2 到 4 行输出“🧠 思考中：”，再空一行进入正文。`;
    } else if (mode === 'writing') {
      const basePrompt = await buildSystemPrompt(novelId, nextChapter);
      systemPrompt = `${basePrompt}\n\n回复开头先用 3 到 5 行说明本章关键判断，格式为“🧠 思考中：”。随后空一行输出正文。`;
    } else {
      systemPrompt = '你是妙笔的中文创作助手。回答准确、自然、简洁；复杂问题先用 1 到 3 行“🧠 思考中：”说明思路，再给出答案。';
    }

    const apiMessages = await buildApiMessages(cleanText, systemPrompt);
    const result = await runStreaming(apiMessages, sensitive);
    if (!result) return;

    if (!result.body) {
      await appendChatMessage(novelId, result.message);
      return;
    }

    result.message.content = result.body;
    await appendChatMessage(novelId, result.message);

    if (mode !== 'writing') return;
    const chapter = parseChapter(result.body);
    try {
      const jsonMatch = result.body.match(/```json\s*([\s\S]*?)```/) || result.body.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const normalized = jsonMatch[0].replace(/^```json\s*|```$/g, '').replace(/，/g, ',').replace(/：/g, ':');
        const update = JSON.parse(normalized);
        const novels = await getNovels();
        const chapterNumber = (novels.find(item => item.id === novelId)?.totalChapters || 0) + 1;
        if (update.summary || update.characterChanges) {
          await processPostWrite(
            novelId,
            chapterNumber,
            update.summary || chapter.outline,
            update.characterChanges || [],
            update.newForeshadowing || [],
            update.resolvedForeshadowing || [],
          );
        }
      }
    } catch {}
  };

  const handleSubmit = () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    sendToAI(text);
  };

  const generateOutline = async () => {
    if (loading) return;
    setShowCountModal(false);
    setLoading(true);
    try {
      const novels = await getNovels();
      const totalChapters = novels.find(item => item.id === novelId)?.totalChapters || 0;
      const count = Math.min(Math.max(parseInt(chapterCountInput, 10) || 1, 1), 50);
      const prompt = `从第 ${totalChapters + 1} 章开始，连续生成 ${count} 个章节大纲。每章包含：标题、核心事件、角色变化、冲突转折、下一章钩子。不要重复旧剧情，不要输出正文。`;
      const apiMessages = await buildApiMessages(prompt);
      const response = await chatCompletion(apiMessages, { intent: 'writing' });
      if (response.error) throw new Error(response.error);
      setPendingOutline(response.content.trim() || '大纲为空，请重试。');
      setOutlineModal(true);
    } catch (error) {
      setPendingOutline(`生成失败：${(error as Error).message}`);
      setOutlineModal(true);
    } finally {
      setLoading(false);
    }
  };

  const confirmOutline = async () => {
    setOutlineModal(false);
    await sendToAI(`请严格按照以下大纲写作完整章节，每章约 5000 字：\n\n${pendingOutline}`);
    setPendingOutline('');
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    const parsed = isUser ? { body: item.content, thinking: '' } : parseThinking(item.content);
    const chapter = !isUser && mode === 'writing' ? parseChapter(parsed.body) : { outline: '', preview: '', body: parsed.body };
    const display = chapter.body || parsed.body;
    const isLoadingPlaceholder = !isUser && loading && item.id === messages[messages.length - 1]?.id;

    return (
      <View style={[styles.row, isUser ? styles.userRow : styles.aiRow]}>
        <View style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}>
          {!isUser && parsed.thinking ? <Panel title="思考过程" text={parsed.thinking} icon={<Icon.thinking size={13} color={T.textSec} />} muted /> : null}
          {isLoadingPlaceholder ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#F5F5F5" />
              <Text style={styles.loadingText}>{streamThinking ? '正在思考...' : '正在生成...'}</Text>
            </View>
          ) : null}
          {!isUser && streamThinking && isLoadingPlaceholder ? <Panel title="实时思考" text={streamThinking} icon={<Icon.thinking size={13} color={T.textSec} />} muted /> : null}
          {display ? <Text style={[styles.messageText, isUser && styles.userText]}>{display}</Text> : null}
          {chapter.outline ? <Panel title="本章大纲" text={chapter.outline} icon={<Icon.outline size={13} color={T.textSec} />} /> : null}
          {chapter.preview ? <PreviewPanel text={chapter.preview} onContinue={() => sendToAI(`根据以下预告继续下一章：\n\n${chapter.preview}`)} /> : null}
          {!isUser && item.provider ? <Text style={styles.modelTag}>{item.provider}</Text> : null}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="light-content" backgroundColor="#0D0D0D" />
      <View style={styles.topBar}>
        <View style={styles.topRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
            <Icon.back size={19} color={T.text} />
          </TouchableOpacity>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>{mode === 'writing' ? 'AI 写作' : '自由对话'}</Text>
            <Text style={styles.model} numberOfLines={1}>{modelLabel}</Text>
          </View>
          <TouchableOpacity onPress={() => setClearConfirm(true)} style={styles.iconButton}>
            <Icon.delete size={17} color={T.textSec} />
          </TouchableOpacity>
        </View>
        <View style={styles.switchBar}>
          <TouchableOpacity
            style={[styles.switchOption, mode === 'writing' && styles.switchActive]}
            onPress={() => navigation.replace('WritingChat', { novelId })}
          >
            <Icon.write size={14} color={mode === 'writing' ? '#0D0D0D' : T.textSec} />
            <Text style={[styles.switchText, mode === 'writing' && styles.switchTextActive]}>AI 写作</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.switchOption, mode === 'chat' && styles.switchActive]}
            onPress={() => navigation.replace('FreeChat', { novelId })}
          >
            <Icon.chat size={14} color={mode === 'chat' ? '#0D0D0D' : T.textSec} />
            <Text style={[styles.switchText, mode === 'chat' && styles.switchTextActive]}>自由对话</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.list}
        onScroll={scrollOnScroll}
        scrollEventThrottle={32}
        ListEmptyComponent={(
          <View style={styles.empty}>
            <Icon.chat size={42} color="#333" />
            <Text style={styles.emptyTitle}>{mode === 'writing' ? '开始你的故事' : '开始自由对话'}</Text>
            <Text style={styles.emptySubtitle}>{mode === 'writing' ? '描述剧情、修改章节或一键生成大纲' : '讨论灵感、设定和创作问题'}</Text>
          </View>
        )}
      />

      {showScrollButton && (
        <TouchableOpacity style={styles.scrollButton} onPress={() => flatListRef.current?.scrollToEnd({ animated: true })}>
          <Icon.down size={18} color="#0D0D0D" />
        </TouchableOpacity>
      )}

      <View style={styles.inputBar}>
        {mode === 'writing' && (
          <TouchableOpacity style={styles.toolButton} onPress={() => setShowCountModal(true)}>
            <Icon.auto size={18} color={T.text} />
          </TouchableOpacity>
        )}
        {loading ? (
          <TouchableOpacity style={[styles.sendButton, styles.stopButton]} onPress={() => abortRef.current?.abort()}>
            <Icon.close size={17} color="#F5F5F5" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.sendButton, !input.trim() && styles.disabledButton]} onPress={handleSubmit} disabled={!input.trim()}>
            <Icon.send size={17} color="#0D0D0D" />
          </TouchableOpacity>
        )}
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder={mode === 'writing' ? '输入剧情指令...' : '随便聊点什么...'}
          placeholderTextColor="#666"
          multiline
          textAlignVertical="top"
        />
      </View>

      <CapsuleAlert visible={outlineModal} title="章节大纲" message={pendingOutline} confirmText="开始写作" onCancel={() => setOutlineModal(false)} onConfirm={confirmOutline} />
      <CapsuleAlert visible={clearConfirm} title="清空对话" message="将删除本书的全部聊天记录。" danger confirmText="清空" onCancel={() => setClearConfirm(false)} onConfirm={async () => { await clearChatHistory(novelId); setMessages([]); setClearConfirm(false); }} />

      <CapsuleAlert visible={showCountModal} title="连续大纲章数" message="建议一次生成 5–10 章，小模型更稳定。" cancelText="取消" confirmText="生成" onCancel={() => setShowCountModal(false)} onConfirm={generateOutline}>
        <TextInput
          value={chapterCountInput}
          onChangeText={setChapterCountInput}
          keyboardType="number-pad"
          style={styles.countInput}
        />
      </CapsuleAlert>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  topBar: { paddingTop: (StatusBar.currentHeight || 44), backgroundColor: T.surface, borderBottomWidth: 1, borderBottomColor: '#242424' },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingBottom: 10 },
  iconButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#2A2A2A', alignItems: 'center', justifyContent: 'center' },
  titleBlock: { flex: 1, minWidth: 0 },
  title: { fontSize: 17, fontWeight: '800', color: T.text },
  model: { marginTop: 1, fontSize: 11, color: T.textMuted },
  switchBar: { flexDirection: 'row', gap: 8, marginHorizontal: 14, marginBottom: 12, backgroundColor: '#111', borderRadius: 999, padding: 4, borderWidth: 1, borderColor: '#242424' },
  switchOption: { flex: 1, height: 34, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  switchActive: { backgroundColor: T.accent },
  switchText: { fontSize: 13, fontWeight: '700', color: T.textSec },
  switchTextActive: { color: '#0D0D0D' },
  list: { padding: 16, paddingBottom: 28, flexGrow: 1 },
  row: { marginBottom: 14 },
  userRow: { alignItems: 'flex-end' },
  aiRow: { alignItems: 'stretch' },
  bubble: { maxWidth: '92%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 12, overflow: 'hidden' },
  userBubble: { maxWidth: '84%', backgroundColor: T.userBubble, borderBottomRightRadius: 6 },
  aiBubble: { width: '100%', backgroundColor: T.aiBubble, borderWidth: 1, borderColor: '#262626', borderBottomLeftRadius: 6 },
  messageText: { fontSize: 15, lineHeight: 24, color: T.text },
  userText: { color: '#0D0D0D' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loadingText: { fontSize: 12, color: T.textMuted },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: T.text },
  emptySubtitle: { textAlign: 'center', fontSize: 13, lineHeight: 20, color: T.textMuted },
  scrollButton: { position: 'absolute', right: 18, bottom: 96, width: 38, height: 38, borderRadius: 19, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center' },
  inputBar: { flexDirection: 'row-reverse', alignItems: 'flex-end', gap: 8, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 14, backgroundColor: T.surface, borderTopWidth: 1, borderTopColor: '#242424' },
  input: { flex: 1, minHeight: 44, maxHeight: 160, borderRadius: 22, borderWidth: 1, borderColor: '#2E2E2E', backgroundColor: '#151515', paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, lineHeight: 21, color: T.text },
  toolButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#2E2E2E', alignItems: 'center', justifyContent: 'center' },
  sendButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center' },
  stopButton: { backgroundColor: '#333', borderColor: '#444', borderWidth: 1 },
  disabledButton: { backgroundColor: '#2A2A2A' },
  modelTag: { marginTop: 8, fontSize: 10, color: '#666' },
  countInput: { height: 42, marginTop: 12, borderRadius: 14, borderWidth: 1, borderColor: '#333', backgroundColor: '#111', color: '#F5F5F5', textAlign: 'center', fontSize: 15 },
});
