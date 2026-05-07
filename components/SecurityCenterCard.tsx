import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Device from 'expo-device';
import { useAuth } from '@/context/auth';
import { Colors, RoleColors } from '@/constants/theme';

export default function SecurityCenterCard() {
  const {
    securityLocked,
    securityPinEnabled,
    securityLockReason,
    setSecurityPin,
    disableSecurityPin,
    lockApp,
    logout,
  } = useAuth();
  const [pinVisible, setPinVisible] = useState(false);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [saving, setSaving] = useState(false);

  const trust = useMemo(() => {
    if (securityLocked) {
      return { label: 'Locked now', detail: 'Unlock with your PIN to continue.', tone: 'danger' as const };
    }
    if (!Device.isDevice) {
      return { label: 'Suspicious device', detail: 'Emulator/simulator detected. Keep sensitive actions locked.', tone: 'warn' as const };
    }
    if (!securityPinEnabled) {
      return { label: 'Protection off', detail: 'Enable a PIN lock for payments, messages, and approvals.', tone: 'warn' as const };
    }
    return { label: 'Device trusted', detail: 'Local PIN protection is active on this device.', tone: 'safe' as const };
  }, [securityLocked, securityPinEnabled]);

  async function handleSavePin() {
    const normalized = pin.trim();
    if (!/^\d{4,8}$/.test(normalized)) {
      Alert.alert('Invalid PIN', 'Enter a 4 to 8 digit PIN.');
      return;
    }
    if (normalized !== confirmPin.trim()) {
      Alert.alert('PIN mismatch', 'Your PIN entries do not match.');
      return;
    }
    setSaving(true);
    try {
      await setSecurityPin(normalized);
      setPin('');
      setConfirmPin('');
      setPinVisible(false);
      Alert.alert('Security enabled', 'Local PIN protection is now active on this device.');
    } catch (err: any) {
      Alert.alert('Unable to save PIN', err?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Ionicons name="shield-checkmark-outline" size={18} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Security Center</Text>
          <Text style={styles.desc}>
            Protect messages, payments, approvals, and account changes with a local lock.
          </Text>
        </View>
        <View style={[
          styles.badge,
          trust.tone === 'safe' ? styles.badgeSafe : trust.tone === 'warn' ? styles.badgeWarn : styles.badgeDanger,
        ]}>
          <Text style={styles.badgeText}>{trust.label}</Text>
        </View>
      </View>

      <View style={[
        styles.statusBox,
        trust.tone === 'safe' ? styles.statusSafe : trust.tone === 'warn' ? styles.statusWarn : styles.statusDanger,
      ]}>
        <Ionicons
          name={trust.tone === 'safe' ? 'checkmark-circle-outline' : trust.tone === 'warn' ? 'alert-circle-outline' : 'lock-closed-outline'}
          size={16}
          color={trust.tone === 'safe' ? '#16A34A' : trust.tone === 'warn' ? '#D97706' : '#B91C1C'}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.statusTitle}>{trust.label}</Text>
          <Text style={styles.statusText}>{trust.detail}</Text>
        </View>
      </View>

      {securityLockReason ? (
        <Text style={styles.helperText}>Last lock reason: {securityLockReason}</Text>
      ) : null}

      <View style={styles.bullets}>
        <Bullet text="Auto-lock when the app leaves the foreground" />
        <Bullet text="Manual lock for sensitive workspaces" />
        <Bullet text="Secure logout if a device feels compromised" />
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => setPinVisible(true)}>
          <Ionicons name="key-outline" size={15} color="#fff" />
          <Text style={styles.primaryText}>{securityPinEnabled ? 'Change PIN' : 'Set PIN'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.secondaryBtn, !securityPinEnabled && styles.secondaryBtnDisabled]}
          onPress={() => {
            if (!securityPinEnabled) {
              setPinVisible(true);
              return;
            }
            lockApp('manual');
          }}
        >
          <Ionicons name="lock-closed-outline" size={15} color={securityPinEnabled ? RoleColors.client.shell : '#94A3B8'} />
          <Text style={[styles.secondaryText, !securityPinEnabled && styles.secondaryTextDisabled]}>Lock now</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
        <Text style={styles.logoutText}>Secure logout</Text>
      </TouchableOpacity>

      {securityPinEnabled ? (
        <TouchableOpacity style={styles.disableLink} onPress={disableSecurityPin}>
          <Text style={styles.disableText}>Disable PIN on this device</Text>
        </TouchableOpacity>
      ) : null}

      <Modal visible={pinVisible} transparent animationType="fade" onRequestClose={() => setPinVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{securityPinEnabled ? 'Change PIN' : 'Set PIN'}</Text>
            <Text style={styles.modalDesc}>
              Use 4 to 8 digits. You will need this PIN to unlock the app after it locks.
            </Text>
            <TextInput
              value={pin}
              onChangeText={setPin}
              placeholder="PIN"
              placeholderTextColor="#9AA5B1"
              keyboardType="number-pad"
              secureTextEntry
              maxLength={8}
              style={styles.input}
            />
            <TextInput
              value={confirmPin}
              onChangeText={setConfirmPin}
              placeholder="Confirm PIN"
              placeholderTextColor="#9AA5B1"
              keyboardType="number-pad"
              secureTextEntry
              maxLength={8}
              style={styles.input}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalSecondaryBtn} onPress={() => setPinVisible(false)}>
                <Text style={styles.modalSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalPrimaryBtn} onPress={handleSavePin} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalPrimaryText}>Save PIN</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={styles.bulletRow}>
      <View style={styles.bulletDot} />
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E7ECF5',
    padding: 16,
    gap: 12,
    shadowColor: Colors.primaryDark,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: RoleColors.client.shell,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: Colors.text, fontSize: 16, fontWeight: '800' },
  desc: { color: Colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  badgeSafe: { backgroundColor: '#DCFCE7' },
  badgeWarn: { backgroundColor: '#FEF3C7' },
  badgeDanger: { backgroundColor: '#FEE2E2' },
  badgeText: { fontSize: 10, fontWeight: '900', color: Colors.text },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  statusSafe: { backgroundColor: '#ECFDF5', borderColor: '#BBF7D0' },
  statusWarn: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  statusDanger: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  statusTitle: { color: Colors.text, fontSize: 13, fontWeight: '800' },
  statusText: { color: Colors.textMuted, fontSize: 12, lineHeight: 16, marginTop: 2 },
  helperText: { color: Colors.textMuted, fontSize: 12, lineHeight: 17 },
  bullets: { gap: 8 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  bulletDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: RoleColors.client.shell,
    marginTop: 5,
  },
  bulletText: { color: Colors.text, fontSize: 12, lineHeight: 17, flex: 1 },
  actions: { flexDirection: 'row', gap: 8 },
  primaryBtn: {
    flex: 1,
    minHeight: 46,
    backgroundColor: RoleColors.client.shell,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  primaryText: { color: '#fff', fontWeight: '900', fontSize: 13 },
  secondaryBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D9E2F2',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    backgroundColor: '#F8FAFD',
  },
  secondaryBtnDisabled: { opacity: 0.7 },
  secondaryText: { color: RoleColors.client.shell, fontWeight: '900', fontSize: 13 },
  secondaryTextDisabled: { color: '#94A3B8' },
  logoutBtn: {
    minHeight: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFD',
    borderWidth: 1,
    borderColor: '#D9E2F2',
  },
  logoutText: { color: Colors.error, fontWeight: '900', fontSize: 13 },
  disableLink: { alignSelf: 'flex-start' },
  disableText: { color: Colors.textMuted, fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E7ECF5',
    gap: 10,
  },
  modalTitle: { color: Colors.text, fontSize: 18, fontWeight: '900' },
  modalDesc: { color: Colors.textMuted, fontSize: 12, lineHeight: 17 },
  input: {
    borderWidth: 1,
    borderColor: '#D9E2F2',
    backgroundColor: '#F8FAFD',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: Colors.text,
    fontSize: 15,
    letterSpacing: 3,
  },
  modalActions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  modalSecondaryBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D9E2F2',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFD',
  },
  modalSecondaryText: { color: Colors.text, fontSize: 13, fontWeight: '800' },
  modalPrimaryBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: RoleColors.client.shell,
  },
  modalPrimaryText: { color: '#fff', fontSize: 13, fontWeight: '900' },
});
