import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { T } from '../lib/theme';
import { getSettings, saveSettings } from '../lib/storage';

import { getFreeProviderKeys, saveFreeProviderKeys } from '../lib/freeProviders';
import { showAlert } from '../components/CustomAlert';
import pkg from '../../package.json';

type Props = any;

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
  const [adultContent, setAdultContent] = useState(true);
  const [useLocalModels, setUseLocalModels] = useState(false);
  const [privacyMode, setPrivacyMode] = useState(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);



  useEffect(() => {


    getSettings().then((s: any) => {
      setApiKey(s.apiKey || '');
      setModel(s.model || 'deepseek-chat');
      setBaseUrl(s.baseUrl || 'https://api.deepseek.com');
      setProvider(s.provider || 'deepseek');
      setAdultContent(s.adultContent !== false);
      setUseLocalModels(s.useLocalModels === true);
      setPrivacyMode(s.privacyMode === true);
    });
    getFreeProviderKeys().then(k => {
      setGroqKey(k.groq || '');
      setSambanovaKey(k.sambanova || '');
      setCerebrasKey(k.cerebras || '');
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    clearTimeout((noticeTimer.current as any));
    const existing = await getSettings() as any;
    await saveSettings({
      ...existing,
      apiKey: apiKey.trim(),
      baseUrl: baseUrl.trim() || 'https://api.deepseek.com',
      model: model.trim() || 'deepseek-chat',
      provider,
      temperature: existing.temperature ?? 0.7,
      maxTokens: existing.maxTokens ?? 12000,
      adultContent,
      useLocalModels,
      privacyMode,
    } as any);
    await saveFreeProviderKeys({
      groq: groqKey.trim(),
      sambanova: sambanovaKey.trim(),
      cerebras: cerebrasKey.trim(),
    });

    setSaving(false);
    setNotice('✅ 已保存');
    noticeTimer.current = setTimeout(() => setNotice(''), 2000);
  };

  const handleTest = async () => {
    setTesting(true);
    setNotice('');
    clearTimeout((noticeTimer.current as any));
    try {
      await handleSave();
      let ok = 0;
      const res = await fetch(`${baseUrl.trim()}/models`, { headers: { Authorization: `Bearer ${apiKey.trim()}` } });
      if (res.ok) ok++;
      const backupTests: Array<[string, string]> = [
        ['Groq', groqKey.trim()], ['SambaNova', sambanovaKey.trim()], ['Cerebras', cerebrasKey.trim()],
      ];
      for (const [name, key] of backupTests) {
        if (!key) continue;
        const url = name === 'Groq' ? 'https://api.groq.com/openai' : name === 'SambaNova' ? 'https://api.sambanova.ai' : 'https://api.cerebras.ai';
        const r = await fetch(`${url}/v1/models`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000) });
        if (r.ok) ok++;
      }
      setNotice(ok >= 1 ? `${ok} 个引擎连接正常` : '❌ 全部连接失败');
    } catch (e: any) { setNotice(`❌ ${e.message}`); }
    finally { setTesting(false); }
  };

  return (
    <View style={s.container}>
      
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}><Text style={s.backText}>←</Text></TouchableOpacity>
        <View style={{ flex: 1 }} />
        <Text style={s.headerTitle}>设置</Text>
        <View style={{ flex: 1 }} />
      </View>
      <ScrollView contentContainerStyle={s.content}>
        {/* Model Selection */}
        <View style={s.divider} />
        <Text style={s.sectionTitle}>模型与密钥</Text>
        <Text style={s.hint}>选择用于写作和找书的模型。免费模型无需 API Key。</Text>
        {/* 主引擎：DeepSeek（固定，其余为备用兜底） */}
        <View style={s.card}>
          <Text style={s.fieldLabel}>主引擎 · DeepSeek</Text>
          <Text style={s.hint}>中文创作首选，始终生效（写作/找书/成人文学均走此引擎）</Text>
          <Text style={s.fieldLabel}>API Key</Text>
          <TextInput value={apiKey} onChangeText={setApiKey} placeholder="sk-..." placeholderTextColor={T.textDim} style={s.input} secureTextEntry autoCapitalize="none" />
          <Text style={s.fieldLabel}>模型</Text>
          <TextInput value={model} onChangeText={setModel} placeholder="deepseek-chat" placeholderTextColor={T.textDim} style={s.input} autoCapitalize="none" />
          <Text style={s.fieldLabel}>Base URL</Text>
          <TextInput value={baseUrl} onChangeText={setBaseUrl} placeholder="https://api.deepseek.com" placeholderTextColor={T.textDim} style={s.input} autoCapitalize="none" keyboardType="url" />
        </View>

        <Text style={s.sectionTitle}>备用免费引擎</Text>
        <Text style={s.hint}>当 DeepSeek 无 Key 或调用失败时自动启用，不会作为主引擎切换</Text>
        <View style={s.card}>
          <Text style={s.fieldLabel}>Groq API Key</Text>
          <TextInput value={groqKey} onChangeText={setGroqKey} placeholder="gsk_...（备用）" placeholderTextColor={T.textDim} style={s.input} secureTextEntry autoCapitalize="none" />
        </View>
        <View style={s.card}>
          <Text style={s.fieldLabel}>SambaNova API Key</Text>
          <TextInput value={sambanovaKey} onChangeText={setSambanovaKey} placeholder="备用 Key" placeholderTextColor={T.textDim} style={s.input} secureTextEntry autoCapitalize="none" />
        </View>
        <View style={s.card}>
          <Text style={s.fieldLabel}>Cerebras API Key</Text>
          <TextInput value={cerebrasKey} onChangeText={setCerebrasKey} placeholder="备用 Key" placeholderTextColor={T.textDim} style={s.input} secureTextEntry autoCapitalize="none" />
        </View>



        {/* 成人内容开关 */}
        <View style={s.divider} />
        <Text style={s.sectionTitle}>隐私与内容</Text>
        <View style={s.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={s.fieldLabel}>成人文学</Text>
              <Text style={s.hint}>开启后支持 R 级成人文学创作（仅限成年、双方自愿的虚构角色与情节）。注意：内容会发送至 DeepSeek 云端</Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                if (adultContent) { setAdultContent(false); return; }
                showAlert(
                  '成人内容确认',
                  '开启前请确认你已年满 18 周岁，且仅浏览合法成人内容。',
                  [
                    { text: '取消', style: 'cancel' },
                    { text: '我已年满18岁', style: 'default', onPress: () => { AsyncStorage.setItem('miaobi.adultConfirmed', 'yes'); setAdultContent(true); } },
                  ],
                );
              }}
              style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: adultContent ? T.success : T.surface, borderWidth: 1, borderColor: adultContent ? T.success : T.border, padding: 2, justifyContent: 'center' }}
            >
              <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: adultContent ? T.black : T.textMuted, alignSelf: adultContent ? 'flex-end' : 'flex-start' }} />
            </TouchableOpacity>
          </View>
        </View>

        {/* 隐私模式 */}
        <View style={s.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={s.fieldLabel}>私密模式</Text>
              <Text style={s.hint}>隐藏书架与创作列表中的标题预览，防止他人窥屏</Text>
            </View>
            <TouchableOpacity
              onPress={() => setPrivacyMode(v => !v)}
              style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: privacyMode ? T.success : T.surface, borderWidth: 1, borderColor: privacyMode ? T.success : T.border, padding: 2, justifyContent: 'center' }}
            >
              <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: privacyMode ? T.black : T.textMuted, alignSelf: privacyMode ? 'flex-end' : 'flex-start' }} />
            </TouchableOpacity>
          </View>
        </View>

        {/* 本地模型开关 */}
        <View style={s.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={s.fieldLabel}>本地模型</Text>
              <Text style={s.hint}>默认关闭（完全使用 DeepSeek 云端）。开启后可选本地模型，用于无审查或离线场景</Text>
            </View>
            <TouchableOpacity
              onPress={() => setUseLocalModels(v => !v)}
              style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: useLocalModels ? T.success : T.surface, borderWidth: 1, borderColor: useLocalModels ? T.success : T.border, padding: 2, justifyContent: 'center' }}
            >
              <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: useLocalModels ? T.black : T.textMuted, alignSelf: useLocalModels ? 'flex-end' : 'flex-start' }} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Actions */}
        <View style={s.btnRow}>
          <TouchableOpacity style={s.primaryBtn} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color={T.black} /> : <Text style={s.primaryBtnText}>保存</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={s.testBtn} onPress={handleTest} disabled={testing}>
            {testing ? <ActivityIndicator color={T.white} /> : <Text style={s.testBtnText}>测试连接</Text>}
          </TouchableOpacity>
        </View>

        {notice ? <Text style={[s.notice, notice.startsWith('✅') ? { color: T.success } : { color: T.error }]}>{notice}</Text> : null}

        <TouchableOpacity style={s.navCard} onPress={() => navigation.navigate('Sources' as any)}>
          <Text style={s.navLabel}>书源管理</Text>
          <Text style={{ color: T.textMuted, fontSize: 11 }}>导入/启用在线书源 →</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.navCard} onPress={() => navigation.navigate('CustomSources' as any)}>
          <Text style={s.navLabel}>自定义书源</Text>
          <Text style={{ color: T.textMuted, fontSize: 11 }}>管理自定义 JSON 书源 →</Text>
        </TouchableOpacity>

        <Text style={s.about}>妙笔 v{pkg.version} · 黑白灰 · AI写作 + 找书 + 阅读 + 成人文学</Text>
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
  testBtn: { backgroundColor: T.surface2, borderRadius: 6, paddingVertical: 9, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: T.border },
  testBtnText: { color: T.text, fontSize: 13, fontWeight: '600' },
  primaryBtn: { flex: 1, backgroundColor: T.white, borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  primaryBtnText: { color: T.black, fontSize: 13, fontWeight: '700' },
  secondaryBtn: { flex: 1, backgroundColor: T.surface2, borderRadius: 8, paddingVertical: 8, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: T.border },
  secondaryBtnText: { color: T.text, fontSize: 13, fontWeight: '600' },
  notice: { textAlign: 'center', marginTop: 8, fontSize: 12 },
  navCard: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: T.border, marginBottom: 6 },
  navLabel: { flex: 1, color: T.text, fontSize: 13, fontWeight: '600' },
  about: { color: T.textDim, fontSize: 10, textAlign: 'center', marginTop: 24 },
};
