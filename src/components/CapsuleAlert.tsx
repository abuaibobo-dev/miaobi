import React from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';

const COLORS = {
  bg: '#0D0D0D', card: '#1A1A1A', border: '#2A2A2A',
  text: '#FFFFFF', sub: '#888888', accent: '#66D9A0', danger: '#FF0044',
};

interface Props {
  visible: boolean;
  title: string;
  message?: string;
  cancelText?: string;
  confirmText?: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function CapsuleAlert({ visible, title, message, cancelText = '取消', confirmText = '确定', danger, onCancel, onConfirm }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelText}>{cancelText}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, danger && { backgroundColor: COLORS.danger }]}
              onPress={onConfirm}
            >
              <Text style={styles.confirmText}>{confirmText}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

interface ToastProps {
  visible: boolean;
  text: string;
  onHide: () => void;
}

export function CapsuleToast({ visible, text, onHide }: ToastProps) {
  React.useEffect(() => {
    if (visible) {
      const t = setTimeout(onHide, 2000);
      return () => clearTimeout(t);
    }
  }, [visible, onHide]);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={[styles.modal, { paddingVertical: 14 }]}>
          <Text style={styles.title}>{text}</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modal: {
    backgroundColor: '#2A2A2A', borderRadius: 20, padding: 18, width: '80%',
    borderWidth: 1, borderColor: '#3A3A3A', elevation: 8,
  },
  title: { fontSize: 15, fontWeight: '600', color: COLORS.text, textAlign: 'center', marginBottom: 6 },
  message: { fontSize: 13, color: COLORS.sub, textAlign: 'center', lineHeight: 18, marginBottom: 14 },
  btnRow: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, paddingVertical: 10, borderRadius: 14, backgroundColor: '#3A3A3A', alignItems: 'center' },
  cancelText: { fontSize: 13, color: COLORS.sub },
  confirmBtn: { flex: 1, paddingVertical: 10, borderRadius: 14, backgroundColor: COLORS.accent, alignItems: 'center' },
  confirmText: { fontSize: 13, fontWeight: '600', color: '#000' },
});
