import React from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';

interface Props {
  children?: React.ReactNode;
  visible: boolean;
  title: string;
  message?: string;
  cancelText?: string;
  confirmText?: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function CapsuleAlert({ children, visible, title, message, cancelText = '取消', confirmText = '确定', danger, onCancel, onConfirm }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          {children}
          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelText}>{cancelText}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.confirmBtn, danger && styles.dangerBtn]} onPress={onConfirm}>
              <Text style={styles.confirmText}>{confirmText}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function CapsuleToast({ visible, text, onHide }: { visible: boolean; text: string; onHide: () => void }) {
  React.useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(onHide, 1800);
    return () => clearTimeout(timer);
  }, [visible, onHide]);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View pointerEvents="none" style={styles.toastOverlay}>
        <View style={styles.toast}>
          <Text style={styles.toastText} numberOfLines={2}>{text}</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modal: { width: '100%', maxWidth: 360, backgroundColor: '#1A1A1A', borderRadius: 20, borderWidth: 1, borderColor: '#2E2E2E', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  title: { fontSize: 16, fontWeight: '700', color: '#F5F5F5', textAlign: 'center' },
  message: { marginTop: 8, fontSize: 13, lineHeight: 20, color: '#A3A3A3', textAlign: 'center' },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  cancelBtn: { flex: 1, height: 42, borderRadius: 21, backgroundColor: '#242424', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#333' },
  cancelText: { fontSize: 14, fontWeight: '600', color: '#D4D4D4' },
  confirmBtn: { flex: 1, height: 42, borderRadius: 21, backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center' },
  dangerBtn: { backgroundColor: '#D4D4D4' },
  confirmText: { fontSize: 14, fontWeight: '700', color: '#0D0D0D' },
  toastOverlay: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 48 },
  toast: { maxWidth: '88%', minWidth: 120, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, backgroundColor: 'rgba(245,245,245,0.96)', borderWidth: 1, borderColor: '#FFF' },
  toastText: { fontSize: 12, fontWeight: '600', color: '#0D0D0D', textAlign: 'center' },
});
