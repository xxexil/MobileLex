import { ScrollView, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export default function TermsScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ThemedView>
        <ThemedText type="title" style={styles.title}>Terms of Service</ThemedText>
        <ThemedText style={styles.text}>
          By using this app, you agree to our terms of service. Please review these terms carefully. Continued use of the app constitutes acceptance of these terms.
        </ThemedText>
        <ThemedText style={styles.text}>
          For questions, contact support@lexconnect.com.
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
