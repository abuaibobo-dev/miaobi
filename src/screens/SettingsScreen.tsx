import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { getSettings, saveSettings } from '../lib/storage';
import { checkApiKey, checkBalance } from '../lib/llm';
import { exportBackup, restoreFromBackup } from '../lib/backup';
import CapsuleAlert, { CapsuleToast } from '../components/CapsuleAlert';
import { T, ICON } from '../lib/theme';
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

  useEffect(() => { getSettings().then(setSettings); }, []);

  const handleSave = async () => {
    await saveSettings(settings);
    setToast('✅ 保存成功');
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    await saveSettings(settings);
    const result = await checkApiKey();
    setTestResult(result.valid ? '✅ 连接成功' : `❌ ${result.error}`);
    setTesting(false);
  };

  const handleCheckBalance = async () => {
    setBalanceLoading(true);
    const result = await checkBalance();
    if (result.balance !== undefined) setBalance(result.balance);
    else setToast(result.error || '查询失败');
    setBalanceLoading(false);
  };

  const handleExportBackup = async () => {
    const ok = await exportBackup();
    if (ok) setToast('✅ 导出成功');
  };

  const handleImportBackup = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;
      const content = await (await import('expo-file-system')).default.readAsStringAsync(result.assets[0].uri);
      const res = await restoreFromBackup(content);
      setToast(res.success ? '✅ 恢复成功' : '❌ ' + res.message);
    } catch (e: any) {
      setToast('❌ 恢复失败：' + e.message);
    }
  };

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backIcon}>{ICON.back}</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>设置</Text>
        <View style={{ width: 36 }} />
      </View>

      <Section title="DeepSeek 云端" icon="◈" defaultOpen={true}>
        <Text style={s.label}>API Key *</Text>
        <TextInput style={s.input} value={settings.apiKey} onChangeText={v => setSettings(s => ({ ...s, apiKey: v }))} placeholder="sk-..." placeholderTextColor={T.textMuted} secureTextEntry autoCapitalize="none" />
        <Text style={s.label}>API 地址</Text>
        <TextInput style={s.input} value={settings.baseUrl} onChangeText={v => setSettings(s => ({ ...s, baseUrl: v }))} placeholder="https://api.deepseek.com" placeholderTextColor={T.textMuted} autoCapitalize="none" />
        <Text style={s.label}>模型</Text>
        <TextInput style={s.input} value={settings.model} onChangeText={v => setSettings(s => ({ ...s, model: v }))} placeholder="deepseek-chat" placeholderTextColor={T.textMuted} autoCapitalize="none" />
        <Text style={s.label}>Temperature: {settings.temperature.toFixed(1)}</Text>
        <View style={s.tempRow}>
          {[0.1, 0.3, 0.5, 0.7, 0.9, 1.0].map(t => (
            <TouchableOpacity key={t} style={[s.tempChip, settings.temperature === t && s.tempChipActive]} onPress={() => setSettings(s => ({ ...s, temperature: t }))}>
              <Text style={[s.tempText, settings.temperature === t && s.tempTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={s.balanceBtn} onPress={handleCheckBalance} disabled={balanceLoading}>
          <Text style={s.balanceBtnText}>{balanceLoading ? '查询中...' : balance !== null ? `余额：¥${balance.toFixed(2)}` : '查询余额'}</Text>
        </TouchableOpacity>
        {testResult && <Text style={[s.testResult, testResult.startsWith('✅') ? s.testOk : s.testFail]}>{testResult}</Text>}
        <TouchableOpacity style={s.testBtn} onPress={handleTest} disabled={testing}>
          <Text style={s.testBtnText}>{testing ? '测试中...' : '测试连接'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.saveBtn} onPress={handleSave}>
          <Text style={s.saveBtnText}>保存设置</Text>
        </TouchableOpacity>
      </Section>

      <Section title="数据备份" icon="⬡" defaultOpen={false}>
        <TouchableOpacity style={s.backupBtn} onPress={handleExportBackup}>
          <Text style={s.backupBtnText}>导出备份（JSON）</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.backupBtn, { marginTop: 8 }]} onPress={handleImportBackup}>
          <Text style={s.backupBtnText}>导入备份</Text>
        </TouchableOpacity>
      </Section>

      <View style={s.footer}>
        <Text style={s.footerText}>妙笔 v1.5.1</Text>
        <Text style={s.footerSub}>AI 驱动的小说写作助手</Text>
      </View>

      <CapsuleToast visible={!!toast} text={toast} onHide={() => setToast('')} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },
  content: { padding: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 50, paddingBottom: 16 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: T.card, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: T.border },
  backIcon: { fontSize: 18, color: T.accent },
  headerTitle: { fontSize: 18, fontWeight: '800', color: T.text },
  // Collapsible section
  sectionWrap: { backgroundColor: T.card, borderRadius: T.r.lg, borderWidth: 1, borderColor: T.border, marginTop: 12, overflow: 'hidden' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  sectionLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionIcon: { fontSize: 14, color: T.accent },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: T.text },
  sectionArrow: { fontSize: 12, color: T.textMuted, fontWeight: '700' },
  sectionBody: { paddingHorizontal: 14, paddingBottom: 14 },
  // Form
  label: { fontSize: 12, color: T.textMuted, marginBottom: 5, marginTop: 10, fontWeight: '600' },
  input: { backgroundColor: T.surface, borderRadius: T.r.md, padding: 11, fontSize: 14, color: T.text, borderWidth: 1, borderColor: T.border },
  tempRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  tempChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border },
  tempChipActive: { backgroundColor: T.accent, borderColor: T.accent },
  tempText: { fontSize: 12, color: T.textMuted },
  tempTextActive: { color: '#000', fontWeight: '600' },
  balanceBtn: { backgroundColor: T.surface, borderRadius: T.r.md, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: T.border, marginTop: 10 },
  balanceBtnText: { fontSize: 13, color: T.accent, fontWeight: '600' },
  testResult: { fontSize: 13, textAlign: 'center', marginTop: 10 },
  testOk: { color: T.accentGreen },
  testFail: { color: T.accentRed },
  testBtn: { marginTop: 10, backgroundColor: T.surface, borderRadius: T.r.md, paddingVertical: 11, alignItems: 'center', borderWidth: 1, borderColor: T.border },
  testBtnText: { fontSize: 14, color: T.text },
  saveBtn: { marginTop: 10, backgroundColor: T.accent, borderRadius: T.r.md, paddingVertical: 12, alignItems: 'center' },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  backupBtn: { backgroundColor: T.surface, borderRadius: T.r.md, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: T.border },
  backupBtnText: { fontSize: 14, color: T.text },
  footer: { alignItems: 'center', marginTop: 32, width: '100%' },
  footerText: { fontSize: 13, color: T.textMuted },
  footerSub: { fontSize: 11, color: T.textMuted, marginTop: 4, opacity: 0.6 },
});