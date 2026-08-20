import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { T } from '../lib/theme';
import { Icon } from '../lib/icons';
import type { Chapter } from '../types/novel';

interface Props {
  chapters: Chapter[];
}

export default function StoryTimeline({ chapters }: Props) {
  if (chapters.length === 0) {
    return <View style={s.empty}><Text style={s.emptyText}>还没有章节</Text></View>;
  }

  return (
    <View style={s.container}>
      <View style={s.line} />
      {chapters.map((ch, idx) => {
        const isLast = idx === chapters.length - 1;
        const wordK = ch.wordCount > 1000 ? (ch.wordCount / 1000).toFixed(1) + 'k' : String(ch.wordCount);
        return (
          <View key={ch.id} style={s.item}>
            {/* 时间线节点 */}
            <View style={s.nodeCol}>
              <View style={[s.node, isLast && s.nodeLast]}>
                <Text style={s.nodeText}>{ch.chapterNumber}</Text>
              </View>
              {!isLast && <View style={s.connector} />}
            </View>

            {/* 内容 */}
            <View style={[s.content, isLast && s.contentLast]}>
              <Text style={s.title} numberOfLines={1}>第{ch.chapterNumber}章 {ch.title}</Text>
              <Text style={s.summary} numberOfLines={2}>{ch.summary || '暂无摘要'}</Text>
              <View style={s.meta}>
                <Text style={s.metaText}>{wordK}字</Text>
                <Text style={s.metaDot}>·</Text>
                <Text style={s.metaText}>{ch.volumeNumber}卷</Text>
                <Text style={s.metaDot}>·</Text>
                <Text style={[s.metaText, ch.status === 'completed' ? { color: T.accentGreen } : { color: T.accentOrange }]}>
                  {ch.status === 'completed' ? '已完成' : '草稿'}
                </Text>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  container: { padding: 16, paddingLeft: 12 },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { color: T.textMuted, fontSize: 14 },
  line: { position: 'absolute', left: 28, top: 16, bottom: 16, width: 2, backgroundColor: T.border },
  item: { flexDirection: 'row', marginBottom: 4 },
  nodeCol: { width: 40, alignItems: 'center' },
  node: { width: 28, height: 28, borderRadius: 14, backgroundColor: T.card, borderWidth: 2, borderColor: T.accent, justifyContent: 'center', alignItems: 'center', zIndex: 1 },
  nodeLast: { backgroundColor: T.accent, borderColor: T.accent },
  nodeText: { fontSize: 11, fontWeight: '700', color: T.text },
  connector: { width: 2, flex: 1, backgroundColor: T.border, marginTop: 4 },
  content: { flex: 1, backgroundColor: T.card, borderRadius: T.r.md, padding: 12, marginBottom: 8, marginLeft: 8, borderWidth: 1, borderColor: T.border },
  contentLast: { borderColor: T.accent + '40' },
  title: { fontSize: 14, fontWeight: '700', color: T.text, marginBottom: 4 },
  summary: { fontSize: 12, color: T.textSec, lineHeight: 17, marginBottom: 6 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 11, color: T.textMuted },
  metaDot: { fontSize: 11, color: T.textMuted },
});
