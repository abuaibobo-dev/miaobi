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

const MENU = [
  { key: 'writing', iconName: 'write' as const, label: 'AI 写作' },
  { key: 'sources', iconName: 'book' as const, label: '书源管理' },
  { key: 'shelf', iconName: 'save' as const, label: '我的书架' },
  { key: 'assistant', iconName: 'search' as const, label: '找书助手' },
  { key: 'settings', iconName: 'settings' as const, label: '设置' },
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
  const [showMenu, setShowMenu] = useState(false);
  const [showNewBook, setShowNewBook] = useState(false);
  const [newBookName, setNewBookName] = useState('');
  const [newBookGenre, setNewBookGenre] = useState('玄幻');
  const [newBookSynopsis, setNewBookSynopsis] = useState('');
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

  const ROUTE_MAP: Record<string, string> = { writing: 'Writing', sources: 'Sources', shelf: 'Shelf', assistant: 'AIAssistant', settings: 'Settings' };
  const nav = (key: string) => {
    setDrawerOpen(false);
    Animated.spring(drawerX, { toValue: -DRAWER_W, useNativeDriver: true, tension: 65, friction: 11 }).start();
    const route = ROUTE_MAP[key];
    if (route) navigation.navigate(route);
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
                } catch (e) { /* silent */ }
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
            {(Icon as any)[item.iconName]({ size: 18, color: T.textSecondary })}
            <Text style={s.drawerLabel}>{item.label}</Text>
          </TouchableOpacity>
        ))}
        <View style={s.drawerFooter}>
          <Text style={s.footerText}>v2.5 · 黑白灰</Text>
        </View>
      </Animated.View>

      <KeyboardAvoidingView style={s.main} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={s.header}>
          <TouchableOpacity onPress={toggleDrawer} style={s.menuBtn}>
            <Text style={s.menuIcon}>☰</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>妙笔</Text>
          {provider ? <Text style={s.headerBadge}>{provider}</Text> : <View style={{ width: 37 }} />}
          <TouchableOpacity onPress={() => setShowMenu(!showMenu)} style={s.menuBtn}>
            <Icon.more size={20} color={T.text} />
          </TouchableOpacity>
        </View>
        {showMenu && (
          <View style={s.headerMenu}>
            <TouchableOpacity style={s.headerMenuItem} onPress={() => { setShowMenu(false); setShowNewBook(true); }}>
              <Icon.write size={16} color={T.text} />
              <Text style={s.headerMenuText}>写新书</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.headerMenuItem} onPress={() => { setShowMenu(false); setMessages([{ role: 'assistant', content: '你好！我是 AI 写作助手。告诉我你想写什么。' }]); }}>
              <Icon.add size={16} color={T.text} />
              <Text style={s.headerMenuText}>新建对话</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.headerMenuItem} onPress={async () => {
              setShowMenu(false);
              try {
                const text = messages.map(m => (m.role === 'user' ? '【我】' : '【AI】') + ': ' + m.content).join('\n\n');
                const { default: Clipboard } = await import('expo-clipboard');
                await Clipboard.setStringAsync(text);
              } catch {}
            }}>
              <Icon.save size={16} color={T.text} />
              <Text style={s.headerMenuText}>导出对话</Text>
            </TouchableOpacity>
          </View>
        )}

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
                    <ActivityIndicator color={T.text} size="small" />
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
              <Icon.arrow size={20} color={T.black} />
            </TouchableOpacity>
          </View>
        </View>
        <ModelPicker visible={showModelPicker} selectedId={model} onClose={() => setShowModelPicker(false)} onSelect={(opt) => { setModel(opt.model || 'auto'); setShowModelPicker(false); }} />

        {showNewBook && (
          <View style={s.modalOverlay}>
            <View style={s.modalCard}>
              <Text style={s.modalTitle}>创建新书</Text>
              <Text style={s.modalLabel}>书名</Text>
              <TextInput style={s.modalInput} value={newBookName} onChangeText={setNewBookName} placeholder="输入书名..." placeholderTextColor={T.textMuted} />
              <Text style={s.modalLabel}>类型</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {['玄幻','言情','悬疑','科幻','历史','武侠','都市','成人'].map(g => (
                  <TouchableOpacity key={g} style={[s.genreChip, newBookGenre === g && s.genreActive]} onPress={() => setNewBookGenre(g)}>
                    <Text style={[s.genreText, newBookGenre === g && s.genreActiveText]}>{g}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={s.modalLabel}>简介</Text>
              <TextInput style={[s.modalInput, { height: 80 }]} value={newBookSynopsis} onChangeText={setNewBookSynopsis} placeholder="故事简介..." placeholderTextColor={T.textMuted} multiline textAlignVertical="top" />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                <TouchableOpacity style={s.modalCancel} onPress={() => setShowNewBook(false)}>
                  <Text style={s.modalCancelText}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.modalConfirm} onPress={async () => {
                  if (!newBookName.trim()) return;
                  try {
                    const { saveAiContent } = await import('../lib/library');
                    const intro = `《${newBookName}》\n类型：${newBookGenre}\n简介：${newBookSynopsis || '暂无'}\n\n--- 开始创作 ---`;
                    await saveAiContent(newBookName, intro);
                    setShowNewBook(false);
                    setNewBookName(''); setNewBookSynopsis(''); setNewBookGenre('玄幻');
                    setInput(`我正在写一本${newBookGenre}小说《${newBookName}》，${newBookSynopsis ? '简介：' + newBookSynopsis + '。' : ''}请帮我写第一章。`);
                  } catch {}
                }}>
                  <Text style={s.modalConfirmText}>创建并开始写</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
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
  thinkingText: { color: T.textMuted, fontSize: 14, marginLeft: 10, fontWeight: "500" },
  quickRow: { paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  quickChip: { backgroundColor: T.surface2, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: T.border },
  quickText: { color: T.textSecondary, fontSize: 12 },
  inputWrap: { paddingHorizontal: 12, paddingBottom: 24, paddingTop: 4, backgroundColor: T.bg },
  modelRow: { flexDirection: 'row', marginBottom: 8, paddingHorizontal: 2 },
  modelBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 28, paddingHorizontal: 10, borderRadius: 12, backgroundColor: T.surface2 },
  modelBtnLabel: { color: T.textMuted, fontSize: 11, fontWeight: '600' },
  modelBtnArrow: { color: T.textDim, fontSize: 9 },
  inputContainer: { flexDirection: 'row', alignItems: 'flex-end', backgroundColor: T.surface2, borderRadius: 20, borderWidth: 1, borderColor: T.border, paddingLeft: 14, paddingRight: 8, paddingVertical: 6, minHeight: 50 },
  input: { flex: 1, color: T.text, fontSize: 15, maxHeight: 160, paddingTop: 10, paddingBottom: 10, lineHeight: 22, minHeight: 24 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: T.white, alignItems: 'center', justifyContent: 'center', marginBottom: 1 },
  sendDisabled: { opacity: 0.3, backgroundColor: T.surface2 },
  copyBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: T.surface2, borderWidth: 1, borderColor: T.border },
  copyText: { color: T.textMuted, fontSize: 11, fontWeight: '600' },
  headerMenu: { backgroundColor: T.surface, borderBottomWidth: 1, borderBottomColor: T.border, paddingHorizontal: 16, paddingBottom: 8 },
  headerMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10 },
  headerMenuText: { color: T.text, fontSize: 14, fontWeight: '500' },
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 50, alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', maxWidth: 360, backgroundColor: T.surface, borderRadius: 16, borderWidth: 1, borderColor: T.border, padding: 20 },
  modalTitle: { color: T.text, fontSize: 18, fontWeight: '800', marginBottom: 16, textAlign: 'center' },
  modalLabel: { color: T.textSecondary, fontSize: 12, marginBottom: 6, marginTop: 10 },
  modalInput: { backgroundColor: T.surface2, borderRadius: 10, borderWidth: 1, borderColor: T.border, paddingHorizontal: 12, paddingVertical: 10, color: T.text, fontSize: 14, minHeight: 42 },
  genreChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14, backgroundColor: T.surface2, borderWidth: 1, borderColor: T.border },
  genreActive: { backgroundColor: T.white, borderColor: T.white },
  genreText: { color: T.textSecondary, fontSize: 12, fontWeight: '600' },
  genreActiveText: { color: T.black },
  modalCancel: { flex: 1, height: 42, borderRadius: 10, backgroundColor: T.surface2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: T.border },
  modalCancelText: { color: T.textMuted, fontSize: 14, fontWeight: '600' },
  modalConfirm: { flex: 1, height: 42, borderRadius: 10, backgroundColor: T.white, alignItems: 'center', justifyContent: 'center' },
  modalConfirmText: { color: T.black, fontSize: 14, fontWeight: '700' },
};
