import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type DeliveryState = 'sending' | 'failed' | 'sent' | undefined;

type MessageDeliveryStateProps = {
  state: DeliveryState;
  onRetry?: () => void;
};

export default function MessageDeliveryState({ state, onRetry }: MessageDeliveryStateProps) {
  if (!state) return null;

  if (state === 'failed') {
    return (
      <TouchableOpacity style={styles.failedChip} onPress={onRetry} activeOpacity={0.85}>
        <Ionicons name="alert-circle-outline" size={11} color="#fff" />
        <Text style={styles.failedText} numberOfLines={1}>Retry</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.inlineState}>
      <Ionicons
        name={state === 'sending' ? 'time-outline' : 'checkmark-done'}
        size={11}
        color="#ffffffdd"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  inlineState: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  failedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
    width: 76,
    justifyContent: 'center',
    flexShrink: 0,
  },
  failedText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
});

