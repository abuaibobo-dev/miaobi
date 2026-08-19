/**
 * 全自动写小说界面
 * 
 * 多智能体协同：
 * 📋 规划师 → ✍️ 作家 → 📝 编辑 → 🔍 连续性检查
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import {
  plannerAgent as generateOutline,
  autoWriteNovel,
  getAutoWriteStatus,
  type Outline,
  type AutoWriteProgress,
} from '../lib/autoWriteEngine';
import { getNovels } from '../lib/storage';
import { T, ICON } from '../lib/theme';
import { CapsuleToast } from '../components/CapsuleAlert';

type Props = any;

function AgentBadge({ agent, action }: { agent: string; action: string }) {
  return (
    <View style={ab.container}>
      <Text style={ab.agent}>{agent}</Text>
      <Text style={ab.action}>{action}</Text>
    </View>
  );
}
const ab = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3 },
  agent: { fontSize: 11, fontWeight: '600', color: T.accent },
  action: { fontSize: 11, color: T.textSec, flex: 1 },
});

export default function AutoWriteScreen({ navigation, route }: Props) {
  const routeNovelId = route.params?.novelId as string | undefined;
  const [novelId, setNovelId] = useState(routeNovelId || '');
  const [loadingNovel, setLoadingNovel] = useState(!routeNovelId);
  const [phase, setPhase] = useState<'input' | 'outline' | 'writing' | 'complete'>('input');
  const [userInput, setUserInput] = useState('');
  const [outline, setOutline] = useState<Outline | null>(null);
  const [progress, setProgress] = useState<AutoWriteProgress | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isWriting, setIsWriting] = useState(false);
  const [toast, setToast] = useState('');
  const [result, setResult] = useState<{ success: boolean; chaptersWritten: number; errors: string[]; continuityIssues: string[] } | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  // 加载第一本小说
  useEffect(() => {
    if (!routeNovelId) {
      setLoadingNovel(true);
      getNovels().then(novels => {
        if (novels.length > 0) {
          setNovelId(novels[0].id);
        }
        setLoadingNovel(false);
      }).catch(() => {
        setLoadingNovel(false);
      });
    }
  }, [routeNovelId]);

  const handleGenerateOutline = async () => {
    if (loadingNovel) {
      setToast('正在加载作品信息，请稍候...');
      return;
    }
    if (!novelId) {
      setToast('请先创建一部作品');
      navigation.goBack();
      return;
    }
    if (!userInput.trim()) {
      setToast('请输入你的小说灵感或设定');
      return;
    }
    setIsGenerating(true);
    try {
      const res = await generateOutline(novelId, userInput, {
        onProgress: (p) => setProgress(p),
      });
      if (typeof res === 'string') {
        setToast('生成失败：' + res);
        setPhase('input');
        return;
      }
      setOutline(res);
      setPhase('outline');
    } catch (e: any) {
      setToast('生成大纲失败：' + e.message);
      setPhase('input');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStartWriting = async () => {
    if (!outline || !novelId) return;
    setIsWriting(true);
    setPhase('writing');
    try {
      const res = await autoWriteNovel(novelId, outline, {
        onProgress: (p) => {
          setProgress(p);
          setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
        },
        onAgentLog: () => {},
        onError: () => {},
      });
      setResult(res);
      setPhase('complete');
    } catch (e: any) {
      setToast('写作失败：' + e.message);
      setPhase('outline');
    } finally {
      setIsWriting(false);
    }
  };

  const renderInputPhase = () => (
    <View style={s.inputContainer}>
      <View style={s.headerSection}>
        <Text style={s.headerIcon}>🤖</Text>
        <Text style={s.headerTitle}>全自动写作</Text>
        <Text style={s.headerSubtitle}>4个AI智能体协同工作，从构思到成书一键完成</Text>
      </View>
      <View style={s.agentsCard}>
        <Text style={s.agentsTitle}>智能体团队</Text>
        {[
          { icon: '📋', name: '规划师', desc: '生成大纲，规划章节结构' },
          { icon: '✍️', name: '作家', desc: '根据大纲创作每一章' },
          { icon: '📝', name: '编辑', desc: '审查质量，自动修订' },
          { icon: '🔍', name: '连续性检查员', desc: '确保前后一致，无矛盾' },
        ].map((a, i) => (
          <View key={i} style={s.agentRow}>
            <Text style={s.agentIcon}>{a.icon}</Text>
            <View style={s.agentInfo}>
              <Text style={s.agentName}>{a.name}</Text>
              <Text style={s.agentDesc}>{a.desc}</Text>
            </View>
          </View>
        ))}
      </View>
      <View style={s.inputSection}>
        <Text style={s.inputLabel}>你的灵感是什么？</Text>
        <TextInput
          style={s.textInput}
          multiline
          placeholder="例如：一个程序员意外穿越到古代，发现自己能用代码控制天气..."
          placeholderTextColor={T.textMuted}
          value={userInput}
          onChangeText={setUserInput}
          textAlignVertical="top"
        />
      </View>
      <TouchableOpacity
        style={[s.primaryBtn, (isGenerating || loadingNovel) && s.primaryBtnDisabled]}
        onPress={handleGenerateOutline}
        disabled={isGenerating || loadingNovel}
      >
        {isGenerating ? (
          <View style={s.loadingRow}>
            <ActivityIndicator color={T.text} size="small" />
            <Text style={s.primaryBtnText}>规划师正在构思...</Text>
          </View>
        ) : loadingNovel ? (
          <View style={s.loadingRow}>
            <ActivityIndicator color={T.text} size="small" />
            <Text style={s.primaryBtnText}>加载中...</Text>
          </View>
        ) : (
          <Text style={s.primaryBtnText}>生成大纲 {ICON.arrow}</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  const renderOutlinePhase = () => {
    if (!outline) return null;
    return (
      <View style={s.outlineContainer}>
        <View style={s.outlineHeader}>
          <Text style={s.outlineTitle}>📋 大纲预览</Text>
          <Text style={s.outlineMeta}>{outline.totalVolumes}卷 · {outline.totalChapters}章 · {outline.genre}</Text>
        </View>
        <View style={s.worldCard}>
          <Text style={s.worldLabel}>🌍 世界观</Text>
          <Text style={s.worldText}>{outline.worldSetting}</Text>
        </View>
        <Text style={s.chapterListTitle}>章节列表</Text>
        {outline.chapterOutlines.map((ch) => (
          <View key={ch.chapterNumber} style={s.chapterCard}>
            <View style={s.chapterHeader}>
              <Text style={s.chapterNum}>第{ch.chapterNumber}章</Text>
              <Text style={s.chapterTitle}>{ch.title}</Text>
            </View>
            <Text style={s.chapterSummary} numberOfLines={2}>{ch.summary}</Text>
            <View style={s.chapterMeta}>
              <Text style={s.metaTag}>🎭 {ch.emotionalTone}</Text>
              <Text style={s.metaTag}>👥 {ch.characters.join('、')}</Text>
            </View>
            {ch.turningPoint ? <Text style={s.turningPoint} numberOfLines={1}>⚡ {ch.turningPoint}</Text> : null}
          </View>
        ))}
        <View style={s.actionButtons}>
          <TouchableOpacity style={s.secondaryBtn} onPress={() => { setPhase('input'); setOutline(null); }}>
            <Text style={s.secondaryBtnText}>重新生成</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.primaryBtn, isWriting && s.primaryBtnDisabled]} onPress={handleStartWriting} disabled={isWriting}>
            <Text style={s.primaryBtnText}>开始写作 {ICON.arrow}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderWritingPhase = () => {
    if (!progress) return null;
    const phaseLabel = { outline: '生成大纲中', writing: '写作中', reviewing: '审查修订中', continuity: '连续性检查中', complete: '完成' }[progress.phase];
    return (
      <View style={s.writingContainer}>
        <View style={s.progressHeader}>
          <Text style={s.progressTitle}>🤖 {phaseLabel}</Text>
          <Text style={s.progressPercent}>{progress.overallProgress}%</Text>
        </View>
        <View style={s.progressBar}>
          <View style={[s.progressFill, { width: `${progress.overallProgress}%` }]} />
        </View>
        <View style={s.statusCard}>
          <Text style={s.statusText}>{progress.status}</Text>
          {progress.chapterTitle ? <Text style={s.chapterInfo}>第{progress.currentVolume}卷 · 第{progress.currentChapter}章「{progress.chapterTitle}」</Text> : null}
        </View>
        {progress.phase !== 'outline' ? (
          <View style={s.chapterProgressSection}>
            <View style={s.chapterProgressBar}><View style={[s.chapterProgressFill, { width: `${progress.chapterProgress}%` }]} /></View>
            <Text style={s.chapterProgressText}>{progress.chapterProgress}%</Text>
          </View>
        ) : null}
        {progress.agentLog.length > 0 ? (
          <View style={s.logCard}>
            <Text style={s.logTitle}>📋 智能体日志</Text>
            {progress.agentLog.map((log, i) => <AgentBadge key={i} agent={log.agent} action={log.action} />)}
          </View>
        ) : null}
        {progress.errors.length > 0 ? (
          <View style={s.errorSection}>
            <Text style={s.errorTitle}>⚠️ 错误 ({progress.errors.length})</Text>
            {progress.errors.map((err, i) => <Text key={i} style={s.errorText}>• {err}</Text>)}
          </View>
        ) : null}
        <View style={s.tipCard}>
          <Text style={s.tipIcon}>💡</Text>
          <Text style={s.tipText}>4个智能体正在协同工作：规划师→作家→编辑→连续性检查。每章完成后自动审查修订，整个过程可能需要 15-40 分钟。</Text>
        </View>
      </View>
    );
  };

  const renderCompletePhase = () => {
    if (!result) return null;
    return (
      <View style={s.completeContainer}>
        <View style={s.completeIcon}><Text style={s.completeEmoji}>🎉</Text></View>
        <Text style={s.completeTitle}>写作完成！</Text>
        <Text style={s.completeSubtitle}>共完成 {result.chaptersWritten} 章</Text>
        {result.errors.length > 0 ? (
          <View style={s.errorSection}>
            <Text style={s.errorTitle}>⚠️ 部分章节有问题</Text>
            {result.errors.map((err, i) => <Text key={i} style={s.errorText}>• {err}</Text>)}
          </View>
        ) : null}
        {result.continuityIssues.length > 0 ? (
          <View style={s.warnSection}>
            <Text style={s.warnTitle}>🔍 连续性问题</Text>
            {result.continuityIssues.map((issue, i) => <Text key={i} style={s.warnText}>• {issue}</Text>)}
          </View>
        ) : null}
        <View style={s.actionButtons}>
          <TouchableOpacity style={s.secondaryBtn} onPress={() => navigation.goBack()}>
            <Text style={s.secondaryBtnText}>返回首页</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.primaryBtn} onPress={() => navigation.navigate('NovelDetail', { novelId })}>
            <Text style={s.primaryBtnText}>查看作品 {ICON.arrow}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={s.container}>
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Text style={s.backIcon}>{ICON.back}</Text>
        </TouchableOpacity>
        <Text style={s.topTitle}>全自动写作</Text>
        <View style={s.placeholder} />
      </View>
      <ScrollView ref={scrollViewRef} style={s.content} contentContainerStyle={s.contentContainer}>
        {phase === 'input' && renderInputPhase()}
        {phase === 'outline' && renderOutlinePhase()}
        {phase === 'writing' && renderWritingPhase()}
        {phase === 'complete' && renderCompletePhase()}
      <CapsuleToast visible={!!toast} text={toast} onHide={() => setToast('')} />
    </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: T.sp.lg, paddingTop: 50, paddingBottom: T.sp.md, borderBottomWidth: 1, borderBottomColor: T.border },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: T.card, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: 18, color: T.accent },
  topTitle: { fontSize: 17, fontWeight: '700', color: T.text },
  placeholder: { width: 36 },
  content: { flex: 1 },
  contentContainer: { padding: T.sp.xl, paddingBottom: 100 },
  inputContainer: { gap: T.sp.xl },
  headerSection: { alignItems: 'center', paddingVertical: T.sp.xxl },
  headerIcon: { fontSize: 48, marginBottom: T.sp.md },
  headerTitle: { fontSize: 24, fontWeight: '800', color: T.text, marginBottom: T.sp.sm },
  headerSubtitle: { fontSize: 14, color: T.textSec, textAlign: 'center', lineHeight: 20 },
  agentsCard: { backgroundColor: T.card, borderRadius: T.r.lg, padding: T.sp.lg, borderWidth: 1, borderColor: T.border, gap: T.sp.md },
  agentsTitle: { fontSize: 14, fontWeight: '700', color: T.text },
  agentRow: { flexDirection: 'row', alignItems: 'center', gap: T.sp.md },
  agentIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  agentInfo: { flex: 1 },
  agentName: { fontSize: 13, fontWeight: '600', color: T.text },
  agentDesc: { fontSize: 11, color: T.textMuted },
  inputSection: { gap: T.sp.sm },
  inputLabel: { fontSize: 14, fontWeight: '600', color: T.text },
  textInput: { backgroundColor: T.card, borderRadius: T.r.lg, padding: T.sp.lg, fontSize: 15, color: T.text, minHeight: 150, borderWidth: 1, borderColor: T.border, lineHeight: 22 },
  outlineContainer: { gap: T.sp.lg },
  outlineHeader: { gap: T.sp.xs },
  outlineTitle: { fontSize: 20, fontWeight: '700', color: T.text },
  outlineMeta: { fontSize: 13, color: T.textSec },
  worldCard: { backgroundColor: T.card, borderRadius: T.r.lg, padding: T.sp.lg, borderWidth: 1, borderColor: T.border },
  worldLabel: { fontSize: 13, fontWeight: '600', color: T.accent, marginBottom: T.sp.sm },
  worldText: { fontSize: 14, color: T.textSec, lineHeight: 20 },
  chapterListTitle: { fontSize: 15, fontWeight: '600', color: T.text, marginTop: T.sp.sm },
  chapterCard: { backgroundColor: T.card, borderRadius: T.r.md, padding: T.sp.md, borderWidth: 1, borderColor: T.border },
  chapterHeader: { flexDirection: 'row', alignItems: 'center', gap: T.sp.sm, marginBottom: T.sp.xs },
  chapterNum: { fontSize: 12, fontWeight: '600', color: T.accent },
  chapterTitle: { fontSize: 14, fontWeight: '600', color: T.text },
  chapterSummary: { fontSize: 13, color: T.textSec, lineHeight: 18, marginBottom: T.sp.sm },
  chapterMeta: { flexDirection: 'row', gap: T.sp.md },
  metaTag: { fontSize: 11, color: T.textMuted },
  turningPoint: { fontSize: 11, color: T.accentOrange, marginTop: T.sp.xs, fontStyle: 'italic' },
  writingContainer: { gap: T.sp.lg },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressTitle: { fontSize: 18, fontWeight: '700', color: T.text },
  progressPercent: { fontSize: 16, fontWeight: '700', color: T.accent },
  progressBar: { height: 8, backgroundColor: T.card, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: T.accent, borderRadius: 4 },
  statusCard: { backgroundColor: T.card, borderRadius: T.r.lg, padding: T.sp.lg, borderWidth: 1, borderColor: T.border, gap: T.sp.xs },
  statusText: { fontSize: 14, color: T.text, fontWeight: '500' },
  chapterInfo: { fontSize: 13, color: T.textSec },
  chapterProgressSection: { flexDirection: 'row', alignItems: 'center', gap: T.sp.md },
  chapterProgressBar: { flex: 1, height: 6, backgroundColor: T.card, borderRadius: 3, overflow: 'hidden' },
  chapterProgressFill: { height: '100%', backgroundColor: T.accentGreen, borderRadius: 3 },
  chapterProgressText: { fontSize: 12, color: T.textMuted, width: 40, textAlign: 'right' },
  logCard: { backgroundColor: T.card, borderRadius: T.r.md, padding: T.sp.md, borderWidth: 1, borderColor: T.border },
  logTitle: { fontSize: 13, fontWeight: '600', color: T.text, marginBottom: T.sp.sm },
  tipCard: { flexDirection: 'row', backgroundColor: T.accentSoft, borderRadius: T.r.md, padding: T.sp.md, gap: T.sp.sm, borderWidth: 1, borderColor: T.accent + '30' },
  tipIcon: { fontSize: 16 },
  tipText: { flex: 1, fontSize: 13, color: T.textSec, lineHeight: 18 },
  completeContainer: { alignItems: 'center', gap: T.sp.xl, paddingVertical: T.sp.xxl },
  completeIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: T.accentGreen + '20', alignItems: 'center', justifyContent: 'center' },
  completeEmoji: { fontSize: 40 },
  completeTitle: { fontSize: 24, fontWeight: '800', color: T.text },
  completeSubtitle: { fontSize: 16, color: T.textSec },
  errorSection: { backgroundColor: T.accentRed + '10', borderRadius: T.r.md, padding: T.sp.md, borderWidth: 1, borderColor: T.accentRed + '30', alignSelf: 'stretch' },
  errorTitle: { fontSize: 13, fontWeight: '600', color: T.accentRed, marginBottom: T.sp.sm },
  errorText: { fontSize: 12, color: T.textSec, lineHeight: 18 },
  warnSection: { backgroundColor: T.accentOrange + '10', borderRadius: T.r.md, padding: T.sp.md, borderWidth: 1, borderColor: T.accentOrange + '30', alignSelf: 'stretch' },
  warnTitle: { fontSize: 13, fontWeight: '600', color: T.accentOrange, marginBottom: T.sp.sm },
  warnText: { fontSize: 12, color: T.textSec, lineHeight: 18 },
  actionButtons: { flexDirection: 'row', gap: T.sp.md, marginTop: T.sp.lg },
  primaryBtn: { flex: 1, backgroundColor: T.accent, borderRadius: T.r.lg, paddingVertical: T.sp.md, alignItems: 'center' },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: T.text },
  secondaryBtn: { flex: 1, backgroundColor: T.card, borderRadius: T.r.lg, paddingVertical: T.sp.md, alignItems: 'center', borderWidth: 1, borderColor: T.border },
  secondaryBtnText: { fontSize: 15, fontWeight: '600', color: T.textSec },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
