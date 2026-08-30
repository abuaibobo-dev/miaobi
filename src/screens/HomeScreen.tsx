import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated, FlatList, KeyboardAvoidingView, Keyboard, Platform, ScrollView, StyleSheet,
  StatusBar, Text, TextInput, TouchableOpacity, View, Pressable, Share,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from '@react-navigation/native';
import { T } from '../lib/theme';
import { Icon } from '../lib/icons';
import { createAgentSession, agentExecute } from '../lib/agent-engine';
import ModelPicker from '../components/ModelPicker';
import { GenerationDots, ThinkingPanel } from '../components/ChatIndicators';
import { saveNovel } from '../lib/storage';
import type { NovelProject } from '../types/novel';


type Props = any;
type Msg = { role: 'user' | 'assistant' | 'system'; content: string; provider?: string; thinking?: string };

export default function HomeScreen({ navigation, route }: Props) {
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'system', content: '你是妙笔AI写作助手。你拥有完整的对话记忆，能记住用户说过的每一句话。你擅长小说创作、文案写作、故事构思。回答时要：1）记住上下文，不要重复问用户已经说过的信息；2）主动思考，给出有深度的建议而不是简单回复；3）如果用户在创作中，主动推进剧情发展；4）用简体中文直接回答，不要解释规则。' },
    { role: 'assistant', content: '你好！我是妙笔AI写作助手。告诉我你想写什么，我会记住你说的每一句话，帮你创作。' },
  ]);

  // 处理 BookDetail "AI 解读" 跳转携带的 prompt
  const pendingAiPrompt = route?.params?.aiPrompt as string | undefined;
  useEffect(() => {
    if (pendingAiPrompt) {
      setInput(pendingAiPrompt);
      setTimeout(() => send(pendingAiPrompt), 120);
      navigation.setParams({ aiPrompt: undefined });
    }
  }, [pendingAiPrompt]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState('');
  const [model, setModel] = useState('auto');
  const [streaming, setStreaming] = useState('');
  const [thinking, setThinking] = useState('');
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [userScrolling, setUserScrolling] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{msg: Msg; idx: number; x: number; y: number} | null>(null);
  const scrollRef = useRef<FlatList>(null);
  const abortRef = useRef<AbortController | null>(null);
  const agentSessionRef = useRef(createAgentSession());

  const CHAT_KEY = 'miaobi.homeChat';

  useEffect(() => {
    if (!messages.length) return;
    const withoutSystem = messages.filter(m => m.role !== 'system');
    const SYSTEM_MSG: Msg = { role: 'system', content: '你是妙笔AI写作助手。你拥有完整的对话记忆，能记住用户说过的每一句话。你擅长小说创作、文案写作、故事构思。回答时要：1）记住上下文，不要重复问用户已经说过的信息；2）主动思考，给出有深度的建议而不是简单回复；3）如果用户在创作中，主动推进剧情发展；4）用简体中文直接回答，不要解释规则。' };
    const toSave = [SYSTEM_MSG, ...withoutSystem].slice(-50);
    AsyncStorage.setItem(CHAT_KEY, JSON.stringify(toSave));
  }, [messages]);

  useFocusEffect(useCallback(() => {
    AsyncStorage.getItem('miaobi.searchHistory').then(raw => { if (raw) try { setSearchHistory(JSON.parse(raw).slice(0, 10)); } catch {} });
    AsyncStorage.getItem(CHAT_KEY).then(raw => {
      if (raw) {
        try {
          const saved = JSON.parse(raw);
          if (Array.isArray(saved) && saved.length) {
            const SYSTEM_MSG: Msg = { role: 'system', content: '你是妙笔AI写作助手。你拥有完整的对话记忆，能记住用户说过的每一句话。你擅长小说创作、文案写作、故事构思。回答时要：1）记住上下文，不要重复问用户已经说过的信息；2）主动思考，给出有深度的建议而不是简单回复；3）如果用户在创作中，主动推进剧情发展；4）用简体中文直接回答，不要解释规则。' };
            const hasSystem = saved[0]?.role === 'system';
            setMessages(hasSystem ? saved : [SYSTEM_MSG, ...saved]);
          }
        } catch {}
      }
    });
  }, []));



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
    setThinking('');
    let streamedContent = '';
    let streamedThinking = '';
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      
      // 使用 Agent 引擎（支持工具调用）
      const agentResult = await agentExecute(
        agentSessionRef.current,
        msg,
        {
          signal: ctrl.signal,
          providerOverride: model.startsWith('local:') ? 'local' : model.startsWith('cloud:') ? 'cloud' : undefined,
          modelOverride: model === 'auto' ? undefined : model.replace(/^(?:local|cloud):/, ''),
          onToolCall: (tool) => {
            setStreaming(`🔧 正在调用 ${tool}...`);
          },
          onContent: (delta) => {
            streamedContent += delta;
            setStreaming(streamedContent);
            if (!userScrolling) setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 10);
          },
          onThinking: (delta) => {
            streamedThinking += delta;
            setThinking(streamedThinking);
          },
        }
      );
      
      if (ctrl.signal.aborted) {
        setMessages(prev => [...prev, { role: 'assistant', content: '（已停止）' }]);
        return;
      }
      const finalContent = agentResult.reply || streamedContent || '没有回复内容';
      const toolInfo = agentResult.toolsUsed > 0 ? ` [工具×${agentResult.toolsUsed}]` : '';
      const providerInfo = agentResult.provider || `agent:${agentResult.steps}步`;
      setMessages(prev => {
        const filtered = prev.filter(m => m.role !== 'assistant' || m.content !== '');
        return [...filtered, { role: 'assistant', content: finalContent + toolInfo, provider: providerInfo, thinking: streamedThinking }];
      });
    } catch (e: any) {
      if (ctrl.signal.aborted) return;
      setMessages(prev => [...prev, { role: 'assistant', content: `错误：${e.message}` }]);
    } finally {
      setLoading(false);
      setStreaming('');
      setThinking('');
      setTimeout(() => { if (!userScrolling) scrollRef.current?.scrollToEnd({ animated: true }); }, 100);
      setUserScrolling(false);
      if (msg.length > 1 && !searchHistory.includes(msg)) {
        const newHistory = [msg, ...searchHistory].slice(0, 10);
        setSearchHistory(newHistory);
        AsyncStorage.setItem('miaobi.searchHistory', JSON.stringify(newHistory));
      }
    }
  };

  const renderMsg = ({ item, index }: { item: Msg; index: number }) => {
    if (item.role === 'system') return null;
    const msgId = `${index}`;
    const isSaved = copiedId === 'saved_' + msgId;
    return (
      <View>
        <TouchableOpacity
          activeOpacity={0.85}
          onLongPress={(e) => {
            const { pageX, pageY } = e.nativeEvent;
            setCtxMenu({ msg: item, idx: index, x: pageX, y: pageY });
          }}
          style={[s.bubble, item.role === 'user' ? s.userBubble : s.aiBubble]}
        >
          {item.role === 'assistant' && <View style={s.avatar}><Text style={s.avatarText}>AI</Text></View>}
          <View style={{ flex: 1 }}>
            {item.role === 'assistant' && item.thinking ? <ThinkingPanel text={item.thinking} /> : null}
            <Text style={[s.bubbleText, item.role === 'user' && s.userText]}>{item.content}</Text>
            {item.provider ? <Text style={s.msgProvider}>{item.provider}</Text> : null}
          </View>
        </TouchableOpacity>
        {item.role === 'assistant' && item.content.trim().length > 0 && (
          <TouchableOpacity
            style={s.saveOutsideBtn}
            onPress={async () => {
              try {
                const { saveAiContent } = await import('../lib/library');
                await saveAiContent('AI 创作 · ' + new Date().toLocaleDateString(), item.content);
                setCopiedId('saved_' + msgId);
                setTimeout(() => setCopiedId(null), 2000);
              } catch (e) { /* silent */ }
            }}
          >
            <Text style={s.saveOutsideText}>{isSaved ? '✓ 已保存到书架' : '生成正文'}</Text>
          </TouchableOpacity>
        )}
        {item.role === 'assistant' && item.content.startsWith('错误：') && (
          <TouchableOpacity
            style={s.retryBtn}
            onPress={() => {
              const lastUser = [...messages].reverse().find(m => m.role === 'user');
              if (lastUser) send(lastUser.content);
            }}
          >
            <Text style={s.retryText}>↻ 重试</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={T.bg} />

<KeyboardAvoidingView style={s.main} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}>
        <View style={s.header}>
          <View style={{ flex: 1 }} />
          <Text style={s.headerTitle}>妙笔</Text>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <TouchableOpacity onPress={() => setShowMenu(!showMenu)} style={s.menuBtn}>
              <Icon.more size={20} color={T.text} />
            </TouchableOpacity>
          </View>
        </View>
        {showMenu && (
          <>
          <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 30 }} onPress={() => setShowMenu(false)} />
          <View style={[s.headerMenu, { zIndex: 31 }]}>
            <TouchableOpacity style={s.headerMenuItem} onPress={() => {
              const initial: Msg[] = [
                { role: 'system', content: '你是妙笔AI写作助手。你拥有完整的对话记忆，能记住用户说过的每一句话。你擅长小说创作、文案写作、故事构思。回答时要：1）记住上下文，不要重复问用户已经说过的信息；2）主动思考，给出有深度的建议而不是简单回复；3）如果用户在创作中，主动推进剧情发展；4）用简体中文直接回答，不要解释规则。' },
                { role: 'assistant', content: '你好！我是妙笔AI写作助手。告诉我你想写什么，我会记住你说的每一句话，帮你创作。' },
              ];
              setShowMenu(false);
              setMessages(initial);
              setInput('');
              AsyncStorage.setItem(CHAT_KEY, JSON.stringify(initial));
            }}>
              <Icon.add size={16} color={T.text} />
              <Text style={s.headerMenuText}>新建对话</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.headerMenuItem} onPress={async () => {
              setShowMenu(false);
              try {
                const text = messages.map(m => (m.role === 'user' ? '【我】' : '【AI】') + ': ' + m.content).join('\n\n');
                await Clipboard.setStringAsync(text);
              } catch {}
            }}>
              <Icon.save size={16} color={T.text} />
              <Text style={s.headerMenuText}>导出对话</Text>
            </TouchableOpacity>
          </View>
          </>
        )}


        <FlatList
          ref={scrollRef}
          data={messages}
          renderItem={renderMsg}
          keyExtractor={(_, i) => String(i)}
          style={{ flex: 1 }}
          contentContainerStyle={[s.chatArea, { paddingBottom: 16 }]}
          ListHeaderComponent={messages.filter(m => m.role === 'user').length === 0 ? (
            <View style={s.emptyWrap}>
              <Text style={s.emptyTitle}>开始创作</Text>
              <Text style={s.emptyHint}>试试这些开场：</Text>
              <View style={s.chipRow}>
                {[
                  '写一部都市小说的第一章',
                  '生成一个悬疑故事大纲',
                  '帮我设计小说人物小传',
                  '描写一段成年情侣的亲密场景',
                ].map(c => (
                  <TouchableOpacity key={c} style={s.emptyChip} onPress={() => send(c)}>
                    <Text style={s.emptyChipText}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : null}
          onScrollBeginDrag={() => setUserScrolling(true)}
          onScrollEndDrag={(e) => {
            const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
            const distFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
            if (distFromBottom < 80) {
              setUserScrolling(false);
              setShowScrollBtn(false);
            } else {
              setShowScrollBtn(true);
            }
          }}
          onScroll={(e) => {
            const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
            const distFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
            setShowScrollBtn(distFromBottom > 120);
          }}
          onContentSizeChange={() => {
            if (!userScrolling) scrollRef.current?.scrollToEnd({ animated: false });
          }}
          ListFooterComponent={loading ? (
            <View style={[s.bubble, s.aiBubble]}>
              <View style={s.avatar}><Text style={s.avatarText}>AI</Text></View>
              <View style={{ flex: 1 }}>
                {!!thinking && <ThinkingPanel text={thinking} streaming />}
                {streaming ? <Text style={s.bubbleText}>{streaming}</Text> : !thinking ? <GenerationDots label="正在构思" /> : null}
              </View>
            </View>
          ) : null}
        />

        {ctxMenu && (
          <>
            <Pressable style={s.ctxOverlay} onPress={() => setCtxMenu(null)} />
            <View style={[s.ctxMenu, { top: Math.min(ctxMenu.y, 300), left: Math.min(ctxMenu.x, 200) }]}>
              <TouchableOpacity style={s.ctxItem} onPress={async () => {
                await Clipboard.setStringAsync(ctxMenu.msg.content);
                setCtxMenu(null);
              }}>
                <Text style={s.ctxText}>复制</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.ctxItem} onPress={async () => {
                try { await Share.share({ message: ctxMenu.msg.content }); } catch {}
                setCtxMenu(null);
              }}>
                <Text style={s.ctxText}>分享</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.ctxItem} onPress={() => {
                const replyPrefix = ctxMenu.msg.role === 'assistant' ? `关于你说的"${ctxMenu.msg.content.slice(0, 30)}..."` : '';
                setInput(replyPrefix || ctxMenu.msg.content);
                setCtxMenu(null);
              }}>
                <Text style={s.ctxText}>回复</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
        {/* Input area - ChatGPT style */}
        <View style={s.inputWrap}>
          <View style={s.inputContainer}>
            <TextInput value={input} onChangeText={setInput} placeholder="输入消息..." placeholderTextColor={T.textMuted} multiline maxLength={12000} scrollEnabled blurOnSubmit={false} keyboardAppearance="dark" style={s.input} textAlignVertical="top" />
            <View style={s.inputFooter}>
              <TouchableOpacity style={s.modelBtn} onPress={() => setShowModelPicker(true)}>
                <Text style={s.modelBtnLabel} numberOfLines={1}>{model === 'auto' ? '智能' : model.replace(/^local:/, '本·').replace(/^cloud:/, '云·')}</Text>
                <Text style={s.modelBtnArrow}>▾</Text>
              </TouchableOpacity>
              <View style={{ flex: 1 }} />
              {loading ? (
                <TouchableOpacity style={s.stopBtn} onPress={() => { abortRef.current?.abort(); setLoading(false); setStreaming(''); setThinking(''); }}>
                  <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: T.white }} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity accessibilityLabel="发送" disabled={!input.trim()} style={[s.sendBtn, !input.trim() && s.sendDisabled]} onPress={() => send()}>
                  <Icon.send size={18} color={'#111'} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
        {showScrollBtn && (
          <TouchableOpacity style={s.scrollBtnOverlay} onPress={() => {
            scrollRef.current?.scrollToEnd({ animated: true });
            setShowScrollBtn(false);
            setUserScrolling(false);
          }}>
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: T.surface2, borderWidth: 1, borderColor: T.border, alignItems: 'center', justifyContent: 'center', elevation: 4 }}>
              <Icon.down size={14} color={T.textSecondary} />
            </View>
          </TouchableOpacity>
        )}
        <ModelPicker visible={showModelPicker} selectedId={model} onClose={() => setShowModelPicker(false)} onSelect={(opt) => { setModel(opt.id); setShowModelPicker(false); }} />

        
      </KeyboardAvoidingView>
    </View>
  );
}

const s: any = {
  container: { flex: 1, backgroundColor: T.bg },
  drawerIcon: { fontSize: 16, marginRight: 14, width: 24, textAlign: 'center' },
  main: { flex: 1 },
  header: { paddingTop: 50, paddingBottom: 8, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  menuBtn: { width: 37, height: 37, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: T.text, fontSize: 18, fontWeight: '800', textAlign: 'center' },
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
  inputWrap: { paddingHorizontal: 12, paddingBottom: 8, paddingTop: 4, backgroundColor: T.bg },
  modelBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 22, paddingHorizontal: 8, borderRadius: 10, backgroundColor: T.surface },
  modelBtnLabel: { color: T.textMuted, fontSize: 10, fontWeight: '600' },
  modelBtnArrow: { color: T.textDim, fontSize: 8 },
  inputContainer: { backgroundColor: T.surface2, borderRadius: 20, borderWidth: 1, borderColor: T.border, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 8 },
  inputFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  input: { flex: 1, color: T.text, fontSize: 15, maxHeight: 160, paddingHorizontal: 4, paddingTop: 4, paddingBottom: 4, lineHeight: 22, minHeight: 48 },
  sendBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', elevation: 2 },
  stopBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#666666', alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { opacity: 0.3 },
  scrollBtn: { position: 'absolute', right: 20, bottom: 80, width: 36, height: 36, borderRadius: 18, backgroundColor: T.surface2, borderWidth: 1, borderColor: T.border, alignItems: 'center', justifyContent: 'center', elevation: 3, zIndex: 10 },
  scrollBtnOverlay: { position: 'absolute', right: 16, bottom: 100, zIndex: 20, elevation: 5 },
  ctxOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 },
  ctxMenu: { position: 'absolute', zIndex: 101, backgroundColor: T.surface, borderRadius: 12, borderWidth: 1, borderColor: T.border, paddingVertical: 4, minWidth: 100, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 8 },
  ctxItem: { paddingHorizontal: 16, paddingVertical: 10 },
  ctxText: { color: T.text, fontSize: 14, fontWeight: '500' },
  saveOutsideBtn: { alignSelf: 'flex-start', marginLeft: 32, marginTop: 2, marginBottom: 8, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: T.surface2, borderWidth: 1, borderColor: T.border },
  saveOutsideText: { color: T.textMuted, fontSize: 11, fontWeight: '500' },
  retryBtn: { alignSelf: 'flex-start', marginLeft: 32, marginTop: 2, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, backgroundColor: T.surface2, borderWidth: 1, borderColor: T.error },
  retryText: { color: T.error, fontSize: 12, fontWeight: '700' },
  emptyWrap: { paddingHorizontal: 16, paddingVertical: 24, alignItems: 'center' },
  emptyTitle: { color: T.text, fontSize: 18, fontWeight: '800', marginBottom: 6 },
  emptyHint: { color: T.textMuted, fontSize: 13, marginBottom: 16 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  emptyChip: { backgroundColor: T.surface2, borderRadius: 16, borderWidth: 1, borderColor: T.border, paddingHorizontal: 14, paddingVertical: 8 },
  emptyChipText: { color: T.text, fontSize: 12, fontWeight: '600' },
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
