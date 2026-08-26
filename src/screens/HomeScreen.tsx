import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, FlatList, KeyboardAvoidingView, Keyboard, Platform, RefreshControl,
  StatusBar, Text, TextInput, TouchableOpacity, View, Dimensions, Pressable,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from '@react-navigation/native';
import { T } from '../lib/theme';
import { Icon } from '../lib/icons';
import { chatCompletion, detectIntent } from '../lib/llm';
import { getLibrary } from '../lib/library';

type Props = any;
type Msg = { role: 'user' | 'assistant'; content: string; provider?: string };

const DRAWER_W = 220;
const { width: SW } = Dimensions.get('window');

import { Ionicons } from '@expo/vector-icons';
const MENU = [
  { key: 'writing', icon: 'create-outline' as const, label: 'AI 写作' },
  { key: 'sources', icon: 'book-outline' as const, label: '书源管理' },
  { key: 'shelf', icon: 'library-outline' as const, label: '我的书架' },
  { key: 'assistant', icon: 'sparkles-outline' as const, label: '找书助手' },
  { key: 'settings', icon: 'settings-outline' as const, label: '设置' },
];

import ModelPicker from '../components/ModelPicker';

const QUICK = [
  '帮我写一个科幻故事的开头',
  '续写这段文字...',
  '润色这段描写',
  '给一个爱情故事的灵感',
];

export default function HomeScreen({ navigation }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'assistant', content: '你好！我是 AI 写作助手。告诉我你想写什么。' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState('');
  const [model, setModel] = useState('auto');
  const [streaming, setStreaming] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [userScrolling, setUserScrolling] = useState(false);
  const scrollRef = useRef<FlatList>(null);
  const drawerX = useRef(new Animated.Value(-DRAWER_W)).current;

  const CHAT_KEY = 'miaobi.homeChat';

  useFocusEffect(useCallback(() => {
    AsyncStorage.getItem('miaobi.searchHistory').then(raw => { if (raw) try { setSearchHistory(JSON.parse(raw).slice(0, 10)); } catch {} });
    AsyncStorage.getItem(CHAT_KEY).then(raw => {
      if (raw) {
        try { const saved = JSON.parse(raw); if (Array.isArray(saved) && saved.length) setMessages(saved); } catch {}
      }
    });
  }, []));

  const onRefresh = async () => {
    setRefreshing(true);
    await new Promise(r => setTimeout(r, 600));
    setRefreshing(false);
  };

  const toggleDrawer = () => {
    const to = drawerOpen ? -DRAWER_W : 0;
    setDrawerOpen(!drawerOpen);
    Animated.spring(drawerX, { toValue: to, useNativeDriver: true, tension: 65, friction: 11 }).start();
  };

  const nav = (key: string) => {
    setDrawerOpen(false);
    Animated.spring(drawerX, { toValue: -DRAWER_W, useNativeDriver: true, tension: 65, friction: 11 }).start();
    if (key === 'writing') navigation.navigate('Writing');
    else if (key === 'sources') navigation.navigate('Sources');
    else if (key === 'shelf') navigation.navigate('Shelf');
    else if (key === 'assistant') navigation.navigate('AIAssistant');
    else if (key === 'settings') navigation.navigate('Settings');
  };

  const send = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    Keyboard.dismiss();
    const userMsg: Msg = { role: 'user', content: msg };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput('');
    setLoading(true);
    setStreaming('');
    let streamedContent = '';
    try {
      const intent = detectIntent(msg);
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
          onThinking: (delta) => {
            setStreaming(prev => prev || '思考中...');
          },
        },
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
      setUserScrolling(false);
      setMessages(prev => { AsyncStorage.setItem(CHAT_KEY, JSON.stringify(prev.slice(-50))); return prev; });
      if (msg.length > 1 && !searchHistory.includes(msg)) {
        const newHistory = [msg, ...searchHistory].slice(0, 10);
        setSearchHistory(newHistory);
        AsyncStorage.setItem('miaobi.searchHistory', JSON.stringify(newHistory));
      }
    }
  };

  const copyMsg = async (text: string, id: string) => {
    await Clipboard.setStringAsync(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const renderMsg = ({ item, index }: { item: Msg; index: number }) => {
    const msgId = `${index}`;
    const isCopied = copiedId === msgId;
    return (
      <View style={[s.bubble, item.role === 'user' ? s.userBubble : s.aiBubble]}>
        {item.role === 'assistant' && <View style={s.avatar}><Text style={s.avatarText}>AI</Text></View>}
        <View style={{ flex: 1 }}>
          <Text style={[s.bubbleText, item.role === 'user' && s.userText]}>{item.content}</Text>
          {item.role === 'assistant' && item.content.length > 20 && (
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
              <TouchableOpacity style={s.copyBtn} onPress={() => copyMsg(item.content, msgId)}>
                <Text style={s.copyText}>{isCopied ? '✓ 已复制' : '复制'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.copyBtn} onPress={async () => {
                try {
                  const { saveAiContent } = await import('../lib/library');
                  await saveAiContent('AI 创作 · ' + new Date().toLocaleDateString(), item.content);
                  setCopiedId('saved_' + msgId);
                  setTimeout(() => setCopiedId(null), 2000);
                } catch (e) { console.log('save error', e); }
              }}>
                <Text style={s.copyText}>{copiedId === 'saved_' + msgId ? '✓ 已保存到书架' : '保存到书架'}</Text>
              </TouchableOpacity>
            </View>
          )}
          {item.provider ? <Text style={s.msgProvider}>{item.provider}</Text> : null}
        </View>
      </View>
    );
  };

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={T.bg} />

      {drawerOpen && <Pressable style={s.overlay} onPress={toggleDrawer} />}

      <Animated.View style={[s.drawer, { transform: [{ translateX: drawerX }] }]}>
        <View style={s.drawerHeader}>
          <Text style={s.drawerLogo}>📖 妙笔</Text>
          <Text style={s.drawerSub}>AI 写作 · 找书 · 阅读</Text>
        </View>
        {MENU.map(item => (
          <TouchableOpacity key={item.key} style={s.drawerItem} onPress={() => nav(item.key)}>
            <Ionicons name={item.icon} size={18} color={T.textSecondary} style={{ marginRight: 14, width: 24 }} />
            <Text style={s.drawerLabel}>{item.label}</Text>
          </TouchableOpacity>
        ))}
        <View style={s.drawerFooter}>
          <Text style={s.footerText}>v2.4.2 · 黑白灰</Text>
        </View>
      </Animated.View>

      <View style={s.main}>
        <View style={s.header}>
          <TouchableOpacity onPress={toggleDrawer} style={s.menuBtn}>
            <Text style={s.menuIcon}>☰</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>妙笔</Text>
          {provider ? <Text style={s.headerBadge}>{provider}</Text> : <View style={{ width: 37 }} />}
        </View>

        <FlatList
          ref={scrollRef}
          data={messages}
          renderItem={renderMsg}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={s.chatArea}
          onScrollBeginDrag={() => setUserScrolling(true)}
          onScrollEndDrag={(e) => {
            const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
            const distFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
            if (distFromBottom < 80) setUserScrolling(false);
          }}
          onContentSizeChange={() => { if (!userScrolling) scrollRef.current?.scrollToEnd({ animated: true }); }}
          ListFooterComponent={loading ? (
            <View style={[s.bubble, s.aiBubble]}>
              <View style={s.avatar}><Text style={s.avatarText}>AI</Text></View>
              <View style={{ flex: 1 }}>
                {streaming ? (
                  <Text style={s.bubbleText}>{streaming}</Text>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <ActivityIndicator color={T.grey} size="small" />
                    <Text style={s.thinkingText}>思考中...</Text>
                  </View>
                )}
              </View>
            </View>
          ) : null}
        />

        {messages.length <= 1 && (
          <View style={s.quickRow}>
            {QUICK.map((p, i) => (
              <TouchableOpacity key={i} style={s.quickChip} onPress={() => send(p)}>
                <Text style={s.quickText}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Input area - ChatGPT style */}
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
              placeholder="输入消息..."
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
      </View>
    </View>
  );
}

const s: any = {
  container: { flex: 1, backgroundColor: T.bg },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10 },
  drawer: { position: 'absolute', top: 0, left: 0, bottom: 0, width: DRAWER_W, backgroundColor: T.surface, zIndex: 20, paddingTop: 60 },
  drawerHeader: { paddingHorizontal: 20, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: T.border },
  drawerLogo: { color: T.text, fontSize: 20, fontWeight: '800' },
  drawerSub: { color: T.textMuted, fontSize: 11, marginTop: 4 },
  drawerItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 13 },
  drawerIcon: { fontSize: 16, marginRight: 14, width: 24, textAlign: 'center' },
  drawerLabel: { color: T.text, fontSize: 14, fontWeight: '500' },
  drawerFooter: { position: 'absolute', bottom: 40, left: 20 },
  footerText: { color: T.textDim, fontSize: 10 },
  main: { flex: 1 },
  header: { paddingTop: 50, paddingBottom: 8, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  menuBtn: { width: 37, height: 37, alignItems: 'center', justifyContent: 'center' },
  menuIcon: { color: T.text, fontSize: 20 },
  headerTitle: { color: T.text, fontSize: 18, fontWeight: '800' },
  headerBadge: { color: T.textMuted, fontSize: 9, backgroundColor: T.surface2, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  chatArea: { padding: 16, paddingBottom: 8 },
  bubble: { maxWidth: '85%', padding: 12, borderRadius: T.radius, marginBottom: 8, flexDirection: 'row' },
  userBubble: { alignSelf: 'flex-end', backgroundColor: T.bubbleUser, borderBottomRightRadius: 4 },
  aiBubble: { alignSelf: 'flex-start', backgroundColor: T.bubbleAI, borderBottomLeftRadius: 4 },
  avatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: T.surface2, alignItems: 'center', justifyContent: 'center', marginRight: 8, marginTop: 2 },
  avatarText: { color: T.grey, fontSize: 9, fontWeight: '700' },
  bubbleText: { color: T.text, fontSize: 14, lineHeight: 21 },
  userText: { color: T.text },
  msgProvider: { color: T.textDim, fontSize: 9, marginTop: 4 },
  thinkingText: { color: T.grey, fontSize: 12, marginLeft: 8 },
  quickRow: { paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  quickChip: { backgroundColor: T.surface2, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: T.border },
  quickText: { color: T.textSecondary, fontSize: 12 },
  inputWrap: { paddingHorizontal: 12, paddingBottom: 24, paddingTop: 4, backgroundColor: T.bg },
  modelRow: { flexDirection: 'row', marginBottom: 8, paddingHorizontal: 2 },
  modelBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 28, paddingHorizontal: 10, borderRadius: 12, backgroundColor: T.surface2 },
  modelBtnLabel: { color: T.textMuted, fontSize: 11, fontWeight: '600' },
  modelBtnArrow: { color: T.textDim, fontSize: 9 },
  inputContainer: { flexDirection: 'row', alignItems: 'flex-end', backgroundColor: T.surface2, borderRadius: 20, borderWidth: 1, borderColor: T.border, paddingLeft: 16, paddingRight: 6, paddingVertical: 6, minHeight: 48 },
  input: { flex: 1, color: T.text, fontSize: 15, maxHeight: 160, paddingTop: 8, paddingBottom: 8, lineHeight: 20 },
  sendBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center', marginBottom: 1 },
  sendDisabled: { opacity: 0.3, backgroundColor: T.surface2 },
  sendIcon: { color: '#111', fontSize: 18, fontWeight: '900' },
  copyBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: T.surface2, borderWidth: 1, borderColor: T.border },
  copyText: { color: T.textMuted, fontSize: 11, fontWeight: '600' },
};
