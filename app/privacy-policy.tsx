import { ScrollView, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export default function PrivacyPolicyScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ThemedView>
        <ThemedText type="title" style={styles.title}>Privacy Policy</ThemedText>
        <ThemedText style={styles.text}>
          This is a sample privacy policy. Your privacy is important to us. We do not share your personal information with third parties except as necessary to provide our services or as required by law.
        </ThemedText>
        <ThemedText style={styles.text}>
          For more details, please contact support@lexconnect.com.
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
