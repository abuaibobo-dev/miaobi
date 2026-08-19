import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, Switch,
} from 'react-native';
import { getSettings, saveSettings } from '../lib/storage';
import { checkApiKey } from '../lib/llm';
// navigation types simplified
import type { NovelSettings } from '../types/novel';

const COLORS = {
  bg: '#0D0D0D', card: '#1A1A1A', border: '#2A2A2A',
  text: '#FFFFFF', sub: '#888888', accent: '#00FF41',
  danger: '#FF0044',
};

type Props = any;

export default function SettingsScreen({ navigation }: Props) {
  const [settings, setSettings] = useState<NovelSettings>({
    apiKey: '', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat',
    temperature: 0.7, maxTokens: 4096,
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => { getSettings().then(setSettings); }, []);

  const handleSave = async () => {
    await saveSettings(settings);
    Alert.alert('✅ 保存成功');
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    await saveSettings(settings);
    const result = await checkApiKey();
    setTestResult(result.valid ? '✅ 连接成功' : `❌ ${result.error}`);
    setTesting(false);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backBtn}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>⚙️ 设置</Text>
        <View style={{ width: 40 }} />
      </View>

      <Text style={styles.section}>AI 模型</Text>

      <Text style={styles.label}>API Key *</Text>
      <TextInput
        style={styles.input}
        value={settings.apiKey}
        onChangeText={v => setSettings(s => ({ ...s, apiKey: v }))}
        placeholder="sk-..."
        placeholderTextColor="#555"
        secureTextEntry
        autoCapitalize="none"
      />

      <Text style={styles.label}>API 地址</Text>
      <TextInput
        style={styles.input}
        value={settings.baseUrl}
        onChangeText={v => setSettings(s => ({ ...s, baseUrl: v }))}
        placeholder="https://api.deepseek.com"
        placeholderTextColor="#555"
        autoCapitalize="none"
      />

      <Text style={styles.label}>模型</Text>
      <TextInput
        style={styles.input}
        value={settings.model}
        onChangeText={v => setSettings(s => ({ ...s, model: v }))}
        placeholder="deepseek-chat"
        placeholderTextColor="#555"
        autoCapitalize="none"
      />

      <Text style={styles.label}>Temperature: {settings.temperature.toFixed(1)}</Text>
      <View style={styles.tempRow}>
        {[0.1, 0.3, 0.5, 0.7, 0.9, 1.0].map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tempChip, settings.temperature === t && styles.tempChipActive]}
            onPress={() => setSettings(s => ({ ...s, temperature: t }))}
          >
            <Text style={[styles.tempText, settings.temperature === t && styles.tempTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>最大 Tokens</Text>
      <TextInput
        style={styles.input}
        value={String(settings.maxTokens)}
        onChangeText={v => setSettings(s => ({ ...s, maxTokens: parseInt(v) || 4096 }))}
        placeholder="4096"
        placeholderTextColor="#555"
        keyboardType="numeric"
      />

      {/* Test & Save */}
      {testResult && (
        <Text style={[styles.testResult, testResult.startsWith('✅') ? styles.testOk : styles.testFail]}>
          {testResult}
        </Text>
      )}

      <TouchableOpacity style={styles.testBtn} onPress={handleTest} disabled={testing}>
        <Text style={styles.testBtnText}>{testing ? '测试中...' : '🔌 测试连接'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
        <Text style={styles.saveBtnText}>💾 保存设置</Text>
      </TouchableOpacity>

      {/* App Info */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>妙笔 v1.0.0</Text>
        <Text style={styles.footerSub}>AI 驱动的小说写作助手</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 20, paddingBottom: 40 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 50, paddingBottom: 16,
  },
  backBtn: { fontSize: 14, color: COLORS.accent, width: 40 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text },
  section: { fontSize: 16, fontWeight: '600', color: COLORS.text, marginTop: 16, marginBottom: 12 },
  label: { fontSize: 13, color: COLORS.sub, marginBottom: 6, marginTop: 10 },
  input: {
    backgroundColor: COLORS.card, borderRadius: 10, padding: 12, fontSize: 15,
    color: COLORS.text, borderWidth: 1, borderColor: COLORS.border,
  },
  tempRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  tempChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
  },
  tempChipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  tempText: { fontSize: 13, color: COLORS.sub },
  tempTextActive: { color: '#000', fontWeight: '600' },
  testResult: { fontSize: 14, textAlign: 'center', marginTop: 16 },
  testOk: { color: COLORS.accent },
  testFail: { color: COLORS.danger },
  testBtn: {
    marginTop: 16, backgroundColor: COLORS.card, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border,
  },
  testBtnText: { fontSize: 15, color: COLORS.text },
  saveBtn: {
    marginTop: 12, backgroundColor: COLORS.accent, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  saveBtnText: { fontSize: 15, fontWeight: 'bold', color: '#000' },
  footer: { alignItems: 'center', marginTop: 40 },
  footerText: { fontSize: 14, color: COLORS.sub },
  footerSub: { fontSize: 12, color: '#555', marginTop: 4 },
});
