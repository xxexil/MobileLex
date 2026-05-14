import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  Image,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { authApi, clientApi } from '@/services/api';
import AppButton from '@/components/AppButton';
import { useAuth } from '@/context/auth';
import OtpModal from '@/components/OtpModal';
import SecurityCenterCard from '@/components/SecurityCenterCard';
import { Colors } from '@/constants/theme';
import { useRouter } from 'expo-router';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { resolveStorageUrl } from '@/services/endpoints';

interface ProfileDraft {
  name: string;
  bio: string;
}

function isHttpAvatarUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function cacheBustAvatarUrl(value: string) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed || !isHttpAvatarUrl(trimmed)) return trimmed;
  const separator = trimmed.includes('?') ? '&' : '?';
  return `${trimmed}${separator}v=${Date.now()}`;
}

function profileToDraft(p: any): ProfileDraft {
  return {
    name: p?.name ?? '',
    bio: p?.bio ?? '',
  };
}

function diffDraft(
  original: ProfileDraft,
  draft: ProfileDraft,
): { field: string; from: string; to: string }[] {
  const labels: Record<keyof ProfileDraft, string> = {
    name: 'Full Name',
    bio: 'About',
  };
  return (Object.keys(labels) as (keyof ProfileDraft)[])
    .filter((k) => (draft[k] ?? '').trim() !== (original[k] ?? '').trim())
    .map((k) => ({ field: labels[k], from: original[k] || '—', to: draft[k] || '—' }));
}

export default function ClientSettingsScreen() {
  const { user, updateUser } = useAuth();
  const router = useRouter();
  const navigation = useNavigation();
  const backHandledRef = useRef(false);

  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [statsData, setStatsData] = useState({ consultations: 0, totalSpent: 0, memberSince: '' });

  const initials = useMemo(() => {
    const src = (profile?.name || user?.name || 'U').trim();
    return src.charAt(0).toUpperCase();
  }, [profile?.name, user?.name]);

  // — Profile edit state —
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft>({ name: '', bio: '' });
  const originalDraft = useRef<ProfileDraft>(draft);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  // — Email change state —
  const [newEmail, setNewEmail] = useState('');
  const [requestingEmailOtp, setRequestingEmailOtp] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);

  // — Phone change state —
  const [newPhone, setNewPhone] = useState('');
  const [otpPhone, setOtpPhone] = useState('');
  const [requestingPhoneOtp, setRequestingPhoneOtp] = useState(false);
  const [showPhoneModal, setShowPhoneModal] = useState(false);

  // — Password change state —
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const load = useCallback(async () => {
    try {
      const [profileRes, dashboardRes] = await Promise.allSettled([
        clientApi.profile(),
        clientApi.dashboard(),
      ]);
      const profileRaw = profileRes.status === 'fulfilled' ? (profileRes.value?.data?.data || profileRes.value?.data || {}) : {};
      const dash = dashboardRes.status === 'fulfilled' ? (dashboardRes.value?.data || {}) : {};
      setProfile(profileRaw);
      if (profileRaw?.avatar_url) setAvatarUri(resolveStorageUrl(profileRaw.avatar_url));
      const createdAt = profileRaw?.created_at ?? '';
      setStatsData({
        consultations: dash?.stats?.total ?? 0,
        totalSpent: Number(dash?.total_spent ?? 0),
        memberSince: createdAt ? new Date(createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '',
      });
      const d = profileToDraft(profileRaw);
      setDraft(d);
      originalDraft.current = d;
      setNewPhone(profileRaw?.phone ?? '');
    } catch {
      const fallback = { name: user?.name ?? '', email: user?.email ?? '', role: user?.role ?? '' };
      setProfile(fallback);
      const d = profileToDraft(fallback);
      setDraft(d);
      originalDraft.current = d;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.email, user?.name, user?.role]);

  useEffect(() => { load(); }, [load]);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        router.replace('/(client)/profile' as any);
        return true;
      });

      return () => subscription.remove();
    }, [router])
  );

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (backHandledRef.current) return;
      const actionType = event.data.action.type;
      if (actionType !== 'GO_BACK' && actionType !== 'POP' && actionType !== 'POP_TO_TOP') return;

      event.preventDefault();
      backHandledRef.current = true;
      router.replace('/(client)/profile' as any);
    });

    return unsubscribe;
  }, [navigation, router]);

  async function handlePickPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission Required', 'Please allow access to your photo library to upload a photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    setUploadingAvatar(true);
    try {
      const ext = (asset.uri.split('.').pop() || 'jpg').toLowerCase();
      const form = new FormData();
      form.append('avatar', { uri: asset.uri, name: `avatar.${ext}`, type: `image/${ext === 'jpg' ? 'jpeg' : ext}` } as any);
      await clientApi.updateProfile(form as any);
      const profileRes = await clientApi.profile();
      const refreshed = profileRes?.data?.data || profileRes?.data || {};
      const serverAvatar = typeof refreshed?.avatar_url === 'string' && refreshed.avatar_url.trim()
        ? cacheBustAvatarUrl(resolveStorageUrl(refreshed.avatar_url.trim()))
        : '';
      const nextAvatar = serverAvatar || asset.uri;
      setProfile((prev: any) => ({ ...prev, ...refreshed, avatar_url: nextAvatar }));
      setAvatarUri(nextAvatar);
      updateUser({ avatar_url: nextAvatar, avatar: nextAvatar } as any);
    } catch (e: any) {
      Alert.alert('Upload Failed', e?.response?.data?.message || 'Unable to upload photo.');
    } finally {
      setUploadingAvatar(false);
    }
  }
  function startEdit() {
    originalDraft.current = { ...draft };
    setEditMode(true);
  }

  function cancelEdit() {
    setDraft({ ...originalDraft.current });
    setEditMode(false);
  }

  function requestSave() {
    if (!draft.name.trim()) { Alert.alert('Required', 'Name cannot be empty.'); return; }
    const changes = diffDraft(originalDraft.current, draft);
    if (changes.length === 0) { setEditMode(false); return; }
    setConfirmPassword('');
    setShowConfirmPassword(false);
    setConfirmVisible(true);
  }

  async function confirmSave() {
    const pwd = confirmPassword.trim();
    if (!pwd) { Alert.alert('Password Required', 'Enter your current password to confirm changes.'); return; }

    setSavingProfile(true);
    try {
      await authApi.login((profile?.email ?? user?.email ?? '').trim().toLowerCase(), pwd);

      const payload = { name: draft.name.trim(), bio: draft.bio.trim() || null };
      await clientApi.updateProfile(payload);
      setProfile((prev: any) => ({ ...prev, ...payload }));
      updateUser(payload);

      const updated = profileToDraft({ ...profile, ...payload });
      setDraft(updated);
      originalDraft.current = updated;

      setConfirmVisible(false);
      setEditMode(false);
      Alert.alert('Profile Updated', 'Your profile has been saved successfully.');
    } catch (e: any) {
      const msg =
        e?.response?.data?.message ||
        e?.response?.data?.errors?.name?.[0] ||
        'Unable to save. Please check your password and try again.';
      Alert.alert('Save Failed', msg);
    } finally {
      setSavingProfile(false);
    }
  }

  // ── Email OTP ──
  async function handleRequestEmailChange() {
    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.'); return;
    }
    if (trimmed === (profile?.email ?? '').toLowerCase()) {
      Alert.alert('Same Email', 'The new email is the same as your current one.'); return;
    }
    setRequestingEmailOtp(true);
    try {
      const { data } = await authApi.requestEmailChange(trimmed);
      if (data?.debug_code) Alert.alert('Dev Code', `OTP: ${data.debug_code}`);
      setShowEmailModal(true);
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || err?.response?.data?.errors?.new_email?.[0] || 'Failed to send verification code.');
    } finally { setRequestingEmailOtp(false); }
  }

  async function onVerifyEmail(code: string) {
    await authApi.verifyEmailChange(newEmail.trim().toLowerCase(), code);
    const updated = { email: newEmail.trim().toLowerCase() };
    setProfile((prev: any) => ({ ...prev, ...updated }));
    updateUser(updated);
    setShowEmailModal(false);
    setNewEmail('');
    Alert.alert('Email Updated', 'Your email address has been changed successfully.');
  }

  // ── Phone OTP ──
  async function handleRequestPhoneChange() {
    const trimmed = newPhone.trim();
    if (!trimmed) { Alert.alert('Invalid Phone', 'Please enter a phone number.'); return; }
    setRequestingPhoneOtp(true);
    try {
      const { data } = await authApi.requestPhoneChange(trimmed);
      setOtpPhone(trimmed);
      if (data?.debug_code) Alert.alert('Dev Code', `OTP: ${data.debug_code}`);
      setShowPhoneModal(true);
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'Failed to send phone verification code.');
    } finally { setRequestingPhoneOtp(false); }
  }

  async function onVerifyPhone(code: string) {
    await authApi.verifyPhoneChange(otpPhone, code);
    const updated = { phone: otpPhone };
    setProfile((prev: any) => ({ ...prev, ...updated }));
    updateUser(updated);
    setShowPhoneModal(false);
    Alert.alert('Phone Updated', 'Your phone number has been changed successfully.');
  }

  // ── Password ──
  async function handleChangePassword() {
    const current = currentPassword.trim();
    const next = newPassword.trim();
    const confirmNext = confirmNewPassword.trim();
    if (!current || !next || !confirmNext) {
      Alert.alert('Missing Fields', 'Please fill in all password fields.'); return;
    }
    if (next.length < 8) { Alert.alert('Weak Password', 'New password must be at least 8 characters.'); return; }
    if (next !== confirmNext) { Alert.alert('Mismatch', 'New passwords do not match.'); return; }

    setChangingPassword(true);
    try {
      await authApi.login((profile?.email ?? user?.email ?? '').trim().toLowerCase(), current);
      await clientApi.updateProfile({ password: next, password_confirmation: confirmNext });
      setCurrentPassword(''); setNewPassword(''); setConfirmNewPassword('');
      setShowCurrentPassword(false); setShowNewPassword(false); setShowConfirmNewPassword(false);
      Alert.alert('Password Updated', 'Your password was changed successfully.');
    } catch (e: any) {
      Alert.alert('Change Failed', e?.response?.data?.message || e?.response?.data?.errors?.password?.[0] || 'Unable to change password.');
    } finally {
      setChangingPassword(false);
    }
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>;
  }

  const pendingChanges = editMode ? diffDraft(originalDraft.current, draft) : [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[Colors.primary]} />}
      >
        {/* ── My Profile Header ── */}
        <Text style={styles.pageTitle}>My Profile</Text>
        <Text style={styles.pageSubtitle}>Manage your personal information and account details</Text>

        {/* ── Profile Photo Card ── */}
        <View style={styles.card}>
          <View style={styles.photoSectionHeader}>
            <Ionicons name="person-circle-outline" size={18} color={Colors.primary} />
            <Text style={styles.photoSectionTitle}>Profile Photo</Text>
          </View>
          <View style={styles.photoRow}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.photoAvatar} />
            ) : (
              <View style={styles.photoAvatarFallback}>
                <Text style={styles.photoAvatarInitial}>{initials}</Text>
              </View>
            )}
            <View style={styles.photoActions}>
              <TouchableOpacity style={styles.uploadPhotoBtn} onPress={handlePickPhoto} disabled={uploadingAvatar}>
                {uploadingAvatar
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <><Ionicons name="camera" size={15} color="#fff" /><Text style={styles.uploadPhotoBtnText}>Upload Photo</Text></>}
              </TouchableOpacity>
              <Text style={styles.photoHint}>JPG, PNG or WebP · Max 4MB</Text>
            </View>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{statsData.consultations}</Text>
              <Text style={styles.statLabel}>Consultations</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>₱{Number(statsData.totalSpent).toLocaleString()}</Text>
              <Text style={styles.statLabel}>Total Spent</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{statsData.memberSince || '—'}</Text>
              <Text style={styles.statLabel}>Member Since</Text>
            </View>
          </View>
        </View>

        {/* ── Personal Information ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Personal Information</Text>
            {!editMode ? (
              <TouchableOpacity style={styles.editBtn} onPress={startEdit}>
                <Ionicons name="pencil-outline" size={14} color={Colors.primary} />
                <Text style={styles.editBtnText}>Edit</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.editActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={cancelEdit}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, { paddingHorizontal: 14, paddingVertical: 6, marginTop: 0 }]}
                  onPress={requestSave}
                >
                  <Text style={styles.saveBtnText}>Save</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {!editMode ? (
            <>
              <InfoRow icon="person-outline" label="Full Name" value={profile?.name} />
              <InfoRow icon="mail-outline" label="Email" value={profile?.email ?? user?.email} />
              <InfoRow icon="call-outline" label="Phone" value={profile?.phone ?? '-'} />
              <InfoRow icon="document-text-outline" label="About" value={profile?.bio ?? '-'} />
            </>
          ) : (
            <>
              <EditField label="Full Name" icon="person-outline" value={draft.name} onChangeText={(v) => setDraft((p) => ({ ...p, name: v }))} placeholder="Your full name" />
              <EditField label="About" icon="document-text-outline" value={draft.bio} onChangeText={(v) => setDraft((p) => ({ ...p, bio: v }))} placeholder="Tell us about yourself" multiline />

              {pendingChanges.length > 0 && (
                <View style={styles.changesSummary}>
                  <Text style={styles.changesTitle}>Unsaved changes ({pendingChanges.length})</Text>
                  {pendingChanges.map((c) => (
                    <Text key={c.field} style={styles.changesRow}>
                      <Text style={styles.changesField}>{c.field}: </Text>
                      <Text style={styles.changesFrom}>{c.from}</Text>
                      <Text style={styles.changesArrow}> → </Text>
                      <Text style={styles.changesTo}>{c.to}</Text>
                    </Text>
                  ))}
                </View>
              )}
            </>
          )}
        </View>

        {/* ── Email ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Change Email</Text>
          <Text style={styles.hint}>Current: <Text style={{ fontWeight: '700', color: Colors.text }}>{profile?.email ?? user?.email}</Text></Text>
          <Text style={styles.fieldLabel}>New Email Address</Text>
          <TextInput
            style={styles.input}
            value={newEmail}
            onChangeText={setNewEmail}
            placeholder="Enter new email"
            placeholderTextColor={Colors.textLight}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <AppButton label="Send Verification Code" onPress={handleRequestEmailChange} loading={requestingEmailOtp} disabled={!newEmail.trim()} style={{ marginTop: 10 }} />
        </View>

        {/* ── Phone ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Change Phone</Text>
          <Text style={styles.hint}>Current: <Text style={{ fontWeight: '700', color: Colors.text }}>{profile?.phone || 'Not set'}</Text></Text>
          <Text style={styles.fieldLabel}>New Phone Number</Text>
          <TextInput
            style={styles.input}
            value={newPhone}
            onChangeText={setNewPhone}
            placeholder="e.g. +63 9XX XXX XXXX"
            placeholderTextColor={Colors.textLight}
            keyboardType="phone-pad"
          />
          <AppButton label="Verify & Update Phone" onPress={handleRequestPhoneChange} loading={requestingPhoneOtp} style={{ marginTop: 10 }} />
        </View>

        {/* ── Security ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Security</Text>
          <Text style={styles.hint}>Change your password and keep your account protected.</Text>

          <Text style={styles.fieldLabel}>Current Password</Text>
          <View style={styles.passwordRow}>
            <TextInput style={[styles.input, styles.passwordInput]} value={currentPassword} onChangeText={setCurrentPassword} placeholder="Current password" placeholderTextColor={Colors.textLight} secureTextEntry={!showCurrentPassword} autoCapitalize="none" />
            <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowCurrentPassword((p) => !p)}>
              <Ionicons name={showCurrentPassword ? 'eye-off-outline' : 'eye-outline'} size={19} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>New Password</Text>
          <View style={styles.passwordRow}>
            <TextInput style={[styles.input, styles.passwordInput]} value={newPassword} onChangeText={setNewPassword} placeholder="New password (min 8 chars)" placeholderTextColor={Colors.textLight} secureTextEntry={!showNewPassword} autoCapitalize="none" />
            <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowNewPassword((p) => !p)}>
              <Ionicons name={showNewPassword ? 'eye-off-outline' : 'eye-outline'} size={19} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Confirm New Password</Text>
          <View style={styles.passwordRow}>
            <TextInput style={[styles.input, styles.passwordInput]} value={confirmNewPassword} onChangeText={setConfirmNewPassword} placeholder="Confirm new password" placeholderTextColor={Colors.textLight} secureTextEntry={!showConfirmNewPassword} autoCapitalize="none" />
            <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowConfirmNewPassword((p) => !p)}>
              <Ionicons name={showConfirmNewPassword ? 'eye-off-outline' : 'eye-outline'} size={19} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <AppButton label="Change Password" onPress={handleChangePassword} loading={changingPassword} style={{ marginTop: 14 }} />
        </View>

        <SecurityCenterCard />
      </ScrollView>

      {/* ── Confirm Profile Changes Modal ── */}
      <Modal visible={confirmVisible} transparent animationType="slide" onRequestClose={() => setConfirmVisible(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Ionicons name="shield-checkmark-outline" size={26} color={Colors.primary} />
              <Text style={styles.modalTitle}>Confirm Changes</Text>
            </View>
            <Text style={styles.modalSubtitle}>Review your changes before saving:</Text>

            {diffDraft(originalDraft.current, draft).map((c) => (
              <View key={c.field} style={styles.diffRow}>
                <Text style={styles.diffField}>{c.field}</Text>
                <View style={styles.diffValues}>
                  <Text style={styles.diffFrom} numberOfLines={1}>{c.from}</Text>
                  <Ionicons name="arrow-forward" size={12} color={Colors.textMuted} style={{ marginHorizontal: 4 }} />
                  <Text style={styles.diffTo} numberOfLines={1}>{c.to}</Text>
                </View>
              </View>
            ))}

            <Text style={[styles.fieldLabel, { marginTop: 18 }]}>Enter your password to confirm</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Your current password"
                placeholderTextColor={Colors.textLight}
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowConfirmPassword((p) => !p)}>
                <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={19} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setConfirmVisible(false)} disabled={savingProfile}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <AppButton label="Confirm & Save" onPress={confirmSave} loading={savingProfile} style={{ flex: 1, marginTop: 0 }} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* OTP Modals */}
      <OtpModal
        visible={showEmailModal}
        title="Verify Email Change"
        subtitle={`Enter the 6-digit code sent to ${newEmail.trim()}`}
        onVerify={onVerifyEmail}
        onResend={async () => { const { data } = await authApi.requestEmailChange(newEmail.trim().toLowerCase()); if (data?.debug_code) Alert.alert('Dev Code', `OTP: ${data.debug_code}`); }}
        onClose={() => setShowEmailModal(false)}
      />
      <OtpModal
        visible={showPhoneModal}
        title="Verify Phone Change"
        subtitle={`Enter the 6-digit code sent to ${otpPhone}`}
        onVerify={onVerifyPhone}
        onResend={async () => { const { data } = await authApi.requestPhoneChange(otpPhone); if (data?.debug_code) Alert.alert('Dev Code', `OTP: ${data.debug_code}`); }}
        onClose={() => setShowPhoneModal(false)}
      />
    </SafeAreaView>
  );
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value?: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon as any} size={16} color={Colors.textMuted} style={{ width: 22 }} />
      <Text style={styles.infoLabel}>{label}:</Text>
      <Text style={styles.infoValue} numberOfLines={2}>{value ?? '-'}</Text>
    </View>
  );
}

function EditField({
  label, icon, value, onChangeText, placeholder, multiline, keyboardType,
}: {
  label: string; icon: string; value: string;
  onChangeText?: (v: string) => void;
  placeholder?: string; multiline?: boolean;
  keyboardType?: 'default' | 'phone-pad' | 'numeric' | 'email-address';
}) {
  return (
    <View style={styles.editFieldWrap}>
      <View style={styles.editFieldLabelRow}>
        <Ionicons name={icon as any} size={13} color={Colors.textMuted} />
        <Text style={styles.fieldLabel}>{label}</Text>
      </View>
      <TextInput
        style={[styles.input, multiline && styles.textArea]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.textLight}
        keyboardType={keyboardType ?? 'default'}
        multiline={multiline}
        autoCapitalize="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 12, paddingBottom: 140 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
  pageTitle: { fontSize: 24, fontWeight: '800', color: Colors.text, marginBottom: 4, marginTop: 8 },
  pageSubtitle: { fontSize: 13, color: Colors.textMuted, marginBottom: 16, lineHeight: 18 },
  photoSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  photoSectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16 },
  photoAvatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.border },
  photoAvatarFallback: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.primary + '22', borderWidth: 2, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  photoAvatarInitial: { fontSize: 28, fontWeight: '800', color: Colors.primary },
  photoActions: { flex: 1, gap: 6 },
  uploadPhotoBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primaryDark, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, alignSelf: 'flex-start' },
  uploadPhotoBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  photoHint: { fontSize: 11, color: Colors.textMuted },
  statsRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: Colors.border + '66', paddingTop: 14 },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 16, fontWeight: '800', color: Colors.text },
  statLabel: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  statDivider: { width: 1, height: 32, backgroundColor: Colors.border + '80' },
  card: { backgroundColor: Colors.card, borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: Colors.border },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  cardTitle: { fontSize: 18, fontWeight: '800', color: Colors.text },
  hint: { fontSize: 12, color: Colors.textMuted, marginBottom: 10 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primary + '15', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: Colors.primary + '40' },
  editBtnText: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  editActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  cancelBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: Colors.border },
  cancelBtnText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: Colors.border + '60', gap: 6 },
  infoLabel: { fontSize: 14, color: Colors.textMuted, width: 80 },
  infoValue: { fontSize: 14, color: Colors.text, flex: 1, fontWeight: '600' },
  editFieldWrap: { marginBottom: 10 },
  editFieldLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: Colors.textMuted, marginBottom: 4 },
  changesSummary: { marginTop: 10, backgroundColor: Colors.primary + '10', borderRadius: 10, padding: 10, borderLeftWidth: 3, borderLeftColor: Colors.primary },
  changesTitle: { fontSize: 12, fontWeight: '700', color: Colors.primary, marginBottom: 6 },
  changesRow: { fontSize: 12, color: Colors.text, marginBottom: 3 },
  changesField: { fontWeight: '700', color: Colors.text },
  changesFrom: { color: Colors.textMuted, textDecorationLine: 'line-through' },
  changesArrow: { color: Colors.textMuted },
  changesTo: { fontWeight: '600', color: Colors.primary },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: Colors.text, backgroundColor: Colors.background },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  passwordRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Colors.border, borderRadius: 10, backgroundColor: Colors.background },
  passwordInput: { flex: 1, borderWidth: 0, backgroundColor: 'transparent' },
  eyeBtn: { paddingHorizontal: 12, paddingVertical: 10 },
  saveBtn: { marginTop: 14, paddingVertical: 13, borderRadius: 10, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  // modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: Colors.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 22, paddingBottom: Platform.OS === 'ios' ? 36 : 24 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: Colors.text },
  modalSubtitle: { fontSize: 13, color: Colors.textMuted, marginBottom: 14 },
  diffRow: { paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: Colors.border + '50' },
  diffField: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  diffValues: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  diffFrom: { fontSize: 13, color: Colors.textMuted, textDecorationLine: 'line-through', maxWidth: '40%' },
  diffTo: { fontSize: 13, fontWeight: '700', color: Colors.primary, maxWidth: '40%' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 18, alignItems: 'center' },
});
