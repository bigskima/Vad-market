import React from 'react';
import { Pressable, Text, View } from 'react-native';

type Props = {
  children: React.ReactNode;
  title?: string;
};

type State = {
  failed: boolean;
};

export class WalletSectionErrorBoundary extends React.Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.error('[VAD wallet] section failed to render:', error);
  }

  private retry = () => this.setState({ failed: false });

  render() {
    if (this.state.failed) {
      return (
        <View
          style={{
            padding: 16,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: '#D97706',
            backgroundColor: '#FFF7ED',
            gap: 8,
          }}
        >
          <Text style={{ color: '#7C2D12', fontSize: 16, fontWeight: '700' }}>
            {this.props.title ?? 'Wallet section temporarily unavailable'}
          </Text>
          <Text style={{ color: '#7C2D12', fontSize: 13, lineHeight: 19 }}>
            This section could not load. Your other VAD screens should remain available.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={this.retry}
            style={{ alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#FFEDD5' }}
          >
            <Text style={{ color: '#7C2D12', fontWeight: '700' }}>Try again</Text>
          </Pressable>
        </View>
      );
    }

    return this.props.children;
  }
}
