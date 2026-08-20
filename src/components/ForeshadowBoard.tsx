import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { T } from '../lib/theme';
import { Icon } from '../lib/icons';
import type { Foreshadowing } from '../types/novel';

const STATUS_CONFIG: Record<string, { emoji: string; label: string; color: string; progress: number }> = {
  planted:    { emoji: '🌱', label: '已埋下', color: T.accentOrange, progress: 0.2 },
  developing: { emoji: '🌿', label: '发展中', color: T.accentBlue, progress: 0.5 },
  resolving:  { emoji: '🔄', label: '回收中', color: T.accentPink, progress: 0.8 },
  resolved:   { emoji: '✅', label: '已回收', color: T.accentGreen, progress: 1.0 },
  abandoned:  { emoji: '❌', label: '已废弃', color: T.textMuted, progress: 0 },
};

interface Props {
  items: Foreshadowing[];
}

export default function ForeshadowBoard({ items }: Props) {
  if (items.length === 0) {
    return <View style={s.empty}><Text style={s.emptyText}>还没有伏笔</Text></View>;
  }

  // 统计各状态数量
  const counts: Record<string, number> = {};
  for (const f of items) { counts[f.status] = (counts[f.status] || 0) + 1; }

  const active = items.filter(f => f.status !== 'resolved' && f.status !== 'abandoned');

  return (
    <View style={s.container}>
      {/* 状态概览 */}
      <View style={s.overview}>
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <View key={key} style={s.statItem}>
            <Text style={s.statEmoji}>{cfg.emoji}</Text>
            <Text style={[s.statCount, { color: cfg.color }]}>{counts[key] || 0}</Text>
            <Text style={s.statLabel}>{cfg.label}</Text>
          </View>
        ))}
      </View>

      {/* 总进度条 */}
      <View style={s.progressSection}>
        <View style={s.progressHeader}>
          <Text style={s.progressLabel}>伏笔回收进度</Text>
          <Text style={s.progressPercent}>{items.length > 0 ? Math.round((counts['resolved'] || 0) / items.length * 100) : 0}%</Text>
        </View>
        <View style={s.progressTrack}>
          <View style={[s.progressFill, { width: `${items.length > 0 ? (counts['resolved'] || 0) / items.length * 100 : 0}%`, backgroundColor: T.accentGreen }]} />
        </View>
      </View>

      {/* 活跃伏笔列表 */}
      {active.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>活跃伏笔</Text>
          {active.map(f => {
            const cfg = STATUS_CONFIG[f.status] || STATUS_CONFIG.planted;
            return (
              <View key={f.id} style={s.item}>
                <View style={s.itemHeader}>
                  <Text style={s.itemEmoji}>{cfg.emoji}</Text>
                  <Text style={s.itemTitle} numberOfLines={1}>{f.title}</Text>
                  <View style={[s.badge, { backgroundColor: cfg.color + '20' }]}>
                    <Text style={[s.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
                  </View>
                </View>
                <Text style={s.itemDesc} numberOfLines={2}>{f.description}</Text>
                <Text style={s.itemMeta}>第{f.plantedChapter}章埋下{f.resolvedChapter ? ` · 第${f.resolvedChapter}章回收` : ''}</Text>
                {/* 进度条 */}
                <View style={s.miniProgress}>
                  <View style={[s.miniProgressFill, { width: `${cfg.progress * 100}%`, backgroundColor: cfg.color }]} />
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { padding: 16 },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { color: T.textMuted, fontSize: 14 },
  overview: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  statItem: { alignItems: 'center', flex: 1 },
  statEmoji: { fontSize: 18, marginBottom: 4 },
  statCount: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 10, color: T.textMuted, marginTop: 2 },
  progressSection: { marginBottom: 20 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressLabel: { fontSize: 12, color: T.textSec },
  progressPercent: { fontSize: 12, fontWeight: '700', color: T.accentGreen },
  progressTrack: { height: 6, backgroundColor: T.surface, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  section: { marginTop: 4 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: T.text, marginBottom: 10 },
  item: { backgroundColor: T.card, borderRadius: T.r.md, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: T.border },
  itemHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemEmoji: { fontSize: 14 },
  itemTitle: { fontSize: 14, fontWeight: '600', color: T.text, flex: 1 },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: T.r.sm },
  badgeText: { fontSize: 10, fontWeight: '600' },
  itemDesc: { fontSize: 12, color: T.textSec, marginTop: 6, lineHeight: 17 },
  itemMeta: { fontSize: 11, color: T.textMuted, marginTop: 6 },
  miniProgress: { height: 3, backgroundColor: T.surface, borderRadius: 2, marginTop: 6, overflow: 'hidden' },
  miniProgressFill: { height: 3, borderRadius: 2 },
});
