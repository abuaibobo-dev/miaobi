import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, StatusBar, Switch, Text, TouchableOpacity, View } from 'react-native';
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

  return (
    <View style={s.screen}>
      <StatusBar barStyle="light-content" backgroundColor={T.bg} />
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}><Icon.back size={19} color={T.text} /></TouchableOpacity>
        <Text style={s.title}>书源管理</Text>
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
              <TouchableOpacity onPress={async () => {
                await removeCustomSource(item.key);
                setSources(await getCustomSources());
              }}><Text style={s.remove}>删除</Text></TouchableOpacity>
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
    </View>
  );
}

const s = require('./SourceManagerScreen.styles').default;
