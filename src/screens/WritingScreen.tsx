import React, { useRef, useState } from 'react';
import {
  ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, ScrollView,
  StatusBar, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { T } from '../lib/theme';
import { chatCompletion, detectIntent } from '../lib/llm';

type Msg = { role: 'user' | 'assistant'; content: string; provider?: string };

const MODELS = [
  { key: 'auto', label: '自动' },
  { key: 'deepseek', label: 'DeepSeek' },
  { key: 'groq', label: 'Groq' },
  { key: 'sambanova', label: 'SambaNova' },
  { key: 'cerebras', label: 'Cerebras' },
];

export default function WritingScreen({ navigation }: any) {
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'assistant', content: '你好！我是 AI 写作助手。告诉我你想写什么，我可以帮你创作、续写、润色或提供灵感。' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState('');
  const [model, setModel] = useState('auto');
  const [provider, setProvider] = useState('');
  const CHAT_KEY = 'miaobi.writingChat';
  const scrollRef = useRef<ScrollView>(null);

  React.useEffect(() => {
    AsyncStorage.getItem(CHAT_KEY).then(raw => {
      if (raw) { try { const s = JSON.parse(raw); if (Array.isArray(s) && s.length) setMessages(s); } catch {} }
    });
  }, []);

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || loading) return;
    const userMsg: Msg = { role: 'user', content: text };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput('');
    setLoading(true);
    setStreaming('');
    let streamedContent = '';
    try {
      const intent = detectIntent(text);
      const result = await chatCompletion(
        history.map(m => ({ role: m.role, content: m.content })),
        {
          intent,
          modelOverride: model === 'auto' ? undefined : model,
          onProvider: (p) => setProvider(p),
          onContent: (delta) => {
            streamedContent += delta;
            setStreaming(streamedContent);
            setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 10);
          },
          onThinking: () => setStreaming(prev => prev || '思考中...'),
        }
      );
      const finalContent = streamedContent || result.content || '没有回复内容';
      setMessages(prev => {
        const filtered = prev.filter(m => m.role !== 'assistant' || m.content !== '');
        return [...filtered, { role: 'assistant', content: finalContent, provider: result.provider }];
      });
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `错误：${e.message}` }]);
    } finally {
      setLoading(false);
      setStreaming('');
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
      setMessages(prev => { AsyncStorage.setItem(CHAT_KEY, JSON.stringify(prev.slice(-50))); return prev; });
    }
  };

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="light-content" backgroundColor={T.bg} />
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backText}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>AI 写作</Text>
        <View style={{ width: 37 }} />
      </View>
      <ScrollView ref={scrollRef} contentContainerStyle={s.messages} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
        {messages.map((msg, i) => (
          <View key={i} style={[s.bubble, msg.role === 'user' ? s.userBubble : s.aiBubble]}>
            {msg.role === 'assistant' && <View style={s.avatar}><Text style={s.avatarText}>AI</Text></View>}
            <View style={{ flex: 1 }}>
              <Text style={[s.bubbleText, msg.role === 'user' && s.userText]}>{msg.content}</Text>
              {msg.provider ? <Text style={s.msgProvider}>{msg.provider}</Text> : null}
            </View>
          </View>
        ))}
        {loading ? (
          <View style={[s.bubble, s.aiBubble]}>
            {streaming ? (
              <Text style={s.bubbleText}>{streaming}</Text>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <ActivityIndicator color={T.grey} size="small" />
                <Text style={{ color: T.grey, fontSize: 12, marginLeft: 8 }}>思考中...</Text>
              </View>
            )}
          </View>
        ) : null}
      </ScrollView>
      <View style={s.inputArea}>
        <View style={s.modelRow}>
          {MODELS.map(m => (
            <TouchableOpacity
              key={m.key}
              style={[s.modelChip, model === m.key && s.modelActive]}
              onPress={() => setModel(m.key)}
            >
              <Text style={[s.modelText, model === m.key && s.modelTextActive]}>{m.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={s.inputRow}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="描述你想写的内容..."
            placeholderTextColor={T.textMuted}
            multiline
            style={s.input}
          />
          <TouchableOpacity
            disabled={!input.trim() || loading}
            style={[s.sendBtn, (!input.trim() || loading) && { opacity: 0.3 }]}
            onPress={() => send()}
          >
            <Text style={s.sendIcon}>↑</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const s: any = {
  container: { flex: 1, backgroundColor: T.bg },
  header: { paddingTop: 50, paddingBottom: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: T.bg, borderBottomWidth: 1, borderBottomColor: T.border },
  backBtn: { width: 37, height: 37, alignItems: 'center', justifyContent: 'center' },
  backText: { color: T.text, fontSize: 20 },
  headerTitle: { color: T.text, fontSize: 18, fontWeight: '700' },
  messages: { padding: 16, paddingBottom: 8 },
  bubble: { maxWidth: '85%', padding: 12, borderRadius: T.radius, marginBottom: 8, flexDirection: 'row' },
  userBubble: { alignSelf: 'flex-end', backgroundColor: T.bubbleUser, borderBottomRightRadius: 4 },
  aiBubble: { alignSelf: 'flex-start', backgroundColor: T.bubbleAI, borderBottomLeftRadius: 4 },
  avatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: T.surface2, alignItems: 'center', justifyContent: 'center', marginRight: 8, marginTop: 2 },
  avatarText: { color: T.grey, fontSize: 9, fontWeight: '700' },
  bubbleText: { color: T.text, fontSize: 15, lineHeight: 22, flex: 1 },
  userText: { color: T.text },
  msgProvider: { color: T.textDim, fontSize: 9, marginTop: 4 },
  inputArea: { paddingHorizontal: 12, paddingBottom: 20, backgroundColor: T.bg, borderTopWidth: 1, borderTopColor: T.border },
  modelRow: { flexDirection: 'row', gap: 4, marginBottom: 8, paddingHorizontal: 4 },
  modelChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: T.surface2 },
  modelActive: { backgroundColor: T.white },
  modelText: { color: T.textMuted, fontSize: 11 },
  modelTextActive: { color: T.black, fontWeight: '700' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: { flex: 1, color: T.text, fontSize: 15, backgroundColor: T.surface2, borderRadius: 20, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, maxHeight: 120, minHeight: 42, borderWidth: 1, borderColor: T.border, lineHeight: 20 },
  sendBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: T.white, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  sendIcon: { color: T.black, fontSize: 18, fontWeight: '800' },
};
