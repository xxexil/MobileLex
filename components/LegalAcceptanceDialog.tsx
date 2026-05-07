import { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Colors } from '@/constants/theme';

export default function LegalAcceptanceDialog({ visible, onAccept }: { visible: boolean; onAccept: () => void }) {
  const [show, setShow] = useState(visible);
  useEffect(() => { setShow(visible); }, [visible]);

  return (
    <Modal visible={show} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <ScrollView contentContainerStyle={{ paddingBottom: 12 }}>
            <Text style={styles.title}>Terms & Privacy</Text>
            <Text style={styles.text}>
              By using this app, you agree to our Terms of Service and Privacy Policy. Please review these documents before continuing.
            </Text>
            <TouchableOpacity style={styles.linkBtn} onPress={() => onAccept()} accessibilityRole="button" accessibilityLabel="Accept terms and continue">
              <Text style={styles.linkText}>Accept & Continue</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => setShow(false)} accessibilityRole="button" accessibilityLabel="Close dialog">
              <Text style={styles.secondaryText}>Close</Text>
            </TouchableOpacity>
          </ScrollView>
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
  linkBtn: { backgroundColor: Colors.primary, borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginBottom: 8 },
  linkText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondaryBtn: { alignItems: 'center', paddingVertical: 8 },
  secondaryText: { color: Colors.textMuted, fontSize: 15 },
});
