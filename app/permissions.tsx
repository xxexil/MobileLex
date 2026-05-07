import { ScrollView, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export default function PermissionsScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ThemedView>
        <ThemedText type="title" style={styles.title}>App Permissions</ThemedText>
        <ThemedText style={styles.text}>
          This app may request permissions for notifications, camera, microphone, and storage to provide its core features. You can manage permissions in your device settings.
        </ThemedText>
        <ThemedText style={styles.text}>
          We only request permissions necessary for the app to function as intended.
        </ThemedText>
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 24 },
  title: { marginBottom: 18 },
  text: { marginBottom: 14, fontSize: 15 },
});
