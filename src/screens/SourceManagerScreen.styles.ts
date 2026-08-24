import { StyleSheet, StatusBar } from 'react-native';
import { T } from '../lib/theme';

export default StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  topBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingTop: (StatusBar.currentHeight || 44) + 5, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: '#1F1F1F',
  },
  back: { width: 37, height: 37, borderRadius: 19, backgroundColor: T.card, borderWidth: 1, borderColor: T.border, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 17, fontWeight: '900', color: T.text },
  addButton: { height: 33, borderRadius: 17, paddingHorizontal: 13, justifyContent: 'center', backgroundColor: '#E7E7E7' },
  addText: { color: '#111', fontWeight: '800', fontSize: 12 },
  notice: { marginTop: 10, textAlign: 'center', color: T.textMuted },
  list: { padding: 16, paddingBottom: 30, gap: 9 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, padding: 13 },
  name: { color: T.text, fontSize: 14, fontWeight: '700' },
  detail: { marginTop: 4, color: T.textMuted, fontSize: 11 },
  remove: { color: '#D6D6D6', fontSize: 12, fontWeight: '700' },
});
