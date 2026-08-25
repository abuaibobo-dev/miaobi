import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, FlatList, KeyboardAvoidingView, Platform,
  StatusBar, Text, TextInput, TouchableOpacity, View, Dimensions, Pressable,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { T } from '../lib/theme';
import { chatCompletion } from '../lib/llm';
import { getLibrary } from '../lib/library';
import type { BookRecord } from '../types/book';

type Props = any;
type Msg = { role: 'user' | 'assistant'; content: string };

const DRAWER_WIDTH = 280;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

const MENU_ITEMS = [
  { key: 'chat', icon: '💬', label: 'AI 对话' },
  { key: 'writing', icon: '✍️', label: 'AI 写作' },
  { key: 'sources', icon: '📚', label: '书源管理' },
  { key: 'shelf', icon: '📖', label: '我的书架' },
  { key: 'assistant', icon: '🤖', label: '找书助手' },
  { key: 'settings', icon: '⚙️', label: '设置' },
];

const QUICK_PROMPTS = [
  '帮我写一个科幻故事的开头',
  '续写这段文字...',
  '润色这段描写',
  '给一个爱情故事的灵感',
];

export default function HomeScreen({ navigation }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'assistant', content: '你好！我是 AI 写作助手。告诉我你想写什么，我可以帮你创作、续写、润色或提供灵感。' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState('');
  const scrollRef = useRef<FlatList>(null);
  const drawerAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;

  useFocusEffect(useCallback(() => {
    getLibrary().then(() => {});
  }, []));

  const toggleDrawer = () => {
    const toValue = drawerOpen ? -DRAWER_WIDTH : 0;
    setDrawerOpen(!drawerOpen);
    Animated.spring(drawerAnim, { toValue, useNativeDriver: true, tension: 65, friction: 11 }).start();
  };

  const navigateTo = (key: string) => {
    setDrawerOpen(false);
    Animated.spring(drawerAnim, { toValue: -DRAWER_WIDTH, useNativeDriver: true, tension: 65, friction: 11 }).start();
    switch (key) {
      case 'writing': navigation.navigate('Writing'); break;
      case 'sources': navigation.navigate('Sources'); break;
      case 'shelf': navigation.navigate('Shelf'); break;
      case 'assistant': navigation.navigate('AIAssistant'); break;
      case 'settings': navigation.navigate('Settings'); break;
      default: break;
    }
  };

  const send = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    const userMsg: Msg = { role: 'user', content: msg };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput('');
    setLoading(true);
    try {
      const result = await chatCompletion(
        history.map(m => ({ role: m.role, content: m.content })),
        { intent: 'writing' }
      );
      setProvider(result.provider || '');
      setMessages(prev => [...prev, { role: 'assistant', content: result.content || '没有回复内容' }]);
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `错误：${e.message}` }]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const renderMsg = ({ item }: { item: Msg }) => (
    <View style={[s.bubble, item.role === 'user' ? s.userBubble : s.aiBubble]}>
      {item.role === 'assistant' && <Text style={s.avatar}>AI</Text>}
      <Text style={[s.bubbleText, item.role === 'user' && s.userText]}>{item.content}</Text>
    </View>
  );

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={T.bg} />

      {/* Drawer overlay */}
      {drawerOpen && <Pressable style={s.overlay} onPress={toggleDrawer} />}

      {/* Drawer */}
      <Animated.View style={[s.drawer, { transform: [{ translateX: drawerAnim }] }]}>
        <View style={s.drawerHeader}>
          <Text style={s.drawerLogo}>📖 妙笔</Text>
          <Text style={s.drawerSub}>AI 写作 · 找书 · 阅读</Text>
        </View>
        {MENU_ITEMS.map(item => (
          <TouchableOpacity key={item.key} style={s.drawerItem} onPress={() => navigateTo(item.key)}>
            <Text style={s.drawerIcon}>{item.icon}</Text>
            <Text style={s.drawerLabel}>{item.label}</Text>
          </TouchableOpacity>
        ))}
        {provider ? (
          <View style={s.drawerFooter}>
            <Text style={s.providerText}>当前模型：{provider}</Text>
          </View>
        ) : null}
      </Animated.View>

      {/* Main content */}
      <View style={s.main}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={toggleDrawer} style={s.menuBtn}>
            <Text style={s.menuIcon}>☰</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>妙笔</Text>
          {provider ? <Text style={s.headerProvider}>{provider}</Text> : <View style={{ width: 37 }} />}
        </View>

        {/* Chat */}
        <FlatList
          ref={scrollRef}
          data={messages}
          renderItem={renderMsg}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={s.chatArea}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          ListFooterComponent={loading ? (
            <View style={[s.bubble, s.aiBubble]}>
              <ActivityIndicator color={T.grey} size="small" />
            </View>
          ) : null}
        />

        {/* Quick prompts */}
        {messages.length <= 1 && (
          <View style={s.quickRow}>
            {QUICK_PROMPTS.map((p, i) => (
              <TouchableOpacity key={i} style={s.quickChip} onPress={() => send(p)}>
                <Text style={s.quickText}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Input */}
        <View style={s.inputBar}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="告诉我你想写什么..."
            placeholderTextColor={T.textDim}
            multiline
            style={s.input}
          />
          <TouchableOpacity disabled={!input.trim() || loading} style={[s.sendBtn, (!input.trim() || loading) && s.sendDisabled]} onPress={() => send()}>
            <Text style={s.sendIcon}>↑</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const s: any = {
  container: { flex: 1, backgroundColor: T.bg },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 10 },
  drawer: { position: 'absolute', top: 0, left: 0, bottom: 0, width: DRAWER_WIDTH, backgroundColor: T.surface, zIndex: 20, paddingTop: 60 },
  drawerHeader: { paddingHorizontal: 20, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: T.border },
  drawerLogo: { color: T.text, fontSize: 22, fontWeight: '800' },
  drawerSub: { color: T.textMuted, fontSize: 12, marginTop: 4 },
  drawerItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14 },
  drawerIcon: { fontSize: 18, marginRight: 14, width: 24, textAlign: 'center' },
  drawerLabel: { color: T.text, fontSize: 15, fontWeight: '500' },
  drawerFooter: { position: 'absolute', bottom: 40, left: 20, right: 20 },
  providerText: { color: T.textMuted, fontSize: 11 },
  main: { flex: 1 },
  header: { paddingTop: 50, paddingBottom: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: T.bg },
  menuBtn: { width: 37, height: 37, alignItems: 'center', justifyContent: 'center' },
  menuIcon: { color: T.text, fontSize: 22 },
  headerTitle: { color: T.text, fontSize: 20, fontWeight: '800' },
  headerProvider: { color: T.textMuted, fontSize: 10, backgroundColor: T.surface2, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  chatArea: { padding: 16, paddingBottom: 8 },
  bubble: { maxWidth: '82%', padding: 14, borderRadius: T.radius, marginBottom: 10, flexDirection: 'row' },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#2563EB' },
  aiBubble: { alignSelf: 'flex-start', backgroundColor: T.surface2 },
  avatar: { color: T.grey, fontSize: 11, fontWeight: '700', marginRight: 8, marginTop: 2 },
  bubbleText: { color: T.text, fontSize: 15, lineHeight: 22, flex: 1 },
  userText: { color: '#FFF' },
  quickRow: { paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickChip: { backgroundColor: T.surface2, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: T.border },
  quickText: { color: T.textSecondary, fontSize: 13 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', padding: 12, paddingBottom: 30, backgroundColor: T.bg, borderTopWidth: 1, borderTopColor: T.border },
  input: { flex: 1, color: T.text, fontSize: 15, backgroundColor: T.surface2, borderRadius: T.radius, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, maxHeight: 100, marginRight: 8 },
  sendBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: T.white, alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { opacity: 0.3 },
  sendIcon: { color: T.black, fontSize: 18, fontWeight: '800' },
};
