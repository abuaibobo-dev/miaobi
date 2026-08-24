import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
  KeyboardAvoidingView, Platform, Image, StatusBar,
} from 'react-native';
import { getChatHistory, appendChatMessage, clearChatHistory, getNovels } from '../lib/storage';
import { buildSystemPrompt, processPostWrite, addChapter } from '../lib/novelMemory';
import { streamChatCompletion, chatCompletion, getActiveModelInfo, detectIntent, type LLMMessage } from '../lib/llm';
import { shouldUseLocalModel, INTIMATE_SYSTEM_PROMPT } from '../lib/intimatePrompt';
import { parseThinking } from '../lib/thinkingParser';
import CapsuleAlert from '../components/CapsuleAlert';
import { getModelChoices, type ModelChoice } from '../lib/llm';
import { GenerationDots, StreamCursor, ThinkingPanel } from '../components/ChatIndicators';
import ModelPicker from '../components/ModelPicker';
import { T } from '../lib/theme';
import { Icon } from '../lib/icons';
import type { ChatMessage } from '../types/novel';

type ChatMode = 'writing' | 'chat';

function extractImageMarkdown(content: string) {
  const match = content.match(/!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/i);
  if (!match) return { imageUrl: '', body: content };
  return { imageUrl: match[1], body: content.replace(match[0], '').trim() };
}

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

export default function WritingChatScreen({ navigation, route }: Props) {
  const mode: ChatMode = 'writing';
  const novelId: string = route.params.novelId;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [inputHeight, setInputHeight] = useState(52);
  const [modelChoice, setModelChoice] = useState<ModelChoice | null>(null);
  const [modelOptions, setModelOptions] = useState<ModelChoice[]>([{ id: 'auto', label: '智能优先', provider: 'local' }]);
  const [loading, setLoading] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [modelLabel, setModelLabel] = useState('检测模型...');
  const [streamThinking, setStreamThinking] = useState('');
  const [outlineModal, setOutlineModal] = useState(false);
  const [pendingOutline, setPendingOutline] = useState('');
  const [showCountModal, setShowCountModal] = useState(false);
  const [chapterCountInput, setChapterCountInput] = useState('1');
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

  const refreshModel = useCallback(async () => {
    const options = await getModelChoices('writing');
    setModelOptions(options);
    if (modelChoice) {
      setModelLabel(modelChoice.label);
      return;
    }
    const info = await getActiveModelInfo(mode);
    setModelLabel(info ? (info.provider === 'local' ? `本地 · ${info.label}` : `云端 · ${info.label}`) : '未连接');
  }, [mode, modelChoice]);

  useEffect(() => {
    if (!loading) return;
    setElapsedSeconds(0);
    const startedAt = Date.now();
    const timer = setInterval(() => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [loading]);


  useEffect(() => {
    getChatHistory(novelId).then(history => setMessages(history));
    refreshModel();
  }, [novelId, refreshModel]);

  useEffect(() => {
    if (!nearBottomRef.current || userScrollingRef.current) return;
    const timer = setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 60);
    return () => clearTimeout(timer);
  }, [messages, streamThinking]);

  const measureScroll = (event: any) => {
    const { y, contentSize, layoutMeasurement } = event.nativeEvent;
    const distance = contentSize.height - layoutMeasurement.height - y;
    nearBottomRef.current = distance < 80;
    setShowScrollButton(distance > 24);
  };

  const scrollOnScroll = (event: any) => {
    measureScroll(event);
  };

  const jumpToLatest = () => {
    userScrollingRef.current = false;
    nearBottomRef.current = true;
    setShowScrollButton(false);
    requestAnimationFrame(() => flatListRef.current?.scrollToEnd({ animated: true }));
  };

  const getNextChapterNumber = async () => {
    const novels = await getNovels();
    return (novels.find(item => item.id === novelId)?.totalChapters || 0) + 1;
  };

  const buildApiMessages = async (userContent: string, systemPrompt?: string): Promise<LLMMessage[]> => {
    const nextChapter = await getNextChapterNumber();
    const system = systemPrompt || await buildSystemPrompt(novelId, nextChapter);
    const recent: LLMMessage[] = messages.slice(-8).map(message => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content.slice(0, 900),
    }));
    return [{ role: 'system' as const, content: system }, ...recent, { role: 'user' as const, content: userContent }];
  };

  const runStreaming = async (apiMessages: any[], sensitive: boolean, intent: ReturnType<typeof detectIntent> = 'writing') => {
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
    setElapsedSeconds(0);
    nearBottomRef.current = true;

    const controller = new AbortController();
    abortRef.current = controller;
    let activeProvider = '';

    try {
      const response = await streamChatCompletion(apiMessages, {
        intent,
        forceLocal: false,
        ...requestOverrides(),
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
        const errorMessage = [response.error || '模型没有返回内容，请重试。', response.debug].filter(Boolean).join('；');
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

    const detectedIntent = detectIntent(cleanText);
    const intent = detectedIntent === 'image' || detectedIntent === 'vision' ? detectedIntent : detectedIntent === 'adult' ? 'adult' : 'writing';
    const sensitive = intent === 'adult' || shouldUseLocalModel(cleanText);
    const nextChapter = await getNextChapterNumber();
    const activeInfo = await getActiveModelInfo(mode);
    const usingLocal = sensitive || (modelChoice ? modelChoice.provider === 'local' : activeInfo?.provider === 'local');
    let systemPrompt: string;

    if (sensitive) {
      const storyContext = mode === 'writing' ? await buildSystemPrompt(novelId, nextChapter, true) : '';
      systemPrompt = `${INTIMATE_SYSTEM_PROMPT}\n\n${storyContext}\n\n直接输出正文；亲密画面使用淡出处理。`;
    } else if (intent === 'image') {
      systemPrompt = '你是图像创作助手。根据用户描述生成图片。';
    } else if (mode === 'writing') {
      systemPrompt = await buildSystemPrompt(novelId, nextChapter, usingLocal);
      if (usingLocal) systemPrompt += '';
    } else {
      systemPrompt = '你是妙笔的中文创作助手。回答准确、自然、简洁；不要输出思考过程，直接给出答案。';
    }

    const apiMessages = await buildApiMessages(cleanText, systemPrompt);
    const result = await runStreaming(apiMessages, sensitive, intent);
    if (!result) return;

    if (!result.body) {
      await appendChatMessage(novelId, result.message);
      return;
    }

    result.message.content = result.body;
    await appendChatMessage(novelId, result.message);

    if (mode !== 'writing' || intent === 'image') return;
    const chapter = parseChapter(result.body);
    if (chapter.body.length >= 400) {
      const headingMatch = chapter.body.match(/^第\s*[0-9一二三四五六七八九十百千]+\s*章\s*[^\n]*/);
      const outlineTitle = chapter.outline.split('\n')[0]?.replace(/^(标题|章节标题)\s*[：:]\s*/, '').trim();
      const title = headingMatch?.[0]?.trim() || outlineTitle || `第${nextChapter}章`;
      await addChapter(novelId, title, chapter.body, chapter.outline || chapter.body.slice(0, 260));
    }
    try {
      const jsonMatch = result.body.match(/```json\s*([\s\S]*?)```/) || result.body.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const normalized = jsonMatch[0].replace(/^```json\s*|```$/g, '').replace(/，/g, ',').replace(/：/g, ':');
        const update = JSON.parse(normalized);
        const chapterNumber = nextChapter;
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
      const response = await chatCompletion(apiMessages, { intent: 'writing', ...requestOverrides() });
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
    await sendToAI(`请严格按照以下大纲写作完整章节。如果是本地模型就写900-1300字；云端模型写5000字左右。\n\n${pendingOutline}`);
    setPendingOutline('');
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    const parsed = isUser ? { body: item.content, thinking: '' } : parseThinking(item.content);
    const chapter = !isUser && mode === 'writing' ? parseChapter(parsed.body) : { outline: '', preview: '', body: parsed.body };
    const renderedImage = !isUser ? extractImageMarkdown(chapter.body || parsed.body) : { imageUrl: '', body: '' };
    const display = renderedImage.imageUrl ? '' : (chapter.body || parsed.body);
    const isLoadingPlaceholder = !isUser && loading && item.id === messages[messages.length - 1]?.id;

    return (
      <View style={[styles.row, isUser ? styles.userRow : styles.aiRow]}>
        <View style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}>
          {isLoadingPlaceholder && <GenerationDots label={streamThinking ? '正在思考' : `正在生成 · ${elapsedSeconds}s`} />}
          {!isUser && (isLoadingPlaceholder ? streamThinking : parsed.thinking) ? (
            <ThinkingPanel text={isLoadingPlaceholder ? streamThinking : parsed.thinking} streaming={isLoadingPlaceholder} />
          ) : null}
          {renderedImage.imageUrl ? <Image source={{ uri: renderedImage.imageUrl }} style={styles.generatedImage} resizeMode="cover" /> : null}
          {!renderedImage.imageUrl && display ? <Text style={[styles.messageText, isUser && styles.userText]}>{display}</Text> : isLoadingPlaceholder && !renderedImage.imageUrl ? <StreamCursor /> : null}
          {chapter.outline ? <Panel title="本章大纲" text={chapter.outline} icon={<Icon.outline size={13} color={T.textSec} />} /> : null}
          {chapter.preview ? <PreviewPanel text={chapter.preview} onContinue={() => sendToAI(`根据以下预告继续下一章：\n\n${chapter.preview}`)} /> : null}
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
            <Text style={styles.title}>AI 写作</Text>
            <Text style={styles.model} numberOfLines={1}>{modelLabel}</Text>
          </View>
          <TouchableOpacity onPress={() => setShowCountModal(true)} style={styles.iconButton}>
            <Icon.auto size={16} color={T.text} />
          </TouchableOpacity>
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
        onScroll={scrollOnScroll}
        onScrollBeginDrag={() => {
          userScrollingRef.current = true;
        }}
        onScrollEndDrag={measureScroll}
        onMomentumScrollEnd={(event: any) => {
          userScrollingRef.current = false;
          measureScroll(event);
        }}
        scrollToOverflowEnabled
        scrollEventThrottle={16}
        ListEmptyComponent={(
          <View style={styles.empty}>
            <Icon.chat size={42} color="#333" />
            <Text style={styles.emptyTitle}>开始你的故事</Text>
            <Text style={styles.emptySubtitle}>描述剧情、修改章节或一键生成大纲</Text>
          </View>
        )}
      />

      {showScrollButton && (
        <TouchableOpacity style={styles.scrollButton} onPress={jumpToLatest} activeOpacity={0.8}>
          <Icon.down size={18} color="#0D0D0D" />
        </TouchableOpacity>
      )}

      <View style={styles.inputBar}>
        <View style={styles.inputRow}>
          <View style={styles.inputShell}>
            <TextInput
              style={[styles.input, { height: Math.min(150, Math.max(46, inputHeight)) }]}
              value={input}
              onChangeText={setInput}
              onContentSizeChange={(event) => setInputHeight(Math.ceil(event.nativeEvent.contentSize.height))}
              placeholder="输入剧情指令..."
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
              </View>
              {loading ? (
                <TouchableOpacity style={[styles.sendButton, styles.stopButton]} onPress={() => abortRef.current?.abort()} activeOpacity={0.8}>
                  <Icon.close size={15} color="#F5F5F5" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={[styles.sendButton, !input.trim() && styles.disabledButton]} onPress={handleSubmit} disabled={!input.trim()} activeOpacity={0.8}>
                  <Icon.send size={15} color="#0D0D0D" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </View>

      <CapsuleAlert visible={outlineModal} title="章节大纲" message={pendingOutline} confirmText="开始写作" onCancel={() => setOutlineModal(false)} onConfirm={confirmOutline} />
      <ModelPicker
        visible={showModelPicker}
        selectedId={modelChoice?.id ?? 'auto'}
        onClose={() => setShowModelPicker(false)}
        onSelect={(option) => {
          setModelChoice(option);
          setModelLabel(option.label);
          setShowModelPicker(false);
        }}
      />

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
  modelPill: { flexDirection: 'row', alignItems: 'center', gap: 3, maxWidth: '100%', height: 22, paddingHorizontal: 7, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.06)' },
  modelPillText: { fontSize: 9, fontWeight: '600', color: T.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  input: { width: '100%', minHeight: 46, maxHeight: 150, borderRadius: 0, borderWidth: 0, backgroundColor: 'transparent', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, fontSize: 15, lineHeight: 22, color: T.text },
  sendButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center' },
  stopButton: { backgroundColor: '#333', borderColor: '#444', borderWidth: 1 },
  disabledButton: { backgroundColor: '#2A2A2A' },
  modelTag: { marginTop: 8, fontSize: 10, color: '#666' },
  countInput: { height: 42, marginTop: 12, borderRadius: 14, borderWidth: 1, borderColor: '#333', backgroundColor: '#111', color: '#F5F5F5', textAlign: 'center', fontSize: 15 },
});
