import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  StatusBar, Linking,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as IntentLauncher from 'expo-intent-launcher';
import { getSettings, saveSettings } from '../lib/storage';
import { checkApiKey, checkBalance, checkOllamaAvailable, getOllamaModels } from '../lib/llm';
import { exportBackup, restoreFromBackup } from '../lib/backup';
import CapsuleAlert, { CapsuleToast } from '../components/CapsuleAlert';
import { T } from '../lib/theme';
import { Icon } from '../lib/icons';
import type { NovelSettings } from '../types/novel';

type Props = any;

function Section({ title, icon, defaultOpen = true, children }: { title: string; icon: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={s.sectionWrap}>
      <TouchableOpacity style={s.sectionHeader} onPress={() => setOpen(!open)} activeOpacity={0.7}>
        <View style={s.sectionLeft}>
          <Text style={s.sectionIcon}>{icon}</Text>
          <Text style={s.sectionTitle}>{title}</Text>
        </View>
        <Text style={s.sectionArrow}>{open ? '▾' : '▸'}</Text>
      </TouchableOpacity>
      {open && <View style={s.sectionBody}>{children}</View>}
    </View>
  );
}

const OLLAMA_TIP = '首次设置（只需一次）：\n点击上方按钮打开 Termux，粘贴运行：\n\necho "ollama serve &" >> ~/.bashrc\n\n之后每次点「一键启动」→ 自动运行 Ollama → 切回本页面刷新即可。';

export default function SettingsScreen({ navigation }: Props) {
  const [settings, setSettings] = useState<NovelSettings>({
    apiKey: '', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat',
    temperature: 0.7, maxTokens: 12000,
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [ollamaAvailable, setOllamaAvailable] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaChecking, setOllamaChecking] = useState(false);

  useEffect(() => {
    getSettings().then(setSettings);
    checkOllamaStatus();
  }, []);

  const checkOllamaStatus = async () => {
    setOllamaChecking(true);
    try {
      const available = await checkOllamaAvailable();
      setOllamaAvailable(available);
      if (available) {
        const models = await getOllamaModels();
        setOllamaModels(models);
      }
    } catch {}
    setOllamaChecking(false);
  };

  const handleSave = async () => {
    await saveSettings(settings);
    setToast('保存成功');
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    await saveSettings(settings);
    try {
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('超时（15秒）')), 15000));
      const result = await Promise.race([checkApiKey(), timeout]);
      setTestResult((result as any).valid ? '连接成功' : (result as any).error || '连接失败');
    } catch (e: any) {
      setTestResult(e.message || '测试超时');
    }
    setTesting(false);
  };

  const handleCheckBalance = async () => {
    setBalanceLoading(true);
    setBalance(null);
    try {
      const result = await checkBalance();
      if (result && typeof result.balance === 'number' && !isNaN(result.balance)) {
        setBalance(result.balance);
      } else {
        setToast(result?.error || '查询失败');
      }
    } catch {
      setToast('查询出错');
    }
    setBalanceLoading(false);
  };

  const handleExportBackup = async () => {
    const ok = await exportBackup();
    if (ok) setToast('导出成功');
  };

  const handleImportBackup = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;
      const content = await (await import('expo-file-system')).default.readAsStringAsync(result.assets[0].uri);
      const res = await restoreFromBackup(content);
      setToast(res.success ? '恢复成功' : res.message);
    } catch (e: any) {
      setToast('恢复失败：' + e.message);
    }
  };

  const handleLaunchTermux = async () => {
    try {
      await IntentLauncher.startActivityAsync('android.intent.action.MAIN' as any, {
        packageName: 'com.termux',
        className: 'com.termux.app.TermuxActivity',
      });
    } catch {
      setToast('无法打开 Termux，请确认已安装');
    }
  };

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Icon.back size={18} color={T.accent} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>设置</Text>
        <View style={{ width: 36 }} />
      </View>

      <Section title="Ollama 本地模型" icon="⚡" defaultOpen={true}>
        <View style={s.ollamaStatus}>
          <View style={[s.statusDot, ollamaAvailable ? s.statusOk : s.statusFail]} />
          <Text style={s.statusText}>
            {ollamaChecking ? '检测中...' : ollamaAvailable ? 'Ollama 运行中' : 'Ollama 未运行'}
          </Text>
          <TouchableOpacity style={s.refreshBtn} onPress={checkOllamaStatus}>
            <Icon.loading size={14} color={T.textMuted} />
          </TouchableOpacity>
        </View>
        {!ollamaAvailable && (
          <TouchableOpacity style={s.launchBtn} onPress={handleLaunchTermux} activeOpacity={0.7}>
            <Text style={s.launchBtnText}>⚡ 一键启动本地模型</Text>
          </TouchableOpacity>
        )}
        {ollamaAvailable && (
          <View style={s.modelList}>
            <Text style={s.label}>已安装模型：</Text>
            {ollamaModels.length === 0 ? (
              <Text style={s.noModel}>暂无模型</Text>
            ) : (
              ollamaModels.map((model, i) => (
                <View key={i} style={s.modelItem}>
                  <Icon.check size={12} color={T.accentGreen} />
                  <Text style={s.modelName}>{model}</Text>
                </View>
              ))
            )}
          </View>
        )}
        <Text style={s.ollamaHint}>{OLLAMA_TIP}</Text>
      </Section>

      <Section title="DeepSeek 云端" icon="◈" defaultOpen={true}>
        <Text style={s.label}>API Key *</Text>
        <TextInput style={s.input} value={settings.apiKey} onChangeText={v => setSettings(prev => ({ ...prev, apiKey: v }))} placeholder="sk-..." placeholderTextColor={T.textMuted} secureTextEntry autoCapitalize="none" />
        <Text style={s.label}>API 地址</Text>
        <TextInput style={s.input} value={settings.baseUrl} onChangeText={v => setSettings(prev => ({ ...prev, baseUrl: v }))} placeholder="https://api.deepseek.com" placeholderTextColor={T.textMuted} autoCapitalize="none" />
        <Text style={s.label}>模型</Text>
        <TextInput style={s.input} value={settings.model} onChangeText={v => setSettings(prev => ({ ...prev, model: v }))} placeholder="deepseek-chat" placeholderTextColor={T.textMuted} autoCapitalize="none" />
        <Text style={s.label}>Temperature: {settings.temperature.toFixed(1)}</Text>
        <View style={s.tempRow}>
          {[0.1, 0.3, 0.5, 0.7, 0.9, 1.0].map(t => (
            <TouchableOpacity key={t} style={[s.tempChip, settings.temperature === t && s.tempChipActive]} onPress={() => setSettings(prev => ({ ...prev, temperature: t }))}>
              <Text style={[s.tempText, settings.temperature === t && s.tempTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={s.balanceRow}>
          <TouchableOpacity style={[s.balanceBtn, s.balanceBtnHalf]} onPress={handleCheckBalance} disabled={balanceLoading}>
            <Text style={s.balanceBtnText}>{balanceLoading ? '查询中...' : balance !== null ? '余额：¥' + balance.toFixed(2) : '查询余额'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.balanceBtn, s.rechargeBtn, s.balanceBtnHalf]}
            onPress={() => Linking.openURL('https://platform.deepseek.com/top_up').catch(() => setToast('无法打开充值页'))}
          >
            <Text style={[s.balanceBtnText, s.rechargeText]}>充值</Text>
          </TouchableOpacity>
        </View>
        {testResult && <Text style={[s.testResult, testResult.includes('成功') ? s.testOk : s.testFail]}>{testResult}</Text>}
        <TouchableOpacity style={s.testBtn} onPress={handleTest} disabled={testing}>
          <Text style={s.testBtnText}>{testing ? '测试中...' : '测试连接'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.saveBtn} onPress={handleSave}>
          <Text style={s.saveBtnText}>保存设置</Text>
        </TouchableOpacity>
      </Section>

      <Section title="数据备份" icon="⬡" defaultOpen={false}>
        <TouchableOpacity style={s.backupBtn} onPress={handleExportBackup}>
          <Text style={s.backupBtnText}>导出备份</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.backupBtn, { marginTop: 8 }]} onPress={handleImportBackup}>
          <Text style={s.backupBtnText}>导入备份</Text>
        </TouchableOpacity>
      </Section>

      <View style={s.footer}>
        <Text style={s.footerText}>妙笔 v1.6.0</Text>
        <Text style={s.footerSub}>AI 驱动的小说写作助手</Text>
      </View>

      <CapsuleToast visible={!!toast} text={toast} onHide={() => setToast('')} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },
  content: { padding: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: (StatusBar.currentHeight || 44), marginBottom: 24 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: T.surface, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: T.text },
  sectionWrap: { marginBottom: 16, borderRadius: T.r.md, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, overflow: 'hidden' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 },
  sectionLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionIcon: { fontSize: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: T.text },
  sectionArrow: { fontSize: 14, color: T.textMuted },
  sectionBody: { paddingHorizontal: 14, paddingBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: T.textSec, marginBottom: 6, marginTop: 10 },
  input: { height: 44, borderRadius: T.r.sm, borderWidth: 1, borderColor: T.border, backgroundColor: T.bg, paddingHorizontal: 12, fontSize: 14, color: T.text },
  tempRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  tempChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: T.bg, borderWidth: 1, borderColor: T.border },
  tempChipActive: { backgroundColor: T.accent, borderWidth: 0 },
  tempText: { fontSize: 13, color: T.textSec },
  tempTextActive: { color: '#FFF' },
  balanceRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  balanceBtn: { flex: 1, paddingVertical: 10, borderRadius: T.r.sm, backgroundColor: T.accentGreen + '15', alignItems: 'center' },
  balanceBtnHalf: { flex: 1 },
  rechargeBtn: { backgroundColor: T.accent + '18' },
  rechargeText: { color: T.accent },
  balanceBtnText: { fontSize: 14, fontWeight: '600', color: T.accentGreen },
  testResult: { marginTop: 8, fontSize: 13, fontWeight: '600' },
  testOk: { color: T.accentGreen },
  testFail: { color: T.accentRed },
  testBtn: { marginTop: 10, paddingVertical: 10, borderRadius: T.r.sm, backgroundColor: T.accent + '15', alignItems: 'center' },
  testBtnText: { fontSize: 14, fontWeight: '600', color: T.accent },
  saveBtn: { marginTop: 12, paddingVertical: 12, borderRadius: T.r.sm, backgroundColor: T.accent, alignItems: 'center' },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  backupBtn: { paddingVertical: 12, borderRadius: T.r.sm, backgroundColor: T.accentBlue + '15', alignItems: 'center' },
  backupBtnText: { fontSize: 14, fontWeight: '600', color: T.accentBlue },
  footer: { marginTop: 32, alignItems: 'center' },
  footerText: { fontSize: 14, fontWeight: '700', color: T.textSec },
  footerSub: { fontSize: 12, color: T.textMuted, marginTop: 4 },
  ollamaStatus: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusOk: { backgroundColor: T.accentGreen },
  statusFail: { backgroundColor: T.accentRed },
  statusText: { fontSize: 13, fontWeight: '600', color: T.textSec, flex: 1 },
  refreshBtn: { padding: 6 },
  modelList: { marginBottom: 12 },
  modelItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  modelName: { fontSize: 13, color: T.text, fontFamily: 'monospace' },
  noModel: { fontSize: 13, color: T.textMuted, fontStyle: 'italic' },
  ollamaHint: { fontSize: 12, color: T.textMuted, lineHeight: 18, backgroundColor: T.bg, padding: 10, borderRadius: T.r.sm },
  launchBtn: {
    backgroundColor: T.accent,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: T.r.md,
    alignItems: 'center',
    marginBottom: 10,
  },
  launchBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
