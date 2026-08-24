import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
  KeyboardAvoidingView, Platform, Image, StatusBar,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { getChatHistory, appendChatMessage, clearChatHistory } from '../lib/storage';
import { streamChatCompletion, getActiveModelInfo, detectIntent, warmUpLocalModel, type LLMMessage } from '../lib/llm';
import { shouldUseLocalModel, INTIMATE_SYSTEM_PROMPT } from '../lib/intimatePrompt';
import { parseThinking } from '../lib/thinkingParser';
import CapsuleAlert from '../components/CapsuleAlert';
import { GenerationDots, StreamCursor, ThinkingPanel } from '../components/ChatIndicators';
import ModelPicker from '../components/ModelPicker';
import { getModelChoices, type ModelChoice } from '../lib/llm';
import { T } from '../lib/theme';
import { Icon } from '../lib/icons';
import type { ChatMessage } from '../types/novel';

type Props = any;

function uid(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function extractImageMarkdown(content: string) {
  const match = content.match(/!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/i);
  if (!match) return { imageUrl: '', body: content };
  return { imageUrl: match[1], body: content.replace(match[0], '').trim() };
}

export default function FreeChatScreen({ navigation, route }: Props) {
  const channel: string = route.params?.novelId ? `free:${route.params.novelId}` : 'free:global';
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [inputHeight, setInputHeight] = useState(52);
  const [modelChoice, setModelChoice] = useState<ModelChoice | null>(null);
  const [modelOptions, setModelOptions] = useState<ModelChoice[]>([{ id: 'auto', label: '智能优先', provider: 'local' }]);
  const [loading, setLoading] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [modelLabel, setModelLabel] = useState('检测模型...');
  const [streamThinking, setStreamThinking] = useState('');
  const [attachments, setAttachments] = useState<Array<{ uri: string; base64: string }>>([]);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const abortRef = useRef<AbortController | null>(null);
  const rawContentRef = useRef('');
  const reasoningRef = useRef('');
  const nearBottomRef = useRef(true);
  const userScrollingRef = useRef(false);

  const requestOverrides = () => modelChoice && modelChoice.id !== 'auto' ? {
    providerOverride: modelChoice.provider,
    ...(modelChoice.model ? { modelOverride: modelChoice.model } : {}),
  } : {};

  const pickImage = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'image/*', multiple: false, copyToCacheDirectory: true });
      const asset = result.assets?.[0];
      if (result.canceled || !asset) return;
      const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      setAttachments([{ uri: asset.uri, base64 }]);
    } catch {
      setModelLabel('图片读取失败');
    }
  };

  const refreshModel = useCallback(async () => {
    const selectedChoice = modelChoice;
    const options = await getModelChoices('chat');
    setModelOptions(options);
    if (selectedChoice) {
      setModelLabel(selectedChoice.label);
      return;
    }
    const info = await getActiveModelInfo('chat');
    setModelLabel(info ? (info.provider === 'local' ? `本地 · ${info.label}` : `云端 · ${info.label}`) : '未连接');
    if (info?.provider === 'local') {
      const target = info.label;
      setModelLabel(`本地 · ${target} · 预热中`);
      const warmed = await warmUpLocalModel('chat', target);
      setModelLabel(`本地 · ${target}${warmed ? ' · 已就绪' : ''}`);
    }
  }, [modelChoice]);

  useEffect(() => {
    if (!loading) return;
    setElapsedSeconds(0);
    const startedAt = Date.now();
    const timer = setInterval(() => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [loading]);


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
    setMessages(prev => [...prev, userMessage, {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      provider: '等待模型...',
    }]);
    setInput('');
    setAttachments([]);
    await appendChatMessage(channel, userMessage);

    rawContentRef.current = '';
    reasoningRef.current = '';
    setStreamThinking('');
    setLoading(true);
    setElapsedSeconds(0);
    nearBottomRef.current = true;

    const controller = new AbortController();
    abortRef.current = controller;
    let provider = '';
    try {
      const intent = detectIntent(cleanText, attachments.length > 0);
      const sensitive = intent === 'adult' || shouldUseLocalModel(cleanText);
      const history: LLMMessage[] = messages.slice(-4).map(item => ({
        role: item.role === 'assistant' ? 'assistant' : 'user',
        content: item.content.slice(0, 360),
      }));
      const system = sensitive
        ? `${INTIMATE_SYSTEM_PROMPT}\n\n直接输出正文；亲密画面使用淡出处理。`
        : '你是妙笔自由对话助手。给出准确、自然、简洁的中文答案。';
      const response = await streamChatCompletion(
        [{ role: 'system', content: system }, ...history, { role: 'user', content: cleanText }],
        {
          intent,
          forceLocal: false,
          images: attachments.map(item => item.base64),          ...requestOverrides(),
          signal: controller.signal,
          onProvider: value => {
            provider = value;
            setModelLabel(value);
            setMessages(previous => previous.map(item => (
              item.id === assistantId ? { ...item, provider: value } : item
            )));
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
      if (!body && !parsed.thinking && !reasoningRef.current) {
        const detail = [response.error || '模型没有返回内容', response.debug].filter(Boolean).join('；');
        throw new Error(detail);
      }

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
    const rendered = !isUser ? extractImageMarkdown(parsed.body) : { imageUrl: '', body: item.content };
    const isLoading = !isUser && loading && item.id === messages[messages.length - 1]?.id;
    return (
      <View style={[styles.row, isUser ? styles.userRow : styles.aiRow]}>
        <View style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}>
          {isLoading && <GenerationDots label={streamThinking ? '正在思考' : `正在回复 · ${elapsedSeconds}s`} />}
          {!isUser && (isLoading ? streamThinking : parsed.thinking) ? (
            <ThinkingPanel text={isLoading ? streamThinking : parsed.thinking} streaming={isLoading} />
          ) : null}
          {rendered.imageUrl ? <Image source={{ uri: rendered.imageUrl }} style={styles.generatedImage} resizeMode="cover" /> : null}
          {rendered.body ? <Text style={[styles.messageText, isUser && styles.userText]}>{rendered.body}</Text> : isLoading ? <StreamCursor /> : null}
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
        {attachments.length > 0 && (
          <View style={styles.attachmentRow}>
            {attachments.map((item, index) => (
              <View key={`${item.uri}-${index}`} style={styles.attachment}>
                <Image source={{ uri: item.uri }} style={styles.attachmentThumb} />
                <TouchableOpacity style={styles.attachmentRemove} onPress={() => setAttachments([])}>
                  <Icon.close size={10} color="#0D0D0D" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
        <View style={styles.inputRow}>
          <View style={styles.inputShell}>
            <TextInput
              style={[styles.input, { height: Math.min(150, Math.max(46, inputHeight)) }]}
              value={input}
              onChangeText={setInput}
              onContentSizeChange={event => setInputHeight(Math.ceil(event.nativeEvent.contentSize.height))}
              placeholder="随便聊点什么..."
              placeholderTextColor="#666"
              multiline
              textAlignVertical="top"
            />
            <View style={styles.inputFooter}>
              <View style={styles.actionGroup}>
                <TouchableOpacity style={styles.modelPill} onPress={() => setShowModelPicker(true)} disabled={loading} activeOpacity={0.8}>
                  <Icon.test size={9} color={T.textMuted} />
                  <Text style={styles.modelPillText} numberOfLines={1}>{modelChoice?.label || modelOptions[0]?.label || '智能优先'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.imageButton} onPress={pickImage} activeOpacity={0.8}>
                  <Icon.image size={13} color={T.textSec} />
                </TouchableOpacity>
              </View>
              {loading ? (
                <TouchableOpacity style={[styles.sendButton, styles.stopButton]} onPress={() => abortRef.current?.abort()} activeOpacity={0.8}>
                  <Icon.close size={15} color="#F5F5F5" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={[styles.sendButton, !input.trim() && styles.disabledButton]} onPress={send} disabled={!input.trim()} activeOpacity={0.8}>
                  <Icon.send size={15} color="#0D0D0D" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </View>

      <ModelPicker
        visible={showModelPicker}
        selectedId={modelChoice?.id ?? 'auto'}
        onClose={() => setShowModelPicker(false)}
        onSelect={(option) => {
          setModelChoice(option);
          setModelLabel(option.label);
          setShowModelPicker(false);
          if (option.model) void warmUpLocalModel('chat', option.model);
        }}
      />

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
  generatedImage: { width: '100%', aspectRatio: 0.72, borderRadius: 14, marginBottom: 10, backgroundColor: '#222' },
  userText: { color: '#0D0D0D' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loadingText: { fontSize: 12, color: T.textMuted },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: T.text },
  emptySubtitle: { textAlign: 'center', fontSize: 13, lineHeight: 20, color: T.textMuted },
  scrollButton: { position: 'absolute', right: 18, bottom: 96, width: 38, height: 38, borderRadius: 19, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center' },
  inputBar: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12, backgroundColor: T.surface, borderTopWidth: 1, borderTopColor: '#242424' },
  inputRow: { flexDirection: 'column' },
  inputShell: { borderRadius: 24, borderWidth: 1, borderColor: '#2E2E2E', backgroundColor: '#151515', overflow: 'hidden' },
  inputFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 38, paddingHorizontal: 10, paddingBottom: 8 },
  actionGroup: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  imageButton: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#333' },
  attachmentRow: { flexDirection: 'row', gap: 8, paddingBottom: 8 },
  attachment: { position: 'relative' },
  attachmentThumb: { width: 46, height: 46, borderRadius: 12 },
  attachmentRemove: { position: 'absolute', top: -5, right: -5, width: 18, height: 18, borderRadius: 9, backgroundColor: '#D4D4D4', alignItems: 'center', justifyContent: 'center' },
  modelPill: { flexDirection: 'row', alignItems: 'center', gap: 3, maxWidth: '100%', height: 22, paddingHorizontal: 7, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.06)' },
  modelPillText: { fontSize: 9, fontWeight: '600', color: T.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  input: { width: '100%', minHeight: 46, maxHeight: 150, borderRadius: 0, borderWidth: 0, backgroundColor: 'transparent', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, fontSize: 15, lineHeight: 22, color: T.text },
  sendButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center' },
  stopButton: { backgroundColor: '#333', borderColor: '#444', borderWidth: 1 },
  disabledButton: { backgroundColor: '#2A2A2A' },
  modelTag: { marginTop: 8, fontSize: 10, color: '#666' },
});
