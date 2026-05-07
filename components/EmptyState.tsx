import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { Colors } from '@/constants/theme';

export default function EmptyState({ message = 'No items found', illustration }: { message?: string; illustration?: any }) {
  return (
    <View style={styles.container}>
      {illustration ? (
        <Image source={illustration} style={styles.image} resizeMode="contain" />
      ) : (
        <View style={styles.iconCircle}>
          <Text style={styles.icon}>🗂️</Text>
        </View>
      )}
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', flex: 1, padding: 32 },
  image: { width: 120, height: 120, marginBottom: 24 },
  iconCircle: { width: 88, height: 88, borderRadius: 44, backgroundColor: Colors.primary + '12', alignItems: 'center', justifyContent: 'center', marginBottom: 22, borderWidth: 1, borderColor: Colors.primary + '18' },
  icon: { fontSize: 42 },
  text: { color: Colors.textMuted, fontSize: 16, fontWeight: '600', textAlign: 'center', lineHeight: 23 },
});
