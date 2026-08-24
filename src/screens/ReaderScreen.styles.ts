import { StyleSheet, StatusBar } from 'react-native';
import { T } from '../lib/theme';

export default StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0B0B0B' },
  center: { flex: 1, backgroundColor: T.bg, alignItems: 'center', justifyContent: 'center', gap: 12 },
  topBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 15, paddingTop: (StatusBar.currentHeight || 44) + 4, paddingBottom: 9,
    borderBottomWidth: 1,
  },
  iconButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#2A2A2A', alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontSize: 14, fontWeight: '800', color: T.text },
  pageInfo: { fontSize: 10, color: T.textMuted, marginTop: 1 },
  fontLabel: { fontSize: 11, fontWeight: '900', color: T.text },
  readerBody: { padding: 24, paddingBottom: 60 },
  chapterTitle: { marginBottom: 20, lineHeight: 32, fontWeight: '900', color: T.text },
  body: { lineHeight: 34, color: '#D6D6D6', letterSpacing: 0.2 },
  bottomBar: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    paddingHorizontal: 13, paddingTop: 9, paddingBottom: 22,
    backgroundColor: T.surface, borderTopWidth: 1, borderTopColor: '#242424',
  },
  navButton: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 35, borderRadius: 18, paddingHorizontal: 11, backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#2E2E2E' },
  navText: { color: T.text, fontSize: 11, fontWeight: '700' },
  disabled: { opacity: 0.4 },
  progressTrack: { flex: 1, height: 3, borderRadius: 2, backgroundColor: '#242424' },
  progressFill: { height: 3, borderRadius: 2, backgroundColor: '#E5E5E5' },
  error: { color: T.textMuted, fontSize: 13, textAlign: 'center' },
  settingsPanel: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, borderTopWidth: 1 },
  settingLabel: { fontSize: 11, marginBottom: 8 },
  themeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  themeButton: { flex: 1, height: 34, borderRadius: 17, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  fontRow: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
  fontButton: { width: 38, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
