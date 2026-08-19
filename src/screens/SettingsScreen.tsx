import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { getSettings, saveSettings } from '../lib/storage';
import { checkApiKey } from '../lib/llm';
import { exportBackup, restoreFromBackup } from '../lib/backup';
import CapsuleAlert, { CapsuleToast } from '../components/CapsuleAlert';
import { T } from '../lib/theme';
import { checkBalance } from '../lib/llm';
import type { NovelSettings } from '../types/novel';


type Props = any;

export default function SettingsScreen({ navigation }: Props) {
  const [settings, setSettings] = useState<NovelSettings>({
    apiKey: '', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat',
    temperature: 0.7, maxTokens: 8192,
  });

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [infoModal, setInfoModal] = useState(false);
  const [infoMsg, setInfoMsg] = useState('');

  useEffect(() => {
    getSettings().then(s => {
      setSettings(s);

    });
  }, []);

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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.backBtn}>← 返回</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>⚙️ 设置</Text>
        <View style={{ width: 40 }} />
      </View>

      <Text style={styles.section}>☁️ DeepSeek 云端</Text>
      <Text style={styles.label}>API Key *</Text>
      <TextInput style={styles.input} value={settings.apiKey} onChangeText={v => setSettings(s => ({ ...s, apiKey: v }))} placeholder="sk-..." placeholderTextColor="#555" secureTextEntry autoCapitalize="none" />
      <Text style={styles.label}>API 地址</Text>
      <TextInput style={styles.input} value={settings.baseUrl} onChangeText={v => setSettings(s => ({ ...s, baseUrl: v }))} placeholder="https://api.deepseek.com" placeholderTextColor="#555" autoCapitalize="none" />
      <Text style={styles.label}>模型</Text>
      <TextInput style={styles.input} value={settings.model} onChangeText={v => setSettings(s => ({ ...s, model: v }))} placeholder="deepseek-chat" placeholderTextColor="#555" autoCapitalize="none" />
      <Text style={styles.label}>Temperature: {settings.temperature.toFixed(1)}</Text>
      <View style={styles.tempRow}>
        {[0.1, 0.3, 0.5, 0.7, 0.9, 1.0].map(t => (
          <TouchableOpacity key={t} style={[styles.tempChip, settings.temperature === t && styles.tempChipActive]} onPress={() => setSettings(s => ({ ...s, temperature: t }))}>
            <Text style={[styles.tempText, settings.temperature === t && styles.tempTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 余额 */}
      <TouchableOpacity style={styles.balanceBtn} onPress={handleCheckBalance} disabled={balanceLoading}>
        <Text style={styles.balanceBtnText}>{balanceLoading ? '查询中...' : balance !== null ? `💰 余额：¥${balance.toFixed(2)}` : '💰 查询余额'}</Text>
      </TouchableOpacity>

      {testResult && <Text style={[styles.testResult, testResult.startsWith('✅') ? styles.testOk : styles.testFail]}>{testResult}</Text>}
      <TouchableOpacity style={styles.testBtn} onPress={handleTest} disabled={testing}>
        <Text style={styles.testBtnText}>{testing ? '测试中...' : '🔌 测试连接'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
        <Text style={styles.saveBtnText}>💾 保存设置</Text>
      </TouchableOpacity>

      <Text style={styles.section}>📦 数据备份</Text>
      <TouchableOpacity style={styles.backupBtn} onPress={handleExportBackup}>
        <Text style={styles.backupBtnText}>📤 导出备份（JSON）</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.backupBtn, { marginTop: 8 }]} onPress={handleImportBackup}>
        <Text style={styles.backupBtnText}>📥 导入备份</Text>
      </TouchableOpacity>

      <View style={styles.footer}>
        <Text style={styles.footerText}>妙笔 v1.2.2</Text>
        <Text style={styles.footerSub}>AI 驱动的小说写作助手</Text>
      </View>

      <CapsuleToast visible={!!toast} text={toast} onHide={() => setToast('')} />
      <CapsuleAlert visible={infoModal} title="💡 提示" message={infoMsg} confirmText="知道了" onCancel={() => setInfoModal(false)} onConfirm={() => setInfoModal(false)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },
  content: { padding: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 50, paddingBottom: 16 },
  backBtn: { fontSize: 14, color: T.accent, width: 40 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: T.text },
  section: { fontSize: 16, fontWeight: '600', color: T.text, marginTop: 20, marginBottom: 12 },
  label: { fontSize: 13, color: T.textSec, marginBottom: 6, marginTop: 10 },
  input: { backgroundColor: T.card, borderRadius: 10, padding: 12, fontSize: 15, color: T.text, borderWidth: 1, borderColor: T.border },
  hint: { fontSize: 12, color: '#666', marginTop: 4 },
  tempRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  tempChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: T.card, borderWidth: 1, borderColor: T.border },
  tempChipActive: { backgroundColor: T.accent, borderColor: T.accent },
  tempText: { fontSize: 13, color: T.textSec },
  tempTextActive: { color: '#000', fontWeight: '600' },
  testResult: { fontSize: 14, textAlign: 'center', marginTop: 16 },
  testOk: { color: T.accent },
  testFail: { color: T.accentRed },
  testBtn: { marginTop: 16, backgroundColor: T.card, borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: T.border },
  testBtnText: { fontSize: 15, color: T.text },
  saveBtn: { marginTop: 12, backgroundColor: T.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { fontSize: 15, fontWeight: 'bold', color: '#000' },
  backupBtn: { backgroundColor: T.card, borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: T.border },
  backupBtnText: { fontSize: 15, color: T.text },
  balanceBtn: { backgroundColor: T.card, borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: T.border, marginTop: 12 },
  balanceBtnText: { fontSize: 14, color: T.accent, fontWeight: '600' },
  footer: { alignItems: 'center', marginTop: 40, width: '100%' },
  footerText: { fontSize: 14, color: T.textSec },
  footerSub: { fontSize: 12, color: '#555', marginTop: 4 },
});
