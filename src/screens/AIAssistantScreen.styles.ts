import { StyleSheet, StatusBar } from 'react-native';
import { T } from '../lib/theme';

export default StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  topBar: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    paddingHorizontal: 16, paddingTop: (StatusBar.currentHeight || 44) + 5, paddingBottom: 10,
    backgroundColor: T.surface, borderBottomWidth: 1, borderBottomColor: T.border,
  },
  back: { width: 36, height: 36, borderRadius: 16, backgroundColor: T.card, borderWidth: 1, borderColor: T.border, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 16, fontWeight: '900', color: T.text },
  settings: { color: T.textSec, fontSize: 12 },
  messages: { padding: 16, paddingBottom: 12, gap: 10 },
  bubble: { maxWidth: '88%', borderRadius: 20, paddingHorizontal: 13, paddingVertical: 10 },
  ai: { alignSelf: 'flex-start', backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderBottomLeftRadius: 7 },
  user: { alignSelf: 'flex-end', backgroundColor: T.bubbleUser, borderBottomRightRadius: 7 },
  messageText: { color: T.text, fontSize: 14, lineHeight: 22 },
  userText: { color: T.text },
  quickWrap: { paddingHorizontal: 14, paddingBottom: 8, gap: 8 },
  quick: { height: 31, borderRadius: 16, paddingHorizontal: 12, justifyContent: 'center', backgroundColor: T.card, borderWidth: 1, borderColor: T.border },
  quickText: { color: T.textSec, fontSize: 11 },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    margin: 14, minHeight: 50, maxHeight: 130,
    borderRadius: 20, backgroundColor: T.surface, borderWidth: 1, borderColor: T.borderLight,
    paddingHorizontal: 15, paddingVertical: 9,
  },
  input: { flex: 1, minHeight: 30, color: T.text, fontSize: 15, textAlignVertical: 'center' },
  send: { width: 34, height: 34, borderRadius: 16, backgroundColor: T.white, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
  resultBlock: { width: '100%', borderRadius: 16, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, padding: 12 },
  resultLabel: { color: T.text, fontSize: 13, fontWeight: '900', marginBottom: 9 },
  resultCard: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: T.border },
  resultTitle: { color: T.text, fontSize: 13, fontWeight: '700' },
  resultMeta: { marginTop: 3, color: T.textMuted, fontSize: 10 },
  openText: { color: T.text, fontSize: 11, fontWeight: '800' },
});
