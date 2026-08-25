import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, FlatList, KeyboardAvoidingView, Modal, Platform,
  ScrollView, StatusBar, Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { T } from '../lib/theme';
import { Icon } from '../lib/icons';
import { BUILTIN_SOURCE_NAMES } from '../lib/bookSources';
import { getCustomSources, removeCustomSource, saveCustomSources } from '../lib/library';
import type { CustomBookSource } from '../types/book';

type Props = any;
const ENABLED_KEY = 'miaobi.enabledSources.v1';
const ALL_BUILTIN = Object.keys(BUILTIN_SOURCE_NAMES);

export default function SourceManagerScreen({ navigation }: Props) {
  const [sources, setSources] = useState<CustomBookSource[]>([]);
  const [enabled, setEnabled] = useState<string[]>(ALL_BUILTIN);
  const [notice, setNotice] = useState('');
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
      const data = JSON.parse(await file.text());
      const incoming: CustomBookSource[] = Array.isArray(data.sources) ? data.sources : [data];
      const valid = incoming.filter(item => item.name && item.searchUrl && ['json', 'opds'].includes(item.kind));
      if (!valid.length) throw new Error('书源格式无效，需要 name/kind/searchUrl');
      const current = await getCustomSources();
      const merged = [...valid.map((item, index) => ({
        ...item,
        id: item.id || `source_${Date.now()}_${index}`,
        createdAt: item.createdAt || new Date().toISOString(),
      })), ...current.filter(old => !valid.some(newItem => newItem.id === old.id))];
      await saveCustomSources(merged as CustomBookSource[]);
      setSources(merged);
      setNotice(`已导入 ${valid.length} 个书源`);
    } catch (error: any) {
      Alert.alert('导入失败', error.message || '无法读取书源');
    }
  };

  const saveForm = async () => {
    if (!form.name.trim() || !form.searchUrl.trim()) {
      Alert.alert('提示', '书源名称和搜索地址不能为空');
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
                trackColor={{ false: '#333', true: '#777' }}
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
              <TextInput style={s.input} value={form.name} onChangeText={value => setForm(prev => ({ ...prev, name: value }))} placeholder="我的书源" placeholderTextColor="#555" />
              <Text style={s.fieldLabel}>类型</Text>
              <View style={s.kindRow}>
                {(['json', 'opds'] as const).map(kind => (
                  <TouchableOpacity key={kind} onPress={() => setForm(prev => ({ ...prev, kind }))} style={[s.kindButton, form.kind === kind && s.kindActive]}>
                    <Text style={[s.kindText, form.kind === kind && s.kindActiveText]}>{kind.toUpperCase()}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={s.fieldLabel}>搜索地址（{'{query}'} 为占位符）</Text>
              <TextInput style={s.inputUrl} value={form.searchUrl} onChangeText={value => setForm(prev => ({ ...prev, searchUrl: value }))} placeholder={form.kind === 'opds' ? 'https://example.com/search?query={query}' : 'https://api.example.com/books?q={query}'} placeholderTextColor="#555" autoCapitalize="none" keyboardType="url" multiline />
              {form.kind === 'json' && (
                <>
                  <Text style={s.fieldLabel}>结果路径（可选，如 data.books）</Text>
                  <TextInput style={s.input} value={form.resultsPath} onChangeText={value => setForm(prev => ({ ...prev, resultsPath: value }))} placeholder="data.books" placeholderTextColor="#555" autoCapitalize="none" />
                  <Text style={s.fieldLabel}>字段映射</Text>
                  <TextInput style={s.input} value={form.titleField} onChangeText={value => setForm(prev => ({ ...prev, titleField: value }))} placeholder="标题字段" placeholderTextColor="#555" autoCapitalize="none" />
                  <TextInput style={s.input} value={form.authorsField} onChangeText={value => setForm(prev => ({ ...prev, authorsField: value }))} placeholder="作者字段" placeholderTextColor="#555" autoCapitalize="none" />
                  <TextInput style={s.input} value={form.descriptionField} onChangeText={value => setForm(prev => ({ ...prev, descriptionField: value }))} placeholder="简介字段" placeholderTextColor="#555" autoCapitalize="none" />
                  <TextInput style={s.input} value={form.coverField} onChangeText={value => setForm(prev => ({ ...prev, coverField: value }))} placeholder="封面字段" placeholderTextColor="#555" autoCapitalize="none" />
                  <TextInput style={s.input} value={form.downloadField} onChangeText={value => setForm(prev => ({ ...prev, downloadField: value }))} placeholder="正文下载字段" placeholderTextColor="#555" autoCapitalize="none" />
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
