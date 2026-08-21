import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, StatusBar,
} from 'react-native';
import { getChatHistory, appendChatMessage, clearChatHistory } from '../lib/storage';
import { streamChatCompletion, getActiveModelInfo, type LLMMessage } from '../lib/llm';
import { shouldUseLocalModel, INTIMATE_SYSTEM_PROMPT } from '../lib/intimatePrompt';
import { parseThinking } from '../lib/thinkingParser';
import CapsuleAlert from '../components/CapsuleAlert';
import { T } from '../lib/theme';
import { Icon } from '../lib/icons';
import type { ChatMessage } from '../types/novel';

type Props = any;

function uid(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function Panel({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <View style={panel.card}>
      <TouchableOpacity style={panel.header} onPress={() => setOpen(!open)} activeOpacity={0.7}>
        <Icon.thinking size={13} color={T.textSec} />
        <Text style={panel.label}>思考过程</Text>
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

const panel = StyleSheet.create({
  card: { marginTop: 8, borderRadius: 14, borderWidth: 1, borderColor: '#2E2E2E', backgroundColor: '#181818', overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 10 },
  label: { flex: 1, fontSize: 12, fontWeight: '700', color: T.text },
  body: { borderTopWidth: 1, borderTopColor: '#262626', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12 },
  text: { fontSize: 13, lineHeight: 20, color: '#C9C9C9' },
});

export default function FreeChatScreen({ navigation, route }: Props) {
  const channel: string = route.params?.novelId ? `free:${route.params.novelId}` : 'free:global';
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [inputHeight, setInputHeight] = useState(52);
  const [loading, setLoading] = useState(false);
  const [modelLabel, setModelLabel] = useState('检测模型...');
  const [streamThinking, setStreamThinking] = useState('');
  const [clearConfirm, setClearConfirm] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const abortRef = useRef<AbortController | null>(null);
  const rawContentRef = useRef('');
  const reasoningRef = useRef('');
  const nearBottomRef = useRef(true);
  const userScrollingRef = useRef(false);

  const refreshModel = useCallback(async () => {
    const info = await getActiveModelInfo('chat');
    setModelLabel(info ? (info.provider === 'local' ? `本地 · ${info.label}` : `云端 · ${info.label}`) : '未连接');
  }, []);

  useEffect(() => {
    getChatHistory(channel).then(setMessages);
    refreshModel();
  }, [channel, refreshModel]);

  useEffect(() => {
    if (!nearBottomRef.current || userScrollingRef.current) return;
    const timer = setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(timer);
  }, [messages, streamThinking]);

  const measureScroll = (event: any) => {
    const { y, contentSize, layoutMeasurement } = event.nativeEvent;
    const distance = contentSize.height - layoutMeasurement.height - y;
    nearBottomRef.current = distance < 80;
    setShowScrollButton(distance > 24);
  };

  const jumpToLatest = () => {
    userScrollingRef.current = false;
    nearBottomRef.current = true;
    setShowScrollButton(false);
    requestAnimationFrame(() => flatListRef.current?.scrollToEnd({ animated: true }));
  };

  const send = async () => {
    const cleanText = input.trim();
    if (!cleanText || loading) return;
    const userMessage: ChatMessage = { id: uid(), role: 'user', content: cleanText, timestamp: new Date().toISOString() };
    const assistantId = uid();
    setMessages(prev => [...prev, userMessage, { id: assistantId, role: 'assistant', content: '', timestamp: new Date().toISOString() }]);
    setInput('');
    await appendChatMessage(channel, userMessage);

    rawContentRef.current = '';
    reasoningRef.current = '';
    setStreamThinking('');
    setLoading(true);
    nearBottomRef.current = true;

    const controller = new AbortController();
    abortRef.current = controller;
    let provider = '';
    try {
      const sensitive = shouldUseLocalModel(cleanText);
      const history: LLMMessage[] = messages.slice(-16).map(item => ({
        role: item.role === 'assistant' ? 'assistant' : 'user',
        content: item.content,
      }));
      const system = sensitive
        ? `${INTIMATE_SYSTEM_PROMPT}\n\n直接输出正文，不要输出思考过程。`
        : '你是妙笔自由对话助手。回答准确、自然、简洁；不要输出思考过程，直接给出答案。';
      const response = await streamChatCompletion(
        [{ role: 'system', content: system }, ...history, { role: 'user', content: cleanText }],
        {
          intent: 'chat',
          forceLocal: sensitive,
          signal: controller.signal,
          onProvider: value => {
            provider = value;
            setModelLabel(value);
          },
          onThinking: delta => {
            reasoningRef.current += delta;
            setStreamThinking(reasoningRef.current);
          },
          onContent: delta => {
            rawContentRef.current += delta;
            const parsed = parseThinking(rawContentRef.current);
            setMessages(prev => prev.map(item => item.id === assistantId ? { ...item, content: parsed.body || '' } : item));
            if (parsed.thinking) setStreamThinking(parsed.thinking);
          },
        }
      );

      const parsed = parseThinking(rawContentRef.current || response.content || '');
      const body = parsed.body.trim();
      const finalProvider = response.provider || provider;
      if (!body && !parsed.thinking && !reasoningRef.current) throw new Error(response.error || '模型没有返回内容');

      const finalMessage: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: body || parsed.thinking || reasoningRef.current,
        timestamp: new Date().toISOString(),
        provider: finalProvider,
      };
      setMessages(prev => prev.map(item => item.id === assistantId ? finalMessage : item));
      await appendChatMessage(channel, finalMessage);
    } catch (error) {
      const message: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: `⚠️ ${(error as Error).message}`,
        timestamp: new Date().toISOString(),
        provider,
      };
      setMessages(prev => prev.map(item => item.id === assistantId ? message : item));
      await appendChatMessage(channel, message);
    } finally {
      abortRef.current = null;
      setLoading(false);
      setStreamThinking('');
      refreshModel();
    }
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    const parsed = isUser ? { body: item.content, thinking: '' } : parseThinking(item.content);
    const isLoading = !isUser && loading && item.id === messages[messages.length - 1]?.id;
    return (
      <View style={[styles.row, isUser ? styles.userRow : styles.aiRow]}>
        <View style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}>
          {!isUser && parsed.thinking ? <Panel text={parsed.thinking} /> : null}
          {isLoading && (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#F5F5F5" />
              <Text style={styles.loadingText}>{streamThinking ? '正在思考...' : '正在回复...'}</Text>
            </View>
          )}
          {isLoading && streamThinking ? <Panel text={streamThinking} /> : null}
          {parsed.body ? <Text style={[styles.messageText, isUser && styles.userText]}>{parsed.body}</Text> : null}
          {!isUser && item.provider ? <Text style={styles.modelTag}>{item.provider}</Text> : null}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
      <StatusBar barStyle="light-content" backgroundColor="#0D0D0D" />
      <View style={styles.topBar}>
        <View style={styles.topRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
            <Icon.back size={19} color={T.text} />
          </TouchableOpacity>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>自由对话</Text>
            <Text style={styles.model} numberOfLines={1}>{modelLabel}</Text>
          </View>
          <TouchableOpacity onPress={() => setClearConfirm(true)} style={styles.iconButton}>
            <Icon.delete size={17} color={T.textSec} />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.list}
        onScroll={measureScroll}
        onScrollBeginDrag={() => { userScrollingRef.current = true; }}
        onScrollEndDrag={measureScroll}
        onMomentumScrollEnd={event => { userScrollingRef.current = false; measureScroll(event); }}
        scrollToOverflowEnabled
        scrollEventThrottle={16}
        ListEmptyComponent={(
          <View style={styles.empty}>
            <Icon.chat size={42} color="#333" />
            <Text style={styles.emptyTitle}>开始自由对话</Text>
            <Text style={styles.emptySubtitle}>这里不调用章节工具，适合灵感讨论和日常问答。</Text>
          </View>
        )}
      />

      {showScrollButton && (
        <TouchableOpacity style={styles.scrollButton} onPress={jumpToLatest} activeOpacity={0.8}>
          <Icon.down size={18} color="#0D0D0D" />
        </TouchableOpacity>
      )}

      <View style={styles.inputBar}>
        {loading ? (
          <TouchableOpacity style={[styles.sendButton, styles.stopButton]} onPress={() => abortRef.current?.abort()}>
            <Icon.close size={17} color="#F5F5F5" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.sendButton, !input.trim() && styles.disabledButton]} onPress={send} disabled={!input.trim()}>
            <Icon.send size={17} color="#0D0D0D" />
          </TouchableOpacity>
        )}
        <TextInput
          style={[styles.input, { height: Math.min(180, Math.max(52, inputHeight)) }]}
          value={input}
          onChangeText={setInput}
          onContentSizeChange={event => setInputHeight(Math.ceil(event.nativeEvent.contentSize.height))}
          placeholder="随便聊点什么..."
          placeholderTextColor="#666"
          multiline
          textAlignVertical="top"
        />
      </View>

      <CapsuleAlert visible={clearConfirm} title="清空对话" message="将删除这个自由对话频道的记录。" danger confirmText="清空" onCancel={() => setClearConfirm(false)} onConfirm={async () => { await clearChatHistory(channel); setMessages([]); setClearConfirm(false); }} />
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
  input: { flex: 1, minHeight: 52, maxHeight: 180, borderRadius: 24, borderWidth: 1, borderColor: '#2E2E2E', backgroundColor: '#151515', paddingHorizontal: 18, paddingVertical: 14, fontSize: 15, lineHeight: 22, color: T.text },
  sendButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center' },
  stopButton: { backgroundColor: '#333', borderColor: '#444', borderWidth: 1 },
  disabledButton: { backgroundColor: '#2A2A2A' },
  modelTag: { marginTop: 8, fontSize: 10, color: '#666' },
});
