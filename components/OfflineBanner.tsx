import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';

export default function OfflineBanner() {
  return (
    <View style={styles.banner} accessibilityRole="alert" accessibilityLabel="No internet connection">
      <Text style={styles.text}>No internet connection</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    width: '100%',
    backgroundColor: Colors.error,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  text: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});
