import React, { useEffect, useState } from 'react';
import { Modal, View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { getOllamaModels } from '../lib/llm';
import { getSettings } from '../lib/storage';
import { T } from '../lib/theme';

export interface ModelOption {
  id: string;
  label: string;
  provider: 'local' | 'cloud';
  model?: string;
}

interface Props {
  visible: boolean;
  selectedId: string | null;
  onClose: () => void;
  onSelect: (option: ModelOption) => void;
}

export default function ModelPicker({ visible, selectedId, onClose, onSelect }: Props) {
  const [options, setOptions] = useState<ModelOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let mounted = true;
    setLoading(true);
    (async () => {
      const [models, settings] = await Promise.all([
        getOllamaModels(),
        getSettings() as Promise<any>,
      ]);
      const next: ModelOption[] = [
        { id: 'auto', label: '智能优先（本地优先，云端兜底）', provider: 'local' },
      ];
      models
        .filter(model => !/embed|moondream|llava|vision/i.test(model))
        .forEach(model => next.push({
          id: `local:${model}`,
          label: `本地 · ${model}`,
          provider: 'local',
          model,
        }));
      if (settings.apiKey) {
        const cloudModels = Array.from(new Set([settings.model || 'deepseek-chat', settings.chatModel || settings.model || 'deepseek-chat']));
        cloudModels.forEach(model => next.push({ id: `cloud:${model}`, label: `云端 · ${model}`, provider: 'cloud', model }));
      }
      if (mounted) setOptions(next);
      if (mounted) setLoading(false);
    })();
    return () => { mounted = false; };
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={s.sheet} activeOpacity={1}>
          <View style={s.handle} />
          <Text style={s.title}>选择模型</Text>
          {loading ? (
            <Text style={s.empty}>检测中...</Text>
          ) : (
            <FlatList
              data={options}
              keyExtractor={item => item.id}
              contentContainerStyle={s.list}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[s.option, (selectedId ?? 'auto') === item.id && s.optionActive]}
                  onPress={() => onSelect(item)}
                  activeOpacity={0.7}
                >
                  <Text style={[s.optionText, (selectedId ?? 'auto') === item.id && s.optionTextActive]} numberOfLines={1}>{item.label}</Text>
                </TouchableOpacity>
              )}
            />
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#161616', borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '68%', paddingBottom: 18 },
  handle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: '#3A3A3A', marginTop: 10 },
  title: { fontSize: 15, fontWeight: '800', color: T.text, paddingHorizontal: 18, marginTop: 12, marginBottom: 8 },
  list: { paddingHorizontal: 14, paddingBottom: 8 },
  option: { minHeight: 46, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: '#2E2E2E', backgroundColor: '#111', marginBottom: 8 },
  optionActive: { borderColor: T.accent, backgroundColor: T.accent + '16' },
  optionText: { fontSize: 13.5, color: T.text },
  optionTextActive: { fontWeight: '700' },
  empty: { color: T.textMuted, fontSize: 13, paddingHorizontal: 18, paddingVertical: 16 },
});
