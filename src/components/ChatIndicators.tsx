import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { T } from '../lib/theme';
import { Icon } from '../lib/icons';

export function GenerationDots({ label = '正在生成' }: { label?: string }) {
  const dots = [0, 1, 2].map(() => useRef(new Animated.Value(0.25)).current);

  useEffect(() => {
    const animations = dots.map((dot, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 180),
          Animated.timing(dot, { toValue: 1, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.25, duration: 420, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        ]),
      ),
    );
    animations.forEach(animation => animation.start());
    return () => animations.forEach(animation => animation.stop());
  }, [dots]);

  return (
    <View style={styles.dotsRow}>
      {dots.map((dot, index) => (
        <Animated.View key={index} style={[styles.dot, { opacity: dot, transform: [{ scale: dot.interpolate({ inputRange: [0.25, 1], outputRange: [0.8, 1] }) }] }]} />
      ))}
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

export function StreamCursor() {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0, duration: 480, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 480, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return <Animated.Text style={[styles.cursor, { opacity }]}>▍</Animated.Text>;
}

export function ThinkingPanel({ text, streaming = false }: { text: string; streaming?: boolean }) {
  const [open, setOpen] = useState(streaming);
  const pulse = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    if (!streaming) return;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 620, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.35, duration: 620, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse, streaming]);

  if (!text.trim()) return null;

  return (
    <View style={styles.panel}>
      <TouchableOpacity style={styles.header} onPress={() => setOpen(!open)} activeOpacity={0.7}>
        <Animated.View style={{ opacity: pulse }}>
          <Icon.thinking size={13} color={streaming ? '#F5F5F5' : T.textSec} />
        </Animated.View>
        <Text style={styles.title}>{streaming ? '思考中' : '思考过程'}</Text>
        {!streaming && <Text style={styles.preview} numberOfLines={1}>{text.replace(/\s+/g, ' ')}</Text>}
        <Icon.down size={13} color={T.textMuted} />
      </TouchableOpacity>
      {open && (
        <View style={styles.body}>
          <Text style={styles.text}>{text}</Text>
          {streaming && <StreamCursor />}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dotsRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: T.grey },
  label: { marginLeft: 4, fontSize: 12, color: T.textMuted },
  cursor: { color: T.white, fontSize: 15, lineHeight: 22 },
  panel: { marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 10 },
  title: { fontSize: 12, fontWeight: '700', color: T.text },
  preview: { flex: 1, marginLeft: 4, fontSize: 11, color: T.textMuted },
  body: { borderTopWidth: 1, borderTopColor: '#262626', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12 },
  text: { fontSize: 13, lineHeight: 20, color: T.textSecondary },
});
