import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { T } from '../lib/theme';
import { getSettings, saveSettings } from '../lib/storage';

import { getFreeProviderKeys, saveFreeProviderKeys } from '../lib/freeProviders';

type Props = any;

const PROVIDERS = [
  { id: 'deepseek', label: 'DeepSeek', desc: '最强中文能力，需 API Key', needsKey: true },
  { id: 'groq', label: 'Groq (Llama 3)', desc: '免费，速度快，无内容限制', needsKey: false },
  { id: 'sambanova', label: 'SambaNova', desc: '免费，Llama 3，无限制', needsKey: false },
  { id: 'cerebras', label: 'Cerebras', desc: '免费，Llama 3，无限制', needsKey: false },
] as const;

export default function SettingsScreen({ navigation }: Props) {
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('deepseek-chat');
  const [baseUrl, setBaseUrl] = useState('https://api.deepseek.com');
  const [provider, setProvider] = useState<string>('deepseek');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [notice, setNotice] = useState('');

  const [groqKey, setGroqKey] = useState('');
  const [sambanovaKey, setSambanovaKey] = useState('');
  const [cerebrasKey, setCerebrasKey] = useState('');

  useEffect(() => {

    getFreeProviderKeys().then(k => {
      setGroqKey(k.groq || '');
      setSambanovaKey(k.sambanova || '');
      setCerebrasKey(k.cerebras || '');
    });
    getSettings().then((s: any) => {
      setApiKey(s.apiKey || '');
      setModel(s.model || 'deepseek-chat');
      setBaseUrl(s.baseUrl || 'https://api.deepseek.com');
      setProvider(s.provider || 'deepseek');
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await saveSettings({
      apiKey: apiKey.trim(),
      baseUrl: baseUrl.trim() || 'https://api.deepseek.com',
      model: model.trim() || 'deepseek-chat',
      provider,
      temperature: 0.7,
      maxTokens: 12000,
    } as any);
    await saveFreeProviderKeys({ groq: groqKey.trim(), sambanova: sambanovaKey.trim(), cerebras: cerebrasKey.trim() });
    setSaving(false);
    setNotice('✅ 已保存');
    setTimeout(() => setNotice(''), 2000);
  };

  const handleTest = async () => {
    setTesting(true);
    setNotice('');
    try {
      await handleSave();
      if (provider === 'deepseek') {
        const res = await fetch(`${baseUrl.trim()}/models`, { headers: { Authorization: `Bearer ${apiKey.trim()}` } });
        if (res.ok) setNotice('✅ 连接正常');
        else { const d = await res.json().catch(() => null); setNotice(d?.error?.message || `❌ 失败（${res.status}）`); }
      } else {
        const p = PROVIDERS.find(p => p.id === provider)!;
        const providerKey = p.id === 'groq' ? groqKey : p.id === 'sambanova' ? sambanovaKey : cerebrasKey;
        if (!providerKey.trim()) throw new Error(`请先填写 ${p.label} API Key`);
        const res = await fetch(`${p.id === 'groq' ? 'https://api.groq.com/openai' : p.id === 'sambanova' ? 'https://api.sambanova.ai' : 'https://api.cerebras.ai'}/v1/models`, {
          headers: { Authorization: `Bearer ${providerKey.trim()}` },
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) setNotice('✅ 连接正常');
        else setNotice(`❌ 测试失败（${res.status}）`);
      }
    } catch (e: any) { setNotice(`❌ ${e.message}`); }
    finally { setTesting(false); }
  };

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={T.bg} />
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}><Text style={s.backText}>←</Text></TouchableOpacity>
        <View style={{ flex: 1 }} />
        <Text style={s.headerTitle}>设置</Text>
        <View style={{ flex: 1 }} />
      </View>
      <ScrollView contentContainerStyle={s.content}>
        {/* Model Selection */}
        <View style={s.divider} />
        <Text style={s.sectionTitle}>AI 模型</Text>
        <Text style={s.hint}>选择用于写作和找书的模型。免费模型无需 API Key。</Text>
        {PROVIDERS.map(p => (
          <TouchableOpacity key={p.id} style={[s.providerCard, provider === p.id && s.providerActive]} onPress={() => setProvider(p.id)}>
            <View style={s.radio}>
              <View style={[s.radioDot, provider === p.id && s.radioActive]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.providerLabel}>{p.label}</Text>
              <Text style={s.providerDesc}>{p.desc}</Text>
            </View>
          </TouchableOpacity>
        ))}



        {/* DeepSeek Config */}
        {provider === 'deepseek' && (
          <View style={s.card}>
            <Text style={s.fieldLabel}>API Key</Text>
            <TextInput value={apiKey} onChangeText={setApiKey} placeholder="sk-..." placeholderTextColor={T.textDim} style={s.input} secureTextEntry autoCapitalize="none" />
            <Text style={s.fieldLabel}>模型</Text>
            <TextInput value={model} onChangeText={setModel} placeholder="deepseek-chat" placeholderTextColor={T.textDim} style={s.input} autoCapitalize="none" />
            <Text style={s.fieldLabel}>Base URL</Text>
            <TextInput value={baseUrl} onChangeText={setBaseUrl} placeholder="https://api.deepseek.com" placeholderTextColor={T.textDim} style={s.input} autoCapitalize="none" keyboardType="url" />
          </View>
        )}

        <View style={s.divider} />
        {/* Free Provider Keys */}
        <Text style={s.sectionTitle}>免费模型 Key（成人文学用）</Text>
        <Text style={s.hint}>免费注册获取 Key，用于无审查的成人文学创作。不填则跳过该模型。</Text>
        <View style={s.card}>
          <Text style={s.fieldLabel}>Groq Key</Text>
          <TextInput value={groqKey} onChangeText={setGroqKey} placeholder="gsk_..." placeholderTextColor={T.textDim} style={s.input} secureTextEntry autoCapitalize="none" />
          <Text style={s.fieldLabel}>SambaNova Key</Text>
          <TextInput value={sambanovaKey} onChangeText={setSambanovaKey} placeholder="..." placeholderTextColor={T.textDim} style={s.input} secureTextEntry autoCapitalize="none" />
          <Text style={s.fieldLabel}>Cerebras Key</Text>
          <TextInput value={cerebrasKey} onChangeText={setCerebrasKey} placeholder="..." placeholderTextColor={T.textDim} style={s.input} secureTextEntry autoCapitalize="none" />
        </View>

        {/* Actions */}
        <View style={s.btnRow}>
          <TouchableOpacity style={s.primaryBtn} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color={T.black} /> : <Text style={s.primaryBtnText}>保存</Text>}
          </TouchableOpacity>
        </View>

        {notice ? <Text style={[s.notice, notice.startsWith('✅') ? { color: T.success } : { color: T.error }]}>{notice}</Text> : null}

        <Text style={s.about}>妙笔 v2.5.32 · 黑白灰 · AI写作 + 找书 + 阅读 + 成人文学</Text>
      </ScrollView>
    </View>
  );
}

const s: any = {
  container: { flex: 1, backgroundColor: T.bg },
  header: { paddingTop: 48, paddingBottom: 10, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: T.bg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: T.border },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  backText: { color: T.text, fontSize: 18 },
  headerTitle: { color: T.text, fontSize: 16, fontWeight: '700' },
  content: { padding: 12, paddingBottom: 40 },
  sectionTitle: { color: T.text, fontSize: 12, fontWeight: '700', marginBottom: 4, marginTop: 10, letterSpacing: 0.5, textTransform: 'uppercase' as any },
  hint: { color: T.textMuted, fontSize: 10, marginBottom: 6, lineHeight: 14 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: T.border, marginVertical: 8 },
  providerCard: { flexDirection: 'row', alignItems: 'center', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: T.border, marginBottom: 5 },
  providerActive: { borderColor: T.white, backgroundColor: T.surface2 },
  radio: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: T.borderLight, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  radioDot: { width: 8, height: 8, borderRadius: 4 },
  radioActive: { backgroundColor: T.white },
  providerLabel: { color: T.text, fontSize: 13, fontWeight: '600' },
  providerDesc: { color: T.textMuted, fontSize: 10, marginTop: 1 },
  card: { backgroundColor: T.surface2, borderRadius: 8, padding: 8, marginTop: 4 },
  fieldLabel: { color: T.textSecondary, fontSize: 10, marginBottom: 2, marginTop: 6 },
  input: { color: T.text, fontSize: 12, backgroundColor: T.surface, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 7, borderWidth: StyleSheet.hairlineWidth, borderColor: T.border },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  primaryBtn: { flex: 1, backgroundColor: T.white, borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  primaryBtnText: { color: T.black, fontSize: 13, fontWeight: '700' },
  secondaryBtn: { flex: 1, backgroundColor: T.surface2, borderRadius: 8, paddingVertical: 8, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: T.border },
  secondaryBtnText: { color: T.text, fontSize: 13, fontWeight: '600' },
  notice: { textAlign: 'center', marginTop: 8, fontSize: 12 },
  navCard: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: T.border, marginBottom: 6 },
  navLabel: { flex: 1, color: T.text, fontSize: 13, fontWeight: '600' },
  about: { color: T.textDim, fontSize: 10, textAlign: 'center', marginTop: 24 },
};
