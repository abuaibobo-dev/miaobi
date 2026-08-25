import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, ScrollView, StatusBar, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { T } from '../lib/theme';
import { getSettings, saveSettings } from '../lib/storage';
import { getBackendUrl, setBackendUrl } from '../lib/backend';
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
  const [backendUrl, setBackendUrlState] = useState('');
  const [groqKey, setGroqKey] = useState('');
  const [sambanovaKey, setSambanovaKey] = useState('');
  const [cerebrasKey, setCerebrasKey] = useState('');

  useEffect(() => {
    getBackendUrl().then(url => setBackendUrlState(url || ''));
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
        const res = await fetch(`${p.id === 'groq' ? 'https://api.groq.com' : p.id === 'sambanova' ? 'https://api.sambanova.ai' : 'https://api.cerebras.ai'}/v1/models`, { signal: AbortSignal.timeout(8000) });
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
        <Text style={s.headerTitle}>设置</Text>
        <View style={{ width: 37 }} />
      </View>
      <ScrollView contentContainerStyle={s.content}>
        {/* Model Selection */}
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

        {/* Backend URL */}
        <Text style={s.sectionTitle}>后端服务</Text>
        <Text style={s.hint}>配置后端 API 地址，实现多模型调度和 Boogu-Image 生图。不配置则使用本地直连。</Text>
        <TextInput
          value={backendUrl}
          onChangeText={setBackendUrlState}
          placeholder="http://your-server:8000"
          placeholderTextColor={T.textDim}
          style={s.input}
          autoCapitalize="none"
          keyboardType="url"
        />
        <TouchableOpacity style={[s.secondaryBtn, { marginTop: 8, paddingVertical: 10 }]} onPress={async () => {
          await setBackendUrl(backendUrl.trim());
          setNotice('✅ 后端地址已保存');
          setTimeout(() => setNotice(''), 2000);
        }}>
          <Text style={s.secondaryBtnText}>保存后端地址</Text>
        </TouchableOpacity>

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
          <TouchableOpacity style={s.secondaryBtn} onPress={handleTest} disabled={testing}>
            {testing ? <ActivityIndicator color={T.grey} /> : <Text style={s.secondaryBtnText}>测试连接</Text>}
          </TouchableOpacity>
        </View>

        {notice ? <Text style={[s.notice, notice.startsWith('✅') ? { color: '#6ECF8A' } : { color: '#D68080' }]}>{notice}</Text> : null}

        {/* Navigation */}
        <Text style={[s.sectionTitle, { marginTop: 24 }]}>功能</Text>
        {[
          { label: '书源管理', desc: '内置 / 自定义书源', screen: 'Sources' },
          { label: 'AI 写作', desc: '创作 / 续写 / 润色', screen: 'Writing' },
          { label: '找书助手', desc: 'AI 搜索推荐', screen: 'AIAssistant' },
          { label: '我的书架', desc: '已收藏的书籍', screen: 'Shelf' },
        ].map(item => (
          <TouchableOpacity key={item.screen} style={s.navCard} onPress={() => navigation.navigate(item.screen)}>
            <Text style={s.navLabel}>{item.label}</Text>
            <Text style={s.navDesc}>{item.desc}</Text>
            <Text style={s.navArrow}>→</Text>
          </TouchableOpacity>
        ))}

        <Text style={s.about}>妙笔 v2.5.0 · 黑白灰主题 · AI 写作 + 找书 + 阅读</Text>
      </ScrollView>
    </View>
  );
}

const s: any = {
  container: { flex: 1, backgroundColor: T.bg },
  header: { paddingTop: 50, paddingBottom: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: T.bg, borderBottomWidth: 1, borderBottomColor: T.border },
  backBtn: { width: 37, height: 37, alignItems: 'center', justifyContent: 'center' },
  backText: { color: T.text, fontSize: 20 },
  headerTitle: { color: T.text, fontSize: 18, fontWeight: '700' },
  content: { padding: 16, paddingBottom: 40 },
  sectionTitle: { color: T.text, fontSize: 16, fontWeight: '800', marginBottom: 6, marginTop: 16 },
  hint: { color: T.textMuted, fontSize: 12, marginBottom: 12 },
  providerCard: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: T.border, marginBottom: 8 },
  providerActive: { borderColor: T.white, backgroundColor: T.surface2 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: T.borderLight, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  radioActive: { backgroundColor: T.white },
  providerLabel: { color: T.text, fontSize: 14, fontWeight: '700' },
  providerDesc: { color: T.textMuted, fontSize: 11, marginTop: 2 },
  card: { backgroundColor: T.surface2, borderRadius: 12, padding: 14, marginTop: 8 },
  fieldLabel: { color: T.textSecondary, fontSize: 12, marginBottom: 4, marginTop: 10 },
  input: { color: T.text, fontSize: 14, backgroundColor: T.surface, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: T.border },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
  primaryBtn: { flex: 1, backgroundColor: T.white, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  primaryBtnText: { color: T.black, fontSize: 15, fontWeight: '700' },
  secondaryBtn: { flex: 1, backgroundColor: T.surface2, borderRadius: 10, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: T.border },
  secondaryBtnText: { color: T.text, fontSize: 15, fontWeight: '600' },
  notice: { textAlign: 'center', marginTop: 12, fontSize: 14 },
  navCard: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: T.border, marginBottom: 8 },
  navLabel: { flex: 1, color: T.text, fontSize: 14, fontWeight: '600' },
  navDesc: { color: T.textMuted, fontSize: 11, marginRight: 8 },
  navArrow: { color: T.grey, fontSize: 16 },
  about: { color: T.textDim, fontSize: 11, textAlign: 'center', marginTop: 30 },
};
