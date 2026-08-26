import React, { useRef, useState } from 'react';
import {
  ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, ScrollView,
  StatusBar, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { T } from '../lib/theme';
import { Icon } from '../lib/icons';
import { chatCompletion, detectIntent } from '../lib/llm';
import ModelPicker from '../components/ModelPicker';

type Msg = { role: 'user' | 'assistant'; content: string; provider?: string };



export default function WritingScreen({ navigation }: any) {
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'assistant', content: '你好！我是 AI 写作助手。告诉我你想写什么，我可以帮你创作、续写、润色或提供灵感。' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState('');
  const [model, setModel] = useState('auto');
  const [provider, setProvider] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [userScrolling, setUserScrolling] = useState(false);
  const CHAT_KEY = 'miaobi.writingChat';
  const scrollRef = useRef<ScrollView>(null);

  React.useEffect(() => {
    AsyncStorage.getItem(CHAT_KEY).then(raw => {
      if (raw) { try { const s = JSON.parse(raw); if (Array.isArray(s) && s.length) setMessages(s); } catch {} }
    });
  }, []);

  const copyMsg = async (text: string, id: string) => {
    await Clipboard.setStringAsync(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

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
            if (!userScrolling) setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 10);
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
      setTimeout(() => { if (!userScrolling) scrollRef.current?.scrollToEnd({ animated: true }); }, 100);
      setMessages(prev => { AsyncStorage.setItem(CHAT_KEY, JSON.stringify(prev.slice(-50))); return prev; });
    }
  };

  return (
    <KeyboardAvoidingView style={s.container} behavior="height">
      <StatusBar barStyle="light-content" backgroundColor={T.bg} />
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backText}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>AI 写作</Text>
        <TouchableOpacity onPress={() => { setMessages([{ role: 'assistant', content: '你好！我是 AI 写作助手。告诉我你想写什么。' }]); setStreaming(''); }} style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
          <Text style={{ color: T.textMuted, fontSize: 12 }}>新对话</Text>
        </TouchableOpacity>
      </View>
      <ScrollView ref={scrollRef} contentContainerStyle={s.messages} onContentSizeChange={() => { if (!userScrolling) scrollRef.current?.scrollToEnd({ animated: true }); }}>
        {messages.map((msg, i) => (
          <View key={i} style={[s.bubble, msg.role === 'user' ? s.userBubble : s.aiBubble]}>
            {msg.role === 'assistant' && <View style={s.avatar}><Text style={s.avatarText}>AI</Text></View>}
            <View style={{ flex: 1 }}>
              <Text style={[s.bubbleText, msg.role === 'user' && s.userText]}>{msg.content}</Text>
              {msg.role === 'assistant' && msg.content.length > 20 && (
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                  <TouchableOpacity style={s.copyBtn} onPress={() => copyMsg(msg.content, String(i))}>
                    <Text style={s.copyText}>{copiedId === String(i) ? '✓ 已复制' : '复制'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.copyBtn} onPress={async () => {
                    try {
                      const { saveAiContent } = await import('../lib/library');
                      await saveAiContent('AI 创作 · ' + new Date().toLocaleDateString(), msg.content);
                      setCopiedId('saved_' + String(i));
                      setTimeout(() => setCopiedId(null), 2000);
                    } catch (e) { /* silent */ }
                  }}>
                    <Text style={s.copyText}>{copiedId === 'saved_' + String(i) ? '✓ 已保存到书架' : '保存到书架'}</Text>
                  </TouchableOpacity>
                </View>
              )}
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
                <ActivityIndicator color={T.text} size="small" />
                <Text style={{ color: T.textMuted, fontSize: 14, marginLeft: 10, fontWeight: "500" }}>思考中...</Text>
              </View>
            )}
          </View>
        ) : null}
      </ScrollView>
      <View style={s.inputWrap}>
        <View style={s.modelRow}>
          <TouchableOpacity style={s.modelBtn} onPress={() => setShowModelPicker(true)}>
            <Text style={s.modelBtnLabel}>{model === 'auto' ? '智能' : model.charAt(0).toUpperCase() + model.slice(1)}</Text>
            <Text style={s.modelBtnArrow}>▾</Text>
          </TouchableOpacity>
        </View>
        <View style={s.inputContainer}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="描述你想写的内容..."
            placeholderTextColor={T.textMuted}
            multiline
            style={s.input}
            textAlignVertical="top"
          />
          <TouchableOpacity
            disabled={!input.trim() || loading}
            style={[s.sendBtn, (!input.trim() || loading) && s.sendDisabled]}
            onPress={() => send()}
          >
            <Icon.arrow size={16} color={T.black} />
          </TouchableOpacity>
        </View>
      </View>
      <ModelPicker visible={showModelPicker} selectedId={model} onClose={() => setShowModelPicker(false)} onSelect={(opt) => { setModel(opt.model || 'auto'); setShowModelPicker(false); }} />
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
  inputWrap: { paddingHorizontal: 12, paddingBottom: 24, paddingTop: 4, backgroundColor: T.bg },
  modelRow: { flexDirection: 'row', marginBottom: 8, paddingHorizontal: 2 },
  modelBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 28, paddingHorizontal: 10, borderRadius: 12, backgroundColor: T.surface2 },
  modelBtnLabel: { color: T.textMuted, fontSize: 11, fontWeight: '600' },
  modelBtnArrow: { color: T.textDim, fontSize: 9 },
  inputContainer: { flexDirection: 'row', alignItems: 'flex-end', backgroundColor: T.surface2, borderRadius: 20, borderWidth: 1, borderColor: T.border, paddingLeft: 14, paddingRight: 8, paddingVertical: 6, minHeight: 50 },
  input: { flex: 1, color: T.text, fontSize: 15, maxHeight: 160, paddingTop: 10, paddingBottom: 10, lineHeight: 22, minHeight: 24 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: T.white, alignItems: 'center', justifyContent: 'center', marginBottom: 1 },
  sendDisabled: { opacity: 0.3, backgroundColor: T.surface2 },
  copyBtn: { alignSelf: 'flex-end', marginTop: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: T.surface2, borderWidth: 1, borderColor: T.border },
  copyText: { color: T.textMuted, fontSize: 11, fontWeight: '600' },
};
