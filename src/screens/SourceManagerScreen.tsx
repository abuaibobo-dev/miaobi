import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList, KeyboardAvoidingView, Modal, Platform,
  ScrollView, StatusBar, Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { T } from '../lib/theme';
import { Icon } from '../lib/icons';
import { BUILTIN_SOURCE_NAMES } from '../lib/bookSources';
import { getCustomSources, removeCustomSource, saveCustomSources } from '../lib/library';
import { showAlert } from '../components/CustomAlert';
import type { CustomBookSource } from '../types/book';

type Props = any;
const ENABLED_KEY = 'miaobi.enabledSources.v1';
const ALL_BUILTIN = Object.keys(BUILTIN_SOURCE_NAMES);

function autoKind(url: string): 'json' | 'opds' {
  if (/opds|feed|\.xml/i.test(url)) return 'opds';
  return 'json';
}

function normalizeSource(item: any, index: number): CustomBookSource | null {
  if (!item || typeof item !== 'object') {
    if (typeof item === 'string' && /^https?:\/\//i.test(item)) {
      return {
        id: `source_${Date.now()}_${index}`,
        name: '网络书源',
        kind: autoKind(item),
        searchUrl: item,
        createdAt: new Date().toISOString(),
      };
    }
    return null;
  }
  const searchUrl: string | undefined =
    item.searchUrl || item.url || item.api || item.endpoint || item.search_url || item.link;
  if (!searchUrl || typeof searchUrl !== 'string' || !/^https?:\/\//i.test(searchUrl)) return null;
  const kind = item.kind === 'opds' ? 'opds' : autoKind(searchUrl);
  const fields = item.fields && typeof item.fields === 'object' ? item.fields : undefined;
  return {
    id: String(item.id || `source_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`),
    name: String(item.name || item.title || item.label || '未命名书源'),
    kind,
    searchUrl,
    resultsPath: item.resultsPath || item.results || item.path || item.list || undefined,
    fields,
    createdAt: item.createdAt || new Date().toISOString(),
  };
}

function extractSources(raw: any): { sources: CustomBookSource[]; reason?: string } {
  let list: any[] = [];
  if (Array.isArray(raw)) list = raw;
  else if (raw && Array.isArray(raw.sources)) list = raw.sources;
  else if (raw && raw.data && Array.isArray(raw.data.sources)) list = raw.data.sources;
  else if (raw && raw.data && Array.isArray(raw.data)) list = raw.data;
  else if (raw && typeof raw === 'object') list = [raw];
  else return { sources: [], reason: '内容不是有效的 JSON 对象或数组' };
  const sources = list.map((item, index) => normalizeSource(item, index)).filter((item): item is CustomBookSource => Boolean(item));
  if (!sources.length) return { sources: [], reason: '没有找到包含网址的书源条目' };
  return { sources };
}

async function mergeSources(incoming: CustomBookSource[]) {
  const current = await getCustomSources();
  const merged = [
    ...incoming.map(item => ({ ...item, id: item.id || `source_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` })),
    ...current.filter(old => !incoming.some(newItem => newItem.id === old.id)),
  ];
  await saveCustomSources(merged);
  return merged;
}

export default function SourceManagerScreen({ navigation }: Props) {
  const [sources, setSources] = useState<CustomBookSource[]>([]);
  const [enabled, setEnabled] = useState<string[]>(ALL_BUILTIN);
  const [notice, setNotice] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [importingUrl, setImportingUrl] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    kind: 'json' as 'json' | 'opds',
    searchUrl: '',
    resultsPath: '',
    titleField: 'title',
    authorsField: 'authors',
    descriptionField: 'description',
    coverField: 'coverUrl',
    detailField: 'detailUrl',
    downloadField: 'downloadUrl',
  });

  const openEditor = (source?: CustomBookSource) => {
    if (source) {
      setEditingId(source.id);
      const fields = source.fields || {};
      setForm({
        name: source.name,
        kind: source.kind,
        searchUrl: source.searchUrl,
        resultsPath: source.resultsPath || '',
        titleField: fields.title || 'title',
        authorsField: fields.authors || 'authors',
        descriptionField: fields.description || 'description',
        coverField: fields.coverUrl || 'coverUrl',
        detailField: fields.detailUrl || 'detailUrl',
        downloadField: fields.downloadUrl || 'downloadUrl',
      });
    } else {
      setEditingId(null);
      setForm({ name: '', kind: 'json', searchUrl: '', resultsPath: '', titleField: 'title', authorsField: 'authors', descriptionField: 'description', coverField: 'coverUrl', detailField: 'detailUrl', downloadField: 'downloadUrl' });
    }
    setShowEditor(true);
  };

  useFocusEffect(useCallback(() => {
    getCustomSources().then(setSources);
    AsyncStorage.getItem(ENABLED_KEY).then(raw => {
      const value = raw ? JSON.parse(raw) : ALL_BUILTIN;
      setEnabled(Array.isArray(value) ? value : ALL_BUILTIN);
    });
  }, []));

  useEffect(() => {
    AsyncStorage.setItem(ENABLED_KEY, JSON.stringify(enabled));
  }, [enabled]);

  const importSource = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;
      const { File } = await import('expo-file-system');
      const file = new File(result.assets[0].uri);
      let data: any;
      try { data = JSON.parse(await file.text()); }
      catch { throw new Error('文件不是有效 JSON'); }
      const { sources, reason } = extractSources(data);
      if (!sources.length) throw new Error(reason || '书源格式无效');
      const merged = await mergeSources(sources);
      setSources(merged);
      setNotice(`已导入 ${sources.length} 个书源`);
    } catch (error: any) {
      showAlert('导入失败', error.message || '无法读取书源');
    }
  };

  const importFromUrl = async () => {
    const url = urlInput.trim();
    if (!url || importingUrl) return;
    if (!/^https?:\/\/\S+$/i.test(url)) {
      setNotice('请输入有效的 http(s) 网址');
      return;
    }
    setImportingUrl(true);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`下载失败（${response.status}）`);
      let data: any;
      try { data = await response.json(); }
      catch { throw new Error('该网址返回的不是 JSON'); }
      const { sources, reason } = extractSources(data);
      if (!sources.length) throw new Error(reason || '书源格式无效');
      const merged = await mergeSources(sources);
      setSources(merged);
      setUrlInput('');
      setNotice(`已导入 ${sources.length} 个书源`);
    } catch (error: any) {
      setNotice(error.message || '导入失败');
    } finally {
      setImportingUrl(false);
    }
  };

  const saveForm = async () => {
    if (!form.name.trim() || !form.searchUrl.trim()) {
      showAlert('提示', '书源名称和搜索地址不能为空');
      return;
    }
    const current = await getCustomSources();
    const item: CustomBookSource = {
      id: editingId || `source_${Date.now()}`,
      name: form.name.trim(),
      kind: form.kind,
      searchUrl: form.searchUrl.trim(),
      resultsPath: form.resultsPath.trim() || undefined,
      fields: form.kind === 'json' ? {
        title: form.titleField.trim(),
        authors: form.authorsField.trim(),
        description: form.descriptionField.trim(),
        coverUrl: form.coverField.trim(),
        detailUrl: form.detailField.trim(),
        downloadUrl: form.downloadField.trim(),
      } : undefined,
      createdAt: new Date().toISOString(),
    };
    const merged = editingId
      ? current.map(old => old.id === editingId ? item : old)
      : [item, ...current];
    await saveCustomSources(merged);
    setSources(merged);
    setShowEditor(false);
    setNotice(editingId ? '书源已更新' : '书源已添加');
  };

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="light-content" backgroundColor={T.bg} />
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}><Icon.back size={19} color={T.text} /></TouchableOpacity>
        <Text style={s.title}>书源管理</Text>
        <TouchableOpacity onPress={() => openEditor()} style={s.addButton}><Text style={s.addText}>新增</Text></TouchableOpacity>
        <TouchableOpacity onPress={importSource} style={s.addButton}><Text style={s.addText}>导入</Text></TouchableOpacity>
      </View>

      {!!notice && <Text style={s.notice}>{notice}</Text>}
      <View style={s.urlBar}>
        <TextInput
          value={urlInput}
          onChangeText={setUrlInput}
          placeholder="粘贴书源 JSON 地址（.json 结尾）"
          placeholderTextColor={T.textMuted}
          autoCapitalize="none"
          keyboardType="url"
          style={s.urlInput}
        />
        <TouchableOpacity style={[s.urlButton, importingUrl && s.disabled]} onPress={importFromUrl} disabled={importingUrl}>
          <Text style={s.urlButtonText}>{importingUrl ? '导入中' : '导入'}</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={s.templateRow} onPress={() => showAlert('书源格式示例', '支持多种形式，字段名不固定也会自动识别：\n\n单条：\n{"name":"示例源","searchUrl":"https://api.example.com/books?q={query}"}\n\n多条：\n{"sources":[{"name":"源1","url":"https://a.com/s?q={query}"},{"name":"源2","searchUrl":"https://b.com/search?query={query}"}]}\n\nOPDS：\n{"name":"OPDS源","kind":"opds","searchUrl":"https://opds.example.com/search?q={query}"}')}>
        <Text style={s.templateText}>看不懂格式？点这里看示例</Text>
      </TouchableOpacity>
      {sources.length > 0 && (
        <TouchableOpacity style={s.batchDeleteBtn} onPress={() => {
          showAlert('批量删除', `确定要删除全部 ${sources.length} 个自定义书源吗？`, [
            { text: '取消', style: 'cancel' },
            { text: '全部删除', style: 'destructive', onPress: async () => {
              await saveCustomSources([]);
              setSources([]);
            }},
          ]);
        }}>
          <Text style={s.batchDeleteText}>🗑️ 清除全部自定义书源 ({sources.length})</Text>
        </TouchableOpacity>
      )}
      <FlatList
        data={[...sources.map(source => ({ key: source.id, name: source.name, detail: source.kind.toUpperCase() + ' · 自定义', enabled: true, removable: true })), ...ALL_BUILTIN.map(key => ({ key, name: BUILTIN_SOURCE_NAMES[key], detail: '内置公开源', enabled: enabled.includes(key), removable: false }))]}
        keyExtractor={item => item.key}
        contentContainerStyle={s.list}
        renderItem={({ item }) => (
          <View style={s.card}>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{item.name}</Text>
              <Text style={s.detail}>{item.detail}</Text>
            </View>
            {item.removable ? (
              <View style={s.customActions}>
                <TouchableOpacity onPress={() => openEditor(sources.find(source => source.id === item.key))}><Text style={[s.remove, s.edit]}>编辑</Text></TouchableOpacity>
                <TouchableOpacity onPress={async () => {
                  await removeCustomSource(item.key);
                  setSources(await getCustomSources());
                }}><Text style={s.remove}>删除</Text></TouchableOpacity>
              </View>
            ) : (
              <Switch
                value={item.enabled}
                onValueChange={value => setEnabled(prev => value ? [...prev, item.key] : prev.filter(key => key !== item.key))}
                thumbColor="#E5E5E5"
                trackColor={{ false: T.surface2, true: T.grey }}
              />
            )}
          </View>
        )}
      />

      <Modal visible={showEditor} transparent animationType="fade" onRequestClose={() => setShowEditor(false)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setShowEditor(false)}>
          <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()} style={s.editorCard}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 12 }}>
              <Text style={s.editorTitle}>{editingId ? '编辑书源' : '新增自定义书源'}</Text>
              <Text style={s.fieldLabel}>名称</Text>
              <TextInput style={s.input} value={form.name} onChangeText={value => setForm(prev => ({ ...prev, name: value }))} placeholder="我的书源" placeholderTextColor={T.textMuted} />
              <Text style={s.fieldLabel}>类型</Text>
              <View style={s.kindRow}>
                {(['json', 'opds'] as const).map(kind => (
                  <TouchableOpacity key={kind} onPress={() => setForm(prev => ({ ...prev, kind }))} style={[s.kindButton, form.kind === kind && s.kindActive]}>
                    <Text style={[s.kindText, form.kind === kind && s.kindActiveText]}>{kind.toUpperCase()}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={s.fieldLabel}>搜索地址（{'{query}'} 为占位符）</Text>
              <TextInput style={s.inputUrl} value={form.searchUrl} onChangeText={value => setForm(prev => ({ ...prev, searchUrl: value }))} placeholder={form.kind === 'opds' ? 'https://example.com/search?query={query}' : 'https://api.example.com/books?q={query}'} placeholderTextColor={T.textMuted} autoCapitalize="none" keyboardType="url" multiline />
              {form.kind === 'json' && (
                <>
                  <Text style={s.fieldLabel}>结果路径（可选，如 data.books）</Text>
                  <TextInput style={s.input} value={form.resultsPath} onChangeText={value => setForm(prev => ({ ...prev, resultsPath: value }))} placeholder="data.books" placeholderTextColor={T.textMuted} autoCapitalize="none" />
                  <Text style={s.fieldLabel}>字段映射</Text>
                  <TextInput style={s.input} value={form.titleField} onChangeText={value => setForm(prev => ({ ...prev, titleField: value }))} placeholder="标题字段" placeholderTextColor={T.textMuted} autoCapitalize="none" />
                  <TextInput style={s.input} value={form.authorsField} onChangeText={value => setForm(prev => ({ ...prev, authorsField: value }))} placeholder="作者字段" placeholderTextColor={T.textMuted} autoCapitalize="none" />
                  <TextInput style={s.input} value={form.descriptionField} onChangeText={value => setForm(prev => ({ ...prev, descriptionField: value }))} placeholder="简介字段" placeholderTextColor={T.textMuted} autoCapitalize="none" />
                  <TextInput style={s.input} value={form.coverField} onChangeText={value => setForm(prev => ({ ...prev, coverField: value }))} placeholder="封面字段" placeholderTextColor={T.textMuted} autoCapitalize="none" />
                  <TextInput style={s.input} value={form.downloadField} onChangeText={value => setForm(prev => ({ ...prev, downloadField: value }))} placeholder="正文下载字段" placeholderTextColor={T.textMuted} autoCapitalize="none" />
                </>
              )}
              <View style={s.editorButtons}>
                <TouchableOpacity style={s.cancelButton} onPress={() => setShowEditor(false)}><Text style={s.cancelText}>取消</Text></TouchableOpacity>
                <TouchableOpacity style={s.saveButton} onPress={saveForm}><Text style={s.saveText}>保存</Text></TouchableOpacity>
              </View>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const s = require('./SourceManagerScreen.styles').default;
