import React, { useRef, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
  StatusBar, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { T } from '../lib/theme';
import { chatCompletion } from '../lib/llm';

type Msg = { role: 'user' | 'assistant'; content: string };

export default function WritingScreen({ navigation }: any) {
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'assistant', content: '你好！我是 AI 写作助手。告诉我你想写什么，我可以帮你创作、续写、润色或提供灵感。\n\n例如：\n• 帮我写一篇科幻短篇小说\n• 续写这段文字...\n• 润色这段描写\n• 给我一个爱情故事的开头' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || loading) return;
    const userMsg: Msg = { role: 'user', content: text };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput('');
    setLoading(true);
    try {
      const result = await chatCompletion(
        history.map(m => ({ role: m.role, content: m.content })),
        { intent: 'writing' }
      );
      setMessages(prev => [...prev, { role: 'assistant', content: result.content || '没有回复内容' }]);
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `错误：${e.message}` }]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
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
            {msg.role === 'assistant' && <Text style={s.avatar}>AI</Text>}
            <Text style={[s.bubbleText, msg.role === 'user' && s.userText]}>{msg.content}</Text>
          </View>
        ))}
        {loading && <View style={[s.bubble, s.aiBubble]}><ActivityIndicator color={T.grey} size="small" /></View>}
      </ScrollView>
      <View style={s.inputBar}>
        <TextInput value={input} onChangeText={setInput} placeholder="描述你想写的内容..." placeholderTextColor={T.textDim} multiline style={s.input} />
        <TouchableOpacity disabled={!input.trim() || loading} style={[s.sendBtn, (!input.trim() || loading) && { opacity: 0.3 }]} onPress={() => send()}>
          <Text style={s.sendIcon}>↑</Text>
        </TouchableOpacity>
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
  bubble: { maxWidth: '85%', padding: 14, borderRadius: T.radius, marginBottom: 10, flexDirection: 'row' },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#2563EB' },
  aiBubble: { alignSelf: 'flex-start', backgroundColor: T.surface2 },
  avatar: { color: T.grey, fontSize: 11, fontWeight: '700', marginRight: 8, marginTop: 2 },
  bubbleText: { color: T.text, fontSize: 15, lineHeight: 22, flex: 1 },
  userText: { color: '#FFF' },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', padding: 12, paddingBottom: 30, backgroundColor: T.bg, borderTopWidth: 1, borderTopColor: T.border },
  input: { flex: 1, color: T.text, fontSize: 15, backgroundColor: T.surface2, borderRadius: T.radius, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, maxHeight: 100, marginRight: 8 },
  sendBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: T.white, alignItems: 'center', justifyContent: 'center' },
  sendIcon: { color: T.black, fontSize: 18, fontWeight: '800' },
};
