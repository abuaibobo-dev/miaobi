import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, TextInput } from 'react-native';
import { T } from '../lib/theme';
import { Icon } from '../lib/icons';
import type { Character } from '../types/novel';

const STATUS_MAP: Record<string, { color: string; label: string }> = {
  active: { color: T.accentGreen, label: '活跃' },
  dead: { color: T.accentRed, label: '已故' },
  missing: { color: T.accentOrange, label: '失踪' },
  inactive: { color: T.textMuted, label: '退场' },
};

interface Props {
  characters: Character[];
  onUpdateDialogueStyle?: (charId: string, style: string) => void;
}

export default function CharacterCard({ characters, onUpdateDialogueStyle }: Props) {
  const [selected, setSelected] = useState<Character | null>(null);
  const [editStyle, setEditStyle] = useState('');
  const [editModal, setEditModal] = useState(false);

  if (characters.length === 0) {
    return <View style={s.empty}><Text style={s.emptyText}>还没有角色</Text></View>;
  }

  const handleEdit = (char: Character) => {
    setSelected(char);
    setEditStyle(char.dialogueStyle || '');
    setEditModal(true);
  };

  return (
    <View style={s.container}>
      {characters.map(char => {
        const st = STATUS_MAP[char.status] || STATUS_MAP.active;
        return (
          <TouchableOpacity key={char.id} style={s.card} onPress={() => handleEdit(char)} activeOpacity={0.7}>
            {/* 头部：名字+状态 */}
            <View style={s.cardHeader}>
              <View style={s.nameRow}>
                <View style={[s.avatar, { backgroundColor: st.color + '20' }]}>
                  <Text style={[s.avatarText, { color: st.color }]}>{char.name[0]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{char.name}</Text>
                  <Text style={s.appearance}>第{char.firstAppearance}章登场</Text>
                </View>
                <View style={[s.statusBadge, { backgroundColor: st.color + '20' }]}>
                  <Text style={[s.statusText, { color: st.color }]}>{st.label}</Text>
                </View>
              </View>
            </View>

            {/* 性格 */}
            {char.traits ? (
              <View style={s.section}>
                <Text style={s.sectionLabel}>性格</Text>
                <Text style={s.sectionContent}>{char.traits}</Text>
              </View>
            ) : null}

            {/* 当前状态 */}
            {char.currentState ? (
              <View style={s.section}>
                <Text style={s.sectionLabel}>当前状态</Text>
                <Text style={s.sectionContent}>{char.currentState}</Text>
              </View>
            ) : null}

            {/* 背景 */}
            {char.backstory ? (
              <View style={s.section}>
                <Text style={s.sectionLabel}>背景</Text>
                <Text style={s.sectionContent} numberOfLines={3}>{char.backstory}</Text>
              </View>
            ) : null}

            {/* 对话风格 */}
            <View style={s.styleSection}>
              <Text style={s.sectionLabel}>💬 对话风格</Text>
              {char.dialogueStyle ? (
                <Text style={s.styleContent}>{char.dialogueStyle}</Text>
              ) : (
                <Text style={s.styleEmpty}>点击编辑，设定角色说话方式</Text>
              )}
            </View>
          </TouchableOpacity>
        );
      })}

      {/* 编辑对话风格弹窗 */}
      <Modal visible={editModal} transparent animationType="fade">
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>💬 编辑「{selected?.name}」的对话风格</Text>
            <Text style={s.modalHint}>描述这个角色的说话方式，如：简短直接、爱用反问句、说话带方言、喜欢用成语...</Text>
            <TextInput
              style={s.modalInput}
              value={editStyle}
              onChangeText={setEditStyle}
              placeholder="如：说话简短，不喜欢废话，爱用反问句"
              placeholderTextColor={T.textMuted}
              multiline
              numberOfLines={4}
            />
            <View style={s.modalBtns}>
              <TouchableOpacity style={s.modalBtnCancel} onPress={() => setEditModal(false)}>
                <Text style={s.modalBtnCancelTxt}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalBtnOk} onPress={() => {
                if (selected && onUpdateDialogueStyle) {
                  onUpdateDialogueStyle(selected.id, editStyle);
                }
                setEditModal(false);
              }}>
                <Text style={s.modalBtnOkTxt}>保存</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { padding: 16 },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { color: T.textMuted, fontSize: 14 },
  card: { backgroundColor: T.card, borderRadius: T.r.lg, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: T.border },
  cardHeader: { marginBottom: 8 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 18, fontWeight: '800' },
  name: { fontSize: 16, fontWeight: '700', color: T.text },
  appearance: { fontSize: 11, color: T.textMuted, marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: T.r.sm },
  statusText: { fontSize: 11, fontWeight: '600' },
  section: { marginTop: 8 },
  sectionLabel: { fontSize: 11, color: T.textMuted, marginBottom: 4, fontWeight: '600' },
  sectionContent: { fontSize: 13, color: T.textSec, lineHeight: 18 },
  styleSection: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: T.border },
  styleContent: { fontSize: 13, color: T.accent, lineHeight: 18, fontStyle: 'italic' },
  styleEmpty: { fontSize: 12, color: T.textMuted, fontStyle: 'italic' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modal: { backgroundColor: T.card, borderRadius: T.r.xl, padding: 20, width: '88%', borderWidth: 1, borderColor: T.borderLight },
  modalTitle: { fontSize: 15, fontWeight: '700', color: T.text, marginBottom: 6, textAlign: 'center' },
  modalHint: { fontSize: 12, color: T.textMuted, marginBottom: 12, textAlign: 'center', lineHeight: 17 },
  modalInput: { backgroundColor: T.surface, borderRadius: T.r.md, padding: 12, fontSize: 14, color: T.text, borderWidth: 1, borderColor: T.border, minHeight: 80, textAlignVertical: 'top', marginBottom: 14 },
  modalBtns: { flexDirection: 'row', gap: 10 },
  modalBtnCancel: { flex: 1, paddingVertical: 11, borderRadius: T.r.md, backgroundColor: T.surface, alignItems: 'center', borderWidth: 1, borderColor: T.border },
  modalBtnCancelTxt: { fontSize: 13, color: T.textSec },
  modalBtnOk: { flex: 1, paddingVertical: 11, borderRadius: T.r.md, backgroundColor: T.accent, alignItems: 'center' },
  modalBtnOkTxt: { fontSize: 13, fontWeight: '700', color: '#FFF' },
});
