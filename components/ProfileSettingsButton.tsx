import { Link } from 'expo-router';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';

export default function ProfileSettingsButton() {
  return (
    <View style={styles.container}>
      <Link href="/(client)/settings" asChild>
        <TouchableOpacity
          style={styles.button}
          accessibilityLabel="Open Settings"
          accessibilityRole="button"
          accessibilityHint="Navigates to the settings screen."
        >
          <Text style={styles.buttonText}>Settings</Text>
        </TouchableOpacity>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', marginTop: 24 },
  button: { backgroundColor: Colors.primary, borderRadius: 8, padding: 14, alignItems: 'center', width: 180 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
