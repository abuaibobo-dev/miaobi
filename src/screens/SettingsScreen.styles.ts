import { StyleSheet, StatusBar } from 'react-native';
import { T } from '../lib/theme';

export default StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  topBar: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: (StatusBar.currentHeight || 44) + 5, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: '#1F1F1F',
  },
  backButton: { width: 37, height: 37, borderRadius: 19, backgroundColor: T.card, borderWidth: 1, borderColor: T.border, alignItems: 'center', justifyContent: 'center' },
  topTitle: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '800', color: T.text },
  content: { padding: 18, paddingBottom: 40 },
  sectionCard: { borderRadius: 18, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, padding: 16 },
  sectionTitle: { color: T.text, fontSize: 16, fontWeight: '900' },
  hint: { marginTop: 6, color: T.textMuted, fontSize: 11, lineHeight: 17 },
  fieldLabel: { marginTop: 14, marginBottom: 6, color: T.textSec, fontSize: 12, fontWeight: '700' },
  input: {
    minHeight: 42, maxHeight: 100, borderRadius: 12, backgroundColor: '#111',
    borderWidth: 1, borderColor: T.borderLight, paddingHorizontal: 13,
    color: T.text, fontSize: 14, textAlignVertical: 'center',
  },
  primaryButton: { height: 46, marginTop: 20, borderRadius: 23, backgroundColor: '#EDEDED', alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#111', fontSize: 14, fontWeight: '900' },
  secondaryButton: { height: 41, marginTop: 9, borderRadius: 21, backgroundColor: T.surface, borderWidth: 1, borderColor: T.borderLight, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: T.text, fontSize: 13, fontWeight: '700' },
  disabled: { opacity: 0.55 },
  toast: { marginTop: 12, borderRadius: 15, backgroundColor: '#222', borderWidth: 1, borderColor: T.borderLight, paddingVertical: 10, paddingHorizontal: 14 },
  toastText: { color: T.text, textAlign: 'center', fontSize: 12 },
  aboutCard: { marginTop: 22, borderRadius: 18, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, padding: 15 },
  aboutTitle: { color: T.text, fontSize: 14, fontWeight: '800' },
  aboutText: { marginTop: 7, color: T.textMuted, fontSize: 12, lineHeight: 19 },
});
