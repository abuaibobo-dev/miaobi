import React, { useRef, useState } from 'react';
import {
  Keyboard, KeyboardAvoidingView, Platform, ScrollView,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { T } from '../lib/theme';
import { Icon } from '../lib/icons';
import { chatCompletion, detectIntent } from '../lib/llm';
import ModelPicker from '../components/ModelPicker';
import { GenerationDots, ThinkingPanel } from '../components/ChatIndicators';
import { getCharacters, getChapters, getNovels, saveChapter, saveNovel } from '../lib/storage';
import type { Chapter, NovelProject } from '../types/novel';

type Msg = { role: 'user' | 'assistant'; content: string; provider?: string; thinking?: string };



const WORKFLOW = [
  { key: 'setting', label: '世界设定' },
  { key: 'characters', label: '人物小传' },
  { key: 'outline', label: '故事大纲' },
  { key: 'chapter', label: '写下一章' },
  { key: 'polish', label: '润色改写' },
  { key: 'export', label: '导出成书' },
] as const;

export default function WritingScreen({ navigation, route }: any) {
  const novelId = route?.params?.novelId as string | undefined;
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'assistant', content: '你好！我是 AI 写作助手。告诉我你想写什么，我可以帮你创作、续写、润色或提供灵感。' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState('');
  const [thinking, setThinking] = useState('');
  const [model, setModel] = useState('auto');
  const [provider, setProvider] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [workflowCollapsed, setWorkflowCollapsed] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createGenre, setCreateGenre] = useState('');
  const [createSynopsis, setCreateSynopsis] = useState('');
  const [showChapters, setShowChapters] = useState(false);
  const [editingChapter, setEditingChapter] = useState<Chapter | null>(null);
  const [editBody, setEditBody] = useState('');

  const saveChapterEdit = async () => {
    if (!editingChapter) return;
    const updated: Chapter = {
      ...editingChapter,
      body: editBody,
      summary: editBody.slice(0, 220),
      wordCount: editBody.replace(/\s/g, '').length,
      updatedAt: new Date().toISOString(),
    };
    await saveChapter(updated);
    setChapters(prev => prev.map(ch => ch.id === updated.id ? updated : ch));
    setEditingChapter(null);
    setMessages(prev => [...prev, { role: 'assistant', content: `已保存第${updated.chapterNumber}章《${updated.title}》的修改（上一版本已自动存档）。` }]);
  };

  const createNovel = async () => {
    const title = createTitle.trim();
    if (!title) return;
    const id = `novel_${Date.now()}`;
    const now = new Date().toISOString();
    const project: NovelProject = {
      id, title, genre: createGenre.trim() || '都市', synopsis: createSynopsis.trim(),
      styleGuide: '', totalVolumes: 1, currentVolume: 1, totalChapters: 0, createdAt: now, updatedAt: now,
    };
    await saveNovel(project);
    setNovel(project);
    setChapters([]);
    navigation.setParams({ novelId: id });
    setCreateTitle(''); setCreateGenre(''); setCreateSynopsis('');
    setMessages([{ role: 'assistant', content: `《${title}》已创建。建议从「人物小传」或「故事大纲」开始，或直接让我写第一章。` }]);
  };
  const [userScrolling, setUserScrolling] = useState(false);
  const [novel, setNovel] = useState<NovelProject | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const CHAT_KEY = novelId ? `miaobi.writingChat.${novelId}` : 'miaobi.writingChat';
  const scrollRef = useRef<ScrollView>(null);
  const abortRef = useRef<AbortController | null>(null);

  React.useEffect(() => {
    AsyncStorage.getItem(CHAT_KEY).then(raw => {
      if (raw) { try { const s = JSON.parse(raw); if (Array.isArray(s) && s.length) setMessages(s); } catch {} }
    });
  }, [CHAT_KEY]);

  React.useEffect(() => {
    if (!novelId) {
      getNovels().then(items => {
        const latest = [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
        if (latest) navigation.setParams({ novelId: latest.id });
      });
      return;
    }
    Promise.all([getNovels(), getChapters(novelId)]).then(([novels, savedChapters]) => {
      const project = novels.find(item => item.id === novelId) || null;
      setNovel(project);
      setChapters(savedChapters);
      if (project && savedChapters.length === 0) {
        setMessages([{ role: 'assistant', content: `《${project.title}》已建立。建议依次完成人物、世界设定和故事大纲，然后开始第一章。` }]);
        setInput(`请为${project.genre}小说《${project.title}》制定故事大纲。简介：${project.synopsis || '暂未填写'}。`);
      }
    });
  }, [novelId]);

  const useWorkflow = async (key: typeof WORKFLOW[number]['key']) => {
    if (key === 'export') {
      if (!novel || !chapters.length) {
        setInput('请先创建小说项目并写出章节，再导出成书。');
        return;
      }
      const { exportAsTxt } = await import('../lib/export');
      try {
        await exportAsTxt(novel.id);
      } catch (e) {
        setInput(`导出失败：${(e as Error).message}`);
      }
      return;
    }
    if (!novel) {
      setInput(key === 'polish' ? '请润色下面这段文字：\n' : '请先帮我构思一部小说。');
      return;
    }
    const base = `小说《${novel.title}》，类型：${novel.genre}，简介：${novel.synopsis || '暂无'}。`;
    const recent = chapters.slice(-3).map(ch => `第${ch.chapterNumber}章《${ch.title}》摘要：${ch.summary || ch.body.slice(0, 160)}`).join('\n');
    const prompts = {
      setting: `${base}\n请建立可持续长篇创作的世界设定，包括时代背景、规则、地点、势力和核心冲突。`,
      characters: `${base}\n请设计主要人物小传，包括目标、动机、缺陷、关系、成长弧线和说话特点。`,
      outline: `${base}\n请给出完整故事大纲，按卷和章节列出关键事件、转折、伏笔与高潮。`,
      chapter: `${base}\n${recent ? `已有章节：\n${recent}\n` : ''}请创作第${chapters.length + 1}章，保持前文一致，输出章节标题和正文。`,
      polish: '请在保留剧情、人物口吻和信息的前提下润色下面文字，提升节奏、画面和语言质感：\n',
    };
    setInput(prompts[key]);
  };

  const saveAsChapter = async (content: string) => {
    if (!novel || !content.trim() || content.startsWith('错误：')) return;
    const firstLine = content.trim().split('\n')[0].replace(/^#+\s*/, '').trim();
    const chapterNumber = chapters.length + 1;
    const now = new Date().toISOString();
    const chapter: Chapter = {
      id: `chapter_${novel.id}_${Date.now()}`,
      novelId: novel.id,
      volumeNumber: novel.currentVolume || 1,
      chapterNumber,
      title: firstLine.length <= 50 ? firstLine.replace(/^第[^章]*章\s*/, '') || `第${chapterNumber}章` : `第${chapterNumber}章`,
      body: content.trim(),
      summary: content.trim().slice(0, 220),
      status: 'drafting',
      wordCount: content.replace(/\s/g, '').length,
      createdAt: now,
    };
    await saveChapter(chapter);
    const nextNovel = { ...novel, totalChapters: chapterNumber, updatedAt: now };
    await saveNovel(nextNovel);
    setNovel(nextNovel);
    setChapters(prev => [...prev, chapter]);
  };

  const copyMsg = async (text: string, id: string) => {
    try {
      await Clipboard.setStringAsync(text);
      setCopiedId(id);
    } catch {
      setCopiedId(`error_${id}`);
    } finally {
      setTimeout(() => setCopiedId(null), 1800);
    }
  };

  const buildNovelContext = async () => {
    if (!novel) return null;
    const chars = await getCharacters(novel.id);
    const charLines = chars.slice(0, 8).map(c => `· ${c.name}：${(c.traits || c.backstory || '').slice(0, 120)}`).join('\n');
    const recent = chapters.slice(-3).map(ch => `第${ch.chapterNumber}章《${ch.title}》：${ch.summary || ch.body.slice(0, 160)}`).join('\n');
    return [
      `【作品设定】类型：${novel.genre}；简介：${novel.synopsis || '暂无'}`,
      charLines ? `【主要人物】\n${charLines}` : '',
      recent ? `【前文摘要】\n${recent}` : '',
      '请在创作中与以上设定、人物和前文保持一致。',
    ].filter(Boolean).join('\n\n');
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
    setThinking('');
    let streamedContent = '';
    let streamedThinking = '';
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const intent = detectIntent(text);
      const ctx = await buildNovelContext();
      const ctxMsgs: Array<{ role: 'system'; content: string }> = ctx ? [{ role: 'system', content: ctx }] : [];
      const result = await chatCompletion(
        [...ctxMsgs, ...history.map(m => ({ role: m.role, content: m.content }))],
        {
          intent,
          providerOverride: model.startsWith('local:') ? 'local' : model.startsWith('cloud:') ? 'cloud' : undefined,
          modelOverride: model === 'auto' ? undefined : model.replace(/^(?:local|cloud):/, ''),
          onProvider: (p) => setProvider(p),
          onContent: (delta) => {
            streamedContent += delta;
            setStreaming(streamedContent);
            if (!userScrolling) setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 10);
          },
          onThinking: (delta) => {
            streamedThinking += delta;
            setThinking(streamedThinking);
          },
        },
        controller.signal,
      );
      if (controller.signal.aborted) {
        setMessages(prev => [...prev, { role: 'assistant', content: '（已停止）' }]);
        return;
      }
      const finalContent = streamedContent || result.content || (result.error ? `错误：${result.error}` : '没有回复内容');
      setMessages(prev => {
        const filtered = prev.filter(m => m.role !== 'assistant' || m.content !== '');
        return [...filtered, { role: 'assistant', content: finalContent, provider: result.provider, thinking: streamedThinking || result.thinking }];
      });
    } catch (e: any) {
      if (controller.signal.aborted) return;
      setMessages(prev => [...prev, { role: 'assistant', content: `错误：${e.message}` }]);
    } finally {
      abortRef.current = null;
      setLoading(false);
      setStreaming('');
      setThinking('');
      setTimeout(() => { if (!userScrolling) scrollRef.current?.scrollToEnd({ animated: true }); }, 100);
      setMessages(prev => { AsyncStorage.setItem(CHAT_KEY, JSON.stringify(prev.slice(-50))); return prev; });
    }
  };

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backText}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={s.headerTitle}>{novel?.title || 'AI 写作'}</Text>
          {novel ? <Text style={s.projectMeta}>{novel.genre} · 已保存 {chapters.length} 章</Text> : null}
        </View>
        <TouchableOpacity onPress={() => {
          const initial: Msg[] = [{ role: 'assistant', content: '你好！我是 AI 写作助手。告诉我你想写什么。' }];
          setMessages(initial);
          setStreaming('');
          AsyncStorage.setItem(CHAT_KEY, JSON.stringify(initial));
        }} style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
          <Text style={{ color: T.textMuted, fontSize: 12 }}>新对话</Text>
        </TouchableOpacity>
      </View>
      {!novel && (
        <View style={s.createCard}>
          <Text style={s.createTitle}>创建小说项目</Text>
          <TextInput value={createTitle} onChangeText={setCreateTitle} placeholder="作品名（必填）" placeholderTextColor={T.textDim} style={s.createInput} />
          <TextInput value={createGenre} onChangeText={setCreateGenre} placeholder="类型：都市 / 悬疑 / 玄幻…" placeholderTextColor={T.textDim} style={s.createInput} />
          <TextInput value={createSynopsis} onChangeText={setCreateSynopsis} placeholder="一句话简介" placeholderTextColor={T.textDim} style={[s.createInput, { minHeight: 56, textAlignVertical: 'top' }]} multiline />
          <TouchableOpacity style={s.createBtn} onPress={createNovel}>
            <Text style={s.createBtnText}>创建并开始创作</Text>
          </TouchableOpacity>
        </View>
      )}
      {novel && chapters.length > 0 && (
        <View style={s.chapterBar}>
          <TouchableOpacity onPress={() => setShowChapters(v => !v)}>
            <Text style={s.chapterBarText}>📚 章节（{chapters.length}）{showChapters ? ' ▲' : ' ▼'}</Text>
          </TouchableOpacity>
          {showChapters && (
            <View style={s.chapterList}>
              {chapters.map(ch => (
                <TouchableOpacity key={ch.id} style={s.chapterRow} onPress={() => { setEditingChapter(ch); setEditBody(ch.body); setShowChapters(false); }}>
                  <Text style={s.chapterRowText} numberOfLines={1}>第{ch.chapterNumber}章 {ch.title}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}
      {editingChapter && (
        <View style={s.editCard}>
          <Text style={s.editTitle}>编辑：第{editingChapter.chapterNumber}章 {editingChapter.title}</Text>
          <TextInput value={editBody} onChangeText={setEditBody} multiline placeholder="正文…" placeholderTextColor={T.textDim} style={[s.createInput, { minHeight: 120, textAlignVertical: 'top' }]} />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
            <TouchableOpacity style={[s.createBtn, { flex: 1 }]} onPress={saveChapterEdit}><Text style={s.createBtnText}>保存修改</Text></TouchableOpacity>
            <TouchableOpacity style={[s.createBtn, { flex: 1, backgroundColor: T.surface }]} onPress={() => setEditingChapter(null)}><Text style={[s.createBtnText, { color: T.text }]}>取消</Text></TouchableOpacity>
          </View>
        </View>
      )}
      {workflowCollapsed ? (
        <TouchableOpacity style={s.workflowToggle} onPress={() => setWorkflowCollapsed(false)}>
          <Text style={s.workflowToggleText}>⋯ 工作流</Text>
        </TouchableOpacity>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.workflowRow} keyboardShouldPersistTaps="handled">
            {WORKFLOW.map(item => <TouchableOpacity key={item.key} style={s.workflowBtn} onPress={() => useWorkflow(item.key)}><Text style={s.workflowText}>{item.label}</Text></TouchableOpacity>)}
          </ScrollView>
          <TouchableOpacity onPress={() => setWorkflowCollapsed(true)} style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
            <Text style={{ color: T.textMuted, fontSize: 10 }}>▲收起</Text>
          </TouchableOpacity>
        </View>
      )}
      <ScrollView ref={scrollRef} contentContainerStyle={s.messages} onContentSizeChange={() => { if (!userScrolling) scrollRef.current?.scrollToEnd({ animated: true }); }}>
        {messages.map((msg, i) => (
          <View key={i} style={[s.bubble, msg.role === 'user' ? s.userBubble : s.aiBubble]}>
            {msg.role === 'assistant' && <View style={s.avatar}><Text style={s.avatarText}>AI</Text></View>}
            <View style={{ flex: 1 }}>
              {msg.role === 'assistant' && msg.thinking ? <ThinkingPanel text={msg.thinking} /> : null}
              <Text style={[s.bubbleText, msg.role === 'user' && s.userText]}>{msg.content}</Text>
              {msg.role === 'user' && msg.content.length > 5 && (
                <TouchableOpacity style={{ alignSelf: 'flex-start', marginTop: 4 }} onPress={() => Clipboard.setStringAsync(msg.content)}>
                  <Text style={{ color: T.textMuted, fontSize: 9 }}>❏❏ 复制</Text>
                </TouchableOpacity>
              )}
              {msg.role === 'assistant' && msg.content.trim().length > 0 && (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                  <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }} onPress={() => copyMsg(msg.content, String(i))}>
                    <Text style={{ fontSize: 10, color: T.textMuted }}>❏❏</Text>
                    <Text style={{ color: T.textMuted, fontSize: 9 }}>{copiedId === String(i) ? '✓ 已复制' : '复制'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }} onPress={async () => {
                    try {
                      if (novel) await saveAsChapter(msg.content);
                      else {
                        const { saveAiContent } = await import('../lib/library');
                        await saveAiContent('AI 创作 · ' + new Date().toLocaleDateString(), msg.content);
                      }
                      setCopiedId('saved_' + String(i));
                      setTimeout(() => setCopiedId(null), 2000);
                    } catch (e) { /* silent */ }
                  }}>
                    <Text style={{ color: T.textMuted, fontSize: 9 }}>{copiedId === 'saved_' + String(i) ? '✓ 已生成' : '生成正文'}</Text>
                  </TouchableOpacity>
                </View>
              )}
              {msg.provider ? <Text style={s.msgProvider}>{msg.provider}</Text> : null}
            </View>
          </View>
        ))}
        {loading ? (
          <View style={[s.bubble, s.aiBubble]}>
            {!!thinking && <ThinkingPanel text={thinking} streaming />}
            {streaming ? <Text style={s.bubbleText}>{streaming}</Text> : !thinking ? <GenerationDots label="正在构思" /> : null}
          </View>
        ) : null}
      </ScrollView>
      <View style={s.inputWrap}>
        <View style={s.toolbarRow}>
          <TouchableOpacity style={s.modelBtn} onPress={() => setShowModelPicker(true)}>
            <Text style={s.modelBtnLabel} numberOfLines={1}>{model === 'auto' ? '智能' : model.replace(/^local:/, '本·').replace(/^cloud:/, '云·')}</Text>
            <Text style={s.modelBtnArrow}>▾</Text>
          </TouchableOpacity>
        </View>
        <View style={s.inputContainer}>
          <View style={s.inputBody}>
            <TextInput value={input} onChangeText={setInput} placeholder="描述剧情、人物或粘贴待润色正文..." placeholderTextColor={T.textMuted} multiline maxLength={12000} scrollEnabled blurOnSubmit={false} keyboardAppearance="dark" style={s.input} textAlignVertical="top" />
              {loading ? (
                <TouchableOpacity style={s.stopBtn} onPress={() => { abortRef.current?.abort(); setLoading(false); setStreaming(''); setThinking(''); }}>
                  <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: T.white }} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity disabled={!input.trim()} style={[s.sendBtn, !input.trim() && s.sendDisabled]} onPress={() => send()}>
                  <Icon.send size={18} color={'#111'} />
                </TouchableOpacity>
              )}
          </View>
        </View>
      </View>
      <ModelPicker visible={showModelPicker} selectedId={model} onClose={() => setShowModelPicker(false)} onSelect={(opt) => { setModel(opt.id); setShowModelPicker(false); }} />
    </KeyboardAvoidingView>
  );
}

const s: any = {
  container: { flex: 1, backgroundColor: T.bg },
  header: { paddingTop: 50, paddingBottom: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: T.bg, borderBottomWidth: 1, borderBottomColor: T.border },
  backBtn: { width: 37, height: 37, alignItems: 'center', justifyContent: 'center' },
  backText: { color: T.text, fontSize: 20 },
  headerTitle: { color: T.text, fontSize: 18, fontWeight: '700', flex: 1, textAlign: 'center' },
  projectMeta: { color: T.textMuted, fontSize: 9, marginTop: 2 },
  workflowRow: { paddingHorizontal: 12, paddingVertical: 8, gap: 7 },
  workflowToggle: { alignSelf: 'flex-start', margin: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: T.surface2, borderWidth: 1, borderColor: T.border },
  workflowToggleText: { color: T.textMuted, fontSize: 12, fontWeight: '600' },
  createCard: { margin: 10, padding: 14, borderRadius: 12, backgroundColor: T.surface2, borderWidth: 1, borderColor: T.border, gap: 8 },
  createTitle: { color: T.text, fontSize: 15, fontWeight: '800', marginBottom: 2 },
  createInput: { color: T.text, fontSize: 13, backgroundColor: T.surface, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: T.border },
  createBtn: { backgroundColor: T.white, borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginTop: 2 },
  createBtnText: { color: T.black, fontSize: 13, fontWeight: '700' },
  chapterBar: { marginHorizontal: 10, marginBottom: 4 },
  chapterBarText: { color: T.textSecondary, fontSize: 13, fontWeight: '700', paddingVertical: 8, paddingHorizontal: 2 },
  chapterList: { backgroundColor: T.surface2, borderRadius: 10, borderWidth: 1, borderColor: T.border, padding: 6, gap: 2 },
  chapterRow: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 6 },
  chapterRowText: { color: T.text, fontSize: 12 },
  editCard: { margin: 10, padding: 14, borderRadius: 12, backgroundColor: T.surface2, borderWidth: 1, borderColor: T.border, gap: 8 },
  editTitle: { color: T.text, fontSize: 13, fontWeight: '700' },
  workflowBtn: { height: 30, paddingHorizontal: 12, borderRadius: 15, justifyContent: 'center', backgroundColor: T.surface2, borderWidth: 1, borderColor: T.border },
  workflowText: { color: T.textSecondary, fontSize: 11, fontWeight: '600' },
  messages: { padding: 16, paddingBottom: 8 },
  bubble: { maxWidth: '85%', padding: 12, borderRadius: T.radius, marginBottom: 8, flexDirection: 'row' },
  userBubble: { alignSelf: 'flex-end', backgroundColor: T.bubbleUser, borderBottomRightRadius: 4 },
  aiBubble: { alignSelf: 'flex-start', backgroundColor: T.bubbleAI, borderBottomLeftRadius: 4 },
  avatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: T.surface2, alignItems: 'center', justifyContent: 'center', marginRight: 8, marginTop: 2 },
  avatarText: { color: T.grey, fontSize: 9, fontWeight: '700' },
  bubbleText: { color: T.text, fontSize: 15, lineHeight: 22, flex: 1 },
  userText: { color: T.text },
  msgProvider: { color: T.textDim, fontSize: 9, marginTop: 4 },
  inputWrap: { paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 16 : 10, paddingTop: 4, backgroundColor: T.bg },
  toolbarRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  modelBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 22, paddingHorizontal: 8, borderRadius: 10, backgroundColor: T.surface },
  modelBtnLabel: { color: T.textMuted, fontSize: 10, fontWeight: '600' },
  modelBtnArrow: { color: T.textDim, fontSize: 8 },
  inputContainer: { backgroundColor: T.surface2, borderRadius: 20, borderWidth: 1, borderColor: T.border, paddingHorizontal: 8, paddingTop: 6, paddingBottom: 6 },
  inputBody: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 4 },
  input: { flex: 1, color: T.text, fontSize: 15, maxHeight: 160, paddingHorizontal: 6, paddingTop: 8, paddingBottom: 8, lineHeight: 22, minHeight: 48 },
  sendBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', elevation: 2 },
  stopBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#666666', alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { opacity: 0.25 },
  copyBtn: { alignSelf: 'flex-end', marginTop: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: T.surface2, borderWidth: 1, borderColor: T.border },
  copyText: { color: T.textMuted, fontSize: 11, fontWeight: '600' },
};
