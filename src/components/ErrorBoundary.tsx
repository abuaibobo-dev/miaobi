import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { T } from '../lib/theme';

interface Props { children: React.ReactNode; }
interface State { hasError: boolean; error: string | null; resetKey: number; }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null, resetKey: 0 };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }

  retry = () => {
    this.setState(prev => ({ hasError: false, error: null, resetKey: prev.resetKey + 1 }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, backgroundColor: T.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: T.text, fontSize: 18, fontWeight: '700', marginBottom: 12 }}>出错了</Text>
          <Text style={{ color: T.textMuted, fontSize: 13, textAlign: 'center', marginBottom: 20 }}>{this.state.error}</Text>
          <TouchableOpacity onPress={this.retry} style={{ backgroundColor: T.surface2, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10, borderWidth: 1, borderColor: T.border }}>
            <Text style={{ color: T.text, fontSize: 14 }}>重试</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return <View key={this.state.resetKey} style={{ flex: 1 }}>{this.props.children}</View>;
  }
}
