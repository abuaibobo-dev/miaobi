import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, Dimensions } from 'react-native';
import { T } from '../lib/theme';

const { width: SCREEN_W } = Dimensions.get('window');
const MODAL_MAX_W = Math.min(SCREEN_W - 48, 380);

interface AlertButton {
  text: string;
  style?: 'cancel' | 'destructive' | 'default';
  onPress?: () => void;
}

interface CustomAlertProps {
  visible: boolean;
  title: string;
  message?: string;
  buttons: AlertButton[];
  onClose: () => void;
}

export default function CustomAlert({ visible, title, message, buttons, onClose }: CustomAlertProps) {
  if (!visible) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={s.card}>
          <Text style={s.title}>{title}</Text>
          {message ? <Text style={s.message}>{message}</Text> : null}
          <View style={s.btnRow}>
            {buttons.map((btn, i) => {
              const isDanger = btn.style === 'destructive';
              const isCancel = btn.style === 'cancel';
              return (
                <TouchableOpacity
                  key={i}
                  style={[s.btn, isDanger && s.btnDanger, isCancel && s.btnCancel]}
                  onPress={() => { btn.onPress?.(); onClose(); }}
                >
                  <Text style={[s.btnText, isDanger && s.btnTextDanger, isCancel && s.btnTextCancel]}>
                    {btn.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

type ShowAlertConfig = Omit<CustomAlertProps, 'visible' | 'onClose'>;
let _showAlert: ((config: ShowAlertConfig) => void) | null = null;

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<ShowAlertConfig | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    _showAlert = (props) => {
      setConfig(props);
      setVisible(true);
    };
    return () => { _showAlert = null; };
  }, []);

  return (
    <>
      {children}
      <CustomAlert
        visible={visible}
        title={config?.title ?? ''}
        message={config?.message}
        buttons={config?.buttons ?? []}
        onClose={() => setVisible(false)}
      />
    </>
  );
}

export function showAlert(title: string, message?: string, buttons?: AlertButton[]) {
  _showAlert?.({
    title,
    message,
    buttons: buttons ?? [{ text: '确定', style: 'default' }],
  });
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: MODAL_MAX_W,
    backgroundColor: '#1A1A1A',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2E2E2E',
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: T.text,
    textAlign: 'center',
  },
  message: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 20,
    color: '#A3A3A3',
    textAlign: 'center',
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  btn: {
    flex: 1,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#242424',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  btnCancel: {
    backgroundColor: '#242424',
  },
  btnDanger: {
    backgroundColor: '#3A1515',
    borderColor: '#4A2020',
  },
  btnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#D4D4D4',
  },
  btnTextCancel: {
    color: '#999',
  },
  btnTextDanger: {
    color: '#D6A0A0',
    fontWeight: '700',
  },
});
