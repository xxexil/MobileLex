import { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';

export default function NotificationPrompt({ visible, onAccept, onDecline }: { visible: boolean; onAccept: () => void; onDecline: () => void }) {
  const [show, setShow] = useState(visible);
  return (
    <Modal visible={show} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <Text style={styles.title}>Enable Notifications</Text>
          <Text style={styles.text}>
            Stay up to date with important updates, messages, and reminders. Would you like to enable push notifications?
          </Text>
          <TouchableOpacity style={styles.acceptBtn} onPress={onAccept} accessibilityRole="button" accessibilityLabel="Enable notifications">
            <Text style={styles.acceptText}>Enable Notifications</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.declineBtn} onPress={onDecline} accessibilityRole="button" accessibilityLabel="Not now">
            <Text style={styles.declineText}>Not Now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  dialog: { width: '85%', backgroundColor: Colors.card, borderRadius: 16, padding: 24, elevation: 4 },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 12, color: Colors.text },
  text: { fontSize: 15, color: Colors.textMuted, marginBottom: 18 },
  acceptBtn: { backgroundColor: Colors.primary, borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginBottom: 8 },
  acceptText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  declineBtn: { alignItems: 'center', paddingVertical: 8 },
  declineText: { color: Colors.textMuted, fontSize: 15 },
});
