import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
// navigation types simplified
import { getChatHistory, appendChatMessage, clearChatHistory, getSettings } from '../lib/storage';
import { buildSystemPrompt, processPostWrite, addChapter } from '../lib/novelMemory';
import { chatCompletion } from '../lib/llm';
import type { ChatMessage } from '../types/novel';
import { v4 as uuid } from 'uuid';

const COLORS = {
  bg: '#0D0D0D', card: '#1A1A1A', border: '#2A2A2A',
  text: '#FFFFFF', sub: '#888888', accent: '#00FF41',
  userBg: '#1A2A1A', aiBg: '#1A1A1A', danger: '#FF0044',
};

type Props = any;

export default function ChatScreen({ navigation, route }: Props) {
  const { novelId } = route.params;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState('');
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    getChatHistory(novelId).then(setMessages);
  }, [novelId]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages, streaming]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = {
      id: uuid(),
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    await appendChatMessage(novelId, userMsg);

    // 构建上下文
    const novels = (await import('../lib/storage')).getNovels();
    const novel = (await novels).find(n => n.id === novelId);
    const nextCh = (novel?.totalChapters || 0) + 1;
    const systemPrompt = await buildSystemPrompt(novelId, nextCh);

    // 构建消息数组（最近 20 条 + 系统提示）
    const recentMsgs = messages.slice(-20);
    const apiMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...recentMsgs.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user' as const, content: text },
    ];

    try {
      const res = await chatCompletion(apiMessages);
      if (res.error) {
        Alert.alert('错误', res.error);
        setLoading(false);
        return;
      }

      const aiMsg: ChatMessage = {
        id: uuid(),
        role: 'assistant',
        content: res.content,
        timestamp: new Date().toISOString(),
      };

      setMessages(prev => [...prev, aiMsg]);
      await appendChatMessage(novelId, aiMsg);

      // 尝试解析 JSON 更新指令
      try {
        const jsonMatch = res.content.match(/```json\s*([\s\S]*?)```/);
        if (jsonMatch) {
          const update = JSON.parse(jsonMatch[1]);
          if (update.summary || update.characterChanges || update.newForeshadowing) {
            await processPostWrite(
              novelId, nextCh,
              update.summary || '',
              update.characterChanges || [],
              update.newForeshadowing || [],
              update.resolvedForeshadowing || []
            );
            // 保存为章节
            const lastUserMsg = recentMsgs.find(m => m.role === 'user');
            if (update.summary) {
              await addChapter(novelId, `第${nextCh}章`, res.content, update.summary);
            }
          }
        }
      } catch {}
    } catch (e: any) {
      Alert.alert('错误', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    Alert.alert('清空对话', '确定清空所有对话记录？', [
      { text: '取消', style: 'cancel' },
      {
        text: '清空', style: 'destructive',
        onPress: async () => {
          await clearChatHistory(novelId);
          setMessages([]);
        },
      },
    ]);
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}>
        {!isUser && <Text style={styles.aiLabel}>✍️ 妙笔</Text>}
        <Text style={[styles.bubbleText, isUser ? styles.userText : styles.aiText]}>
          {item.content}
        </Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backBtn}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>💬 写作对话</Text>
        <TouchableOpacity onPress={handleClear}>
          <Text style={styles.clearBtn}>🗑️</Text>
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messageList}
        ListFooterComponent={
          loading ? (
            <View style={styles.loadingBubble}>
              <ActivityIndicator color={COLORS.accent} size="small" />
              <Text style={styles.loadingText}>思考中...</Text>
            </View>
          ) : null
        }
      />

      {/* Input */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.textInput}
          value={input}
          onChangeText={setInput}
          placeholder="输入灵感、剧情、角色设定..."
          placeholderTextColor="#555"
          multiline
          maxLength={4000}
          editable={!loading}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={loading || !input.trim()}
        >
          <Text style={styles.sendBtnText}>↑</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 50, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: { fontSize: 14, color: COLORS.accent },
  topTitle: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  clearBtn: { fontSize: 16 },
  messageList: { padding: 16, paddingBottom: 8 },
  bubble: { marginBottom: 12, maxWidth: '88%' },
  userBubble: { alignSelf: 'flex-end', backgroundColor: COLORS.userBg, borderRadius: 16, borderTopRightRadius: 4, padding: 12 },
  aiBubble: { alignSelf: 'flex-start', backgroundColor: COLORS.aiBg, borderRadius: 16, borderTopLeftRadius: 4, padding: 12, borderWidth: 1, borderColor: COLORS.border },
  aiLabel: { fontSize: 11, color: COLORS.accent, marginBottom: 4, fontWeight: '600' },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  userText: { color: COLORS.text },
  aiText: { color: '#CCCCCC' },
  loadingBubble: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    backgroundColor: COLORS.aiBg, borderRadius: 16, padding: 12, marginBottom: 12,
    borderWidth: 1, borderColor: COLORS.border, gap: 8,
  },
  loadingText: { fontSize: 13, color: COLORS.sub },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', padding: 12,
    borderTopWidth: 1, borderTopColor: COLORS.border, gap: 8,
  },
  textInput: {
    flex: 1, backgroundColor: COLORS.card, borderRadius: 20, paddingHorizontal: 16,
    paddingVertical: 10, fontSize: 15, color: COLORS.text, maxHeight: 120,
    borderWidth: 1, borderColor: COLORS.border,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.accent,
    justifyContent: 'center', alignItems: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#333' },
  sendBtnText: { fontSize: 20, color: '#000', fontWeight: 'bold', marginTop: -1 },
});
