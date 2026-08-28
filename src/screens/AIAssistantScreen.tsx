import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, ScrollView,
  StatusBar, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { T } from '../lib/theme';
import * as Clipboard from 'expo-clipboard';
import { Icon } from '../lib/icons';
import { getSettings } from '../lib/storage';
import { searchAllSourcesWithCustom } from '../lib/bookSources';
import { addToShelf, getCustomSources, getLibrary } from '../lib/library';
import type { BookRecord } from '../types/book';

type Props = any;
type Msg = { role: 'user' | 'assistant'; content: string };

const QUICK = [
  '推荐几本适合现在读的书',
  '我想看节奏快、反转强的小说',
  '帮我找中文公版经典',
  '找和《三体》类似的科幻',
];

export default function AIAssistantScreen({ navigation, route }: Props) {
  const mode = route.params?.mode;
  const context = route.params?.context;
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<BookRecord[]>([]);
  const scrollRef = useRef<FlatList>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (mode === 'recommend') {
      send('请根据公开书源可能收录的作品，给我5本值得找来读的书，说明理由。不要编造不存在的书。');
    } else if (mode === 'interpret' && context?.book) {
      send(`请解读这本书：${context.book.title}，作者：${context.book.authors?.join(',')}。简介：${context.book.description || '无'}。从主题、适合人群、阅读建议三段回答。`);
    } else {
      setMessages([{ role: 'assistant', content: '你好，我可以帮你找书、比较书单、解释推荐理由或总结正文。' }]);
    }
  }, []);

  useEffect(() => { setTimeout(() => { try { scrollRef.current?.scrollToEnd({ animated: true }); } catch {} }, 80); }, [messages, loading]);

  const callAI = async (history: Msg[]): Promise<string> => {
    const settings = await getSettings() as any;
    if (!settings.apiKey) throw new Error('请先在设置中配置 DeepSeek API Key');
    const system = `你是书海App的执行大脑。返回JSON：{"reply":"给用户看的中文回答","actions":[{"type":"search","query":"...","category":"book|story|magazine|newspaper|art|all"},{"type":"openBook","title":"..."},{"type":"saveBook","title":"..."}]}。只在需要操作时加actions，否则actions为[]。真实存在作品才推荐。`;
    const response = await fetch(`${settings.baseUrl || 'https://api.deepseek.com'}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
      body: JSON.stringify({
        model: settings.model || 'deepseek-chat',
        temperature: 0.6,
        max_tokens: 1400,
        messages: [{ role: 'system', content: system }, ...history.slice(-12)],
      }),
      signal: AbortSignal.timeout(60000),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error?.message || `请求失败（${response.status}）`);
    return String(data.choices?.[0]?.message?.content || '{}').trim();
  };

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || loading) return;
    const userMsg: Msg = { role: 'user', content: text };
    const history = [...messages, userMsg];
    setMessages(history);
    setResults([]);
    setInput('');
    setLoading(true);
    try {
      let prompt = text;
      if (context?.book) prompt += `\n\n当前书籍：${JSON.stringify(context.book)}`;
      if (context?.shelf?.length) prompt += `\n\n我的书架：${JSON.stringify(context.shelf.slice(0, 20))}`;
      const raw = await callAI([...history.slice(0, -1), userMsg].map((msg, index, arr) => index === arr.length - 1 ? { ...msg, content: prompt } : msg));
      const parsed = parseBrain(raw);
      setMessages(prev => [...prev, { role: 'assistant', content: parsed.reply || raw || '没有返回内容' }]);
      let availableResults = results;
      for (const action of parsed.actions) {
        availableResults = await executeAction(action, availableResults);
      }
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: e.message || 'AI请求失败' }]);
    } finally {
      setLoading(false);
    }
  };

  const parseBrain = (raw: string) => {
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return { reply: raw, actions: [] as any[] };
      const parsed = JSON.parse(match[0]);
      return { reply: String(parsed.reply || ''), actions: Array.isArray(parsed.actions) ? parsed.actions : [] };
    } catch { return { reply: raw, actions: [] as any[] }; }
  };

  const executeAction = async (action: any, availableResults: BookRecord[]): Promise<BookRecord[]> => {
    if (action?.type === 'search' && action.query) {
      const custom = await getCustomSources();
      const response = await searchAllSourcesWithCustom([String(action.query)], action.category || 'all', custom);
      const nextResults = response.books.slice(0, 10);
      setResults(nextResults);
      return nextResults;
    }
    if (/^(openBook|saveBook)$/.test(action?.type) && action.title) {
      const library = await getLibrary();
      const target = availableResults.find(book => book.title.toLowerCase().includes(String(action.title).toLowerCase()))
        || library.find(book => book.title.toLowerCase().includes(String(action.title).toLowerCase()));
      if (!target) return availableResults;
      if (action.type === 'saveBook') await addToShelf(target);
      navigation.navigate('BookDetail', { book: target });
    }
    return availableResults;
  };

  const copyMsg = async (text: string, idx: number) => {
    const id = String(idx);
    try {
      await Clipboard.setStringAsync(text);
      setCopiedId(id);
    } catch {
      setCopiedId(`error_${id}`);
    } finally {
      setTimeout(() => setCopiedId(null), 1800);
    }
  };

  const openResult = async (book: BookRecord) => {
    await addToShelf(book);
    setResults([]);
    navigation.navigate('BookDetail', { book });
  };

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="light-content" backgroundColor={T.bg} />
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}><Icon.back size={19} color={T.text} /></TouchableOpacity>
        <Text style={s.title}>AI 找书助手</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Settings')}><Text style={s.settings}>设置</Text></TouchableOpacity>
      </View>

      <FlatList
        ref={scrollRef as any}
        data={messages}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={s.messages}
        renderItem={({ item: message, index }) => (
          <View style={[s.bubble, message.role === 'user' ? s.user : s.ai, { flexDirection: 'row', gap: 8 }]}>
            {message.role === 'assistant' && <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: T.surface2, alignItems: 'center', justifyContent: 'center', marginTop: 2 }}><Text style={{ color: T.grey, fontSize: 8, fontWeight: '700' }}>AI</Text></View>}
            <Text style={[s.messageText, message.role === 'user' && s.userText, { flex: 1 }]}>{message.content}</Text>
            {message.role === 'assistant' && message.content.trim().length > 0 && (
              <TouchableOpacity style={{ alignSelf: 'flex-end', marginTop: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: T.surface2 }} onPress={() => copyMsg(message.content, index)}>
                <Text style={{ color: T.textMuted, fontSize: 10, fontWeight: '600' }}>{copiedId === String(index) ? '✓ 已复制' : copiedId === `error_${index}` ? '复制失败' : '一键复制'}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        ListFooterComponent={<>
          {!!results.length && (
            <View style={s.resultBlock}>
              <Text style={s.resultLabel}>找到 {results.length} 本</Text>
              {results.map(book => (
                <TouchableOpacity key={book.id} style={s.resultCard} onPress={() => openResult(book)}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.resultTitle} numberOfLines={1}>{book.title}</Text>
                    <Text style={s.resultMeta} numberOfLines={1}>{book.sourceLabel}{book.authors.length ? ` · ${book.authors.join('/')}` : ''}</Text>
                  </View>
                  <Text style={s.openText}>打开</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {loading && <View style={[s.bubble, s.ai]}><ActivityIndicator color={T.text} /></View>}
        </>}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.quickWrap}>
        {QUICK.map(item => (
          <TouchableOpacity key={item} style={s.quick} onPress={() => send(item)}><Text style={s.quickText}>{item}</Text></TouchableOpacity>
        ))}
      </ScrollView>

      <View style={s.inputBar}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="描述你的口味、问题或书名"
          placeholderTextColor={T.textMuted}
          multiline
          maxLength={12000}
          scrollEnabled
          blurOnSubmit={false}
          keyboardAppearance="dark"
          textAlignVertical="top"
          style={s.input}
        />
        <TouchableOpacity disabled={!input.trim() || loading} style={[s.send, (!input.trim() || loading) && s.disabled]} onPress={() => send()}>
          <Icon.send size={18} color={T.black} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = require('./AIAssistantScreen.styles').default;
