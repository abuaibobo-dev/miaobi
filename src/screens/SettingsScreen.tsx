import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, ScrollView, StatusBar,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { T } from '../lib/theme';
import { Icon } from '../lib/icons';
import * as Speech from 'expo-speech';
import { getSettings, saveSettings } from '../lib/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Props = any;

export default function SettingsScreen({ navigation }: Props) {
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('deepseek-chat');
  const [baseUrl, setBaseUrl] = useState('https://api.deepseek.com');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [notice, setNotice] = useState('');
  const [speechRate, setSpeechRate] = useState(1.0);
  const [clearConfirm, setClearConfirm] = useState(false);

  useEffect(() => {
    getSettings().then(settings => {
      setApiKey(settings.apiKey || '');
      setModel(settings.model || 'deepseek-chat');
      setBaseUrl(settings.baseUrl || 'https://api.deepseek.com');
    });
    AsyncStorage.getItem('miaobi.reader.speechRate').then(value => {
      const rate = Number(value);
      if (rate > 0.3 && rate <= 3) setSpeechRate(rate);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await saveSettings({
      apiKey: apiKey.trim(),
      baseUrl: baseUrl.trim() || 'https://api.deepseek.com',
      model: model.trim() || 'deepseek-chat',
      temperature: 0.7,
      maxTokens: 12000,
    });
    setSaving(false);
    setNotice('已保存');
    setTimeout(() => setNotice(''), 2000);
  };

  const handleTest = async () => {
    setTesting(true);
    setNotice('');
    try {
      await handleSave();
      const response = await fetch(`${baseUrl.trim()}/models`, {
        headers: { Authorization: `Bearer ${apiKey.trim()}` },
      });
      if (response.ok) setNotice('连接正常');
      else {
        const data = await response.json().catch(() => null);
        setNotice(data?.error?.message || `测试失败（${response.status}）`);
      }
    } catch (e: any) {
      setNotice(e.message || '网络错误');
    } finally {
      setTesting(false);
    }
  };

  const testSpeechRate = (rate: number) => {
    setSpeechRate(rate);
    AsyncStorage.setItem('miaobi.reader.speechRate', String(rate));
    Speech.stop();
    setTimeout(() => Speech.speak('这是朗读速度测试。', { language: 'zh-CN', rate }), 200);
  };

  const clearAllData = async () => {
    const keys = await AsyncStorage.getAllKeys();
    await AsyncStorage.removeMany(keys.filter(key => key.startsWith('miaobi.')));
    setNotice('所有数据已清除');
    setClearConfirm(false);
  };

  return (
    <View style={s.screen}>
      <StatusBar barStyle="light-content" backgroundColor={T.bg} />
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backButton}><Icon.back size={19} color={T.text} /></TouchableOpacity>
        <Text style={s.topTitle}>设置</Text>
        <View style={{ width: 37 }} />
      </View>

      <ScrollView contentContainerStyle={s.content}>
        <View style={s.sectionCard}>
          <Text style={s.sectionTitle}>DeepSeek API</Text>
          <Text style={s.hint}>用于找书意图解析和结果排序，不配置也能搜索但排序较基础。</Text>

          <Text style={s.fieldLabel}>API Key</Text>
          <TextInput
            value={apiKey}
            onChangeText={setApiKey}
            placeholder="sk-..."
            placeholderTextColor="#555"
            secureTextEntry
            style={s.input}
            autoCapitalize="none"
          />

          <Text style={s.fieldLabel}>模型</Text>
          <TextInput value={model} onChangeText={setModel} placeholder="deepseek-chat" placeholderTextColor="#555" style={s.input} autoCapitalize="none" />

          <Text style={s.fieldLabel}>Base URL</Text>
          <TextInput value={baseUrl} onChangeText={setBaseUrl} placeholder="https://api.deepseek.com" placeholderTextColor="#555" style={s.input} autoCapitalize="none" keyboardType="url" />
        </View>

        <View style={s.menuGrid}>
          <TouchableOpacity style={s.menuButton} onPress={() => navigation.navigate('AIAssistant')}>
            <Text style={s.menuTitle}>AI 助手</Text><Text style={s.menuDesc}>找书 / 执行任务</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.menuButton} onPress={() => navigation.navigate('Sources')}>
            <Text style={s.menuTitle}>书源管理</Text><Text style={s.menuDesc}>内置 / 自定义</Text>
          </TouchableOpacity>
        </View>

        <View style={s.sectionCard}>
          <Text style={s.sectionTitle}>朗读速度</Text>
          <Text style={s.hint}>用于阅读页的听书功能。</Text>
          <View style={s.speedRow}>
            {[0.5, 0.75, 1.0, 1.25, 1.5].map(rate => (
              <TouchableOpacity key={rate} onPress={() => testSpeechRate(rate)} style={[s.speedButton, speechRate === rate && s.speedActive]}>
                <Text style={[s.speedText, speechRate === rate && s.speedActiveText]}>{rate}x</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={s.sectionCard}>
          <Text style={s.sectionTitle}>数据管理</Text>
          {!clearConfirm ? (
            <TouchableOpacity style={s.dangerButton} onPress={() => setClearConfirm(true)}>
              <Text style={s.dangerText}>清除全部本地数据</Text>
            </TouchableOpacity>
          ) : (
            <View style={s.confirmRow}>
              <Text style={s.confirmText}>确认清除？书架和下载将丢失。</Text>
              <TouchableOpacity style={s.confirmYes} onPress={clearAllData}><Text style={s.confirmYesText}>确认</Text></TouchableOpacity>
              <TouchableOpacity style={s.confirmNo} onPress={() => setClearConfirm(false)}><Text style={s.confirmNoText}>取消</Text></TouchableOpacity>
            </View>
          )}
        </View>

        <TouchableOpacity style={[s.primaryButton, saving && s.disabled]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#111" /> : <Text style={s.primaryText}>保存设置</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={[s.secondaryButton, testing && s.disabled]} onPress={handleTest} disabled={testing}>
          {testing ? <ActivityIndicator color="#E5E5E5" /> : <Text style={s.secondaryText}>测试连接</Text>}
        </TouchableOpacity>

        {!!notice && (
          <View style={s.toast}><Text style={s.toastText}>{notice}</Text></View>
        )}

        <View style={s.aboutCard}>
          <Text style={s.aboutTitle}>关于书海</Text>
          <Text style={s.aboutText}>内容来自古登堡、Open Library、Google Books、Internet Archive、中文维基文库、美国国会图书馆、大都会博物馆和 Wikimedia Commons 等公开来源。仅提供元数据检索和公版正文阅读。</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const s = require('./SettingsScreen.styles').default;
