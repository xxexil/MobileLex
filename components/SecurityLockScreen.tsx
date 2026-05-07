import { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Device from 'expo-device';
import { useAuth } from '@/context/auth';
import { Colors, RoleColors } from '@/constants/theme';

export default function SecurityLockScreen() {
  const { user, securityLocked, securityPinEnabled, securityLockReason, unlockWithPin, logout } = useAuth();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const trustState = useMemo(() => {
    if (!Device.isDevice) return { label: 'Suspicious device', detail: 'This build is running on an emulator or simulator.', tone: 'warn' as const };
    if (!securityPinEnabled) return { label: 'Unprotected session', detail: 'Set a PIN in Security Center to enable local device lock.', tone: 'warn' as const };
    return { label: 'Device trusted', detail: 'This session is protected with a local PIN lock.', tone: 'safe' as const };
  }, [securityPinEnabled]);

  if (!user || !securityLocked) return null;

  async function handleUnlock() {
    const trimmed = pin.trim();
    if (!trimmed) {
      setError('Enter your PIN to continue.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const ok = await unlockWithPin(trimmed);
      if (!ok) {
        setError('Incorrect PIN. Try again.');
        return;
      }
      setPin('');
    } catch {
      setError('Unable to unlock right now.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="shield-checkmark-outline" size={22} color="#fff" />
          </View>
          <Text style={styles.title}>App Locked</Text>
          <Text style={styles.subtitle}>
            {securityLockReason === 'background'
              ? 'The app locked after being sent to the background.'
              : 'Your session is protected. Enter your PIN to continue.'}
          </Text>

          <View style={[styles.trustRow, trustState.tone === 'warn' ? styles.trustWarn : styles.trustSafe]}>
            <Ionicons name={trustState.tone === 'warn' ? 'alert-circle-outline' : 'checkmark-circle-outline'} size={16} color={trustState.tone === 'warn' ? '#B45309' : '#15803D'} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.trustLabel, trustState.tone === 'warn' ? styles.trustLabelWarn : styles.trustLabelSafe]}>{trustState.label}</Text>
              <Text style={styles.trustDetail}>{trustState.detail}</Text>
            </View>
          </View>

          <TextInput
            value={pin}
            onChangeText={setPin}
            placeholder="Enter PIN"
            placeholderTextColor="#9AA5B1"
            keyboardType="number-pad"
            secureTextEntry
            style={styles.input}
            maxLength={8}
            autoFocus
          />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity style={styles.primaryBtn} onPress={handleUnlock} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Unlock</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryBtn} onPress={logout}>
            <Text style={styles.secondaryText}>Secure logout</Text>
          </TouchableOpacity>

          {!securityPinEnabled ? (
            <Text style={styles.helperText}>
              No PIN is set yet. Go to Security Center to enable local protection on this device.
            </Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(11, 18, 32, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 24,
    backgroundColor: '#fff',
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5ECF5',
    gap: 12,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: RoleColors.client.shell,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: Colors.text, fontSize: 22, fontWeight: '900' },
  subtitle: { color: Colors.textMuted, fontSize: 13, lineHeight: 18 },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
  },
  trustSafe: { backgroundColor: '#ECFDF5', borderColor: '#BBF7D0' },
  trustWarn: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  trustLabel: { fontSize: 13, fontWeight: '800' },
  trustLabelSafe: { color: '#166534' },
  trustLabelWarn: { color: '#A16207' },
  trustDetail: { color: Colors.textMuted, fontSize: 12, lineHeight: 16, marginTop: 2 },
  input: {
    borderWidth: 1,
    borderColor: '#D9E2F2',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: Colors.text,
    backgroundColor: '#F8FAFD',
    letterSpacing: 3,
  },
  errorText: { color: Colors.error, fontSize: 12, fontWeight: '700' },
  primaryBtn: {
    backgroundColor: RoleColors.client.shell,
    borderRadius: 14,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  secondaryBtn: {
    backgroundColor: '#F8FAFD',
    borderRadius: 14,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D9E2F2',
  },
  secondaryText: { color: RoleColors.client.shell, fontWeight: '900', fontSize: 14 },
  helperText: { color: Colors.textMuted, fontSize: 12, lineHeight: 17 },
});
