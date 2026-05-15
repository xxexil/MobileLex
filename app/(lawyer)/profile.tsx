import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, RefreshControl,
  Image, BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { authApi, lawyerApi } from '@/services/api';
import { useAuth } from '@/context/auth';
import { Colors } from '@/constants/theme';
import OtpModal from '@/components/OtpModal';
import AnimatedBorderCard from '@/components/AnimatedBorderCard';
import ConfirmActionModal from '@/components/ConfirmActionModal';
import { resolveStorageUrl } from '@/services/endpoints';

const AVAILABILITY_OPTIONS = [
  { value: 'available', label: 'Available', color: Colors.available },
  { value: 'busy', label: 'Busy', color: Colors.busy },
  { value: 'offline', label: 'Offline', color: Colors.offline },
] as const;

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type BlockedDate = {
  id: number;
  date: string;
  reason?: string | null;
};

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function formatDateValue(value: Date) {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function formatMonthValue(value: Date) {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}`;
}

function getMonthStart(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function changeMonth(value: Date, amount: number) {
  return new Date(value.getFullYear(), value.getMonth() + amount, 1);
}

function getCalendarDays(value: Date) {
  const firstDay = new Date(value.getFullYear(), value.getMonth(), 1);
  const daysInMonth = new Date(value.getFullYear(), value.getMonth() + 1, 0).getDate();
  const days: Array<Date | null> = Array.from({ length: firstDay.getDay() }, () => null);

  for (let day = 1; day <= daysInMonth; day += 1) {
    days.push(new Date(value.getFullYear(), value.getMonth(), day));
  }

  while (days.length % 7 !== 0) {
    days.push(null);
  }

  return days;
}

function isWeekendDate(value: Date) {
  return value.getDay() === 0 || value.getDay() === 6;
}

function getNextBusinessDay() {
  const current = new Date();
  current.setHours(0, 0, 0, 0);

  while (isWeekendDate(current)) {
    current.setDate(current.getDate() + 1);
  }

  return current;
}

function normalizePracticeAreas(profile: any): string[] {
  const source = Array.isArray(profile?.practice_areas)
    ? profile.practice_areas
    : Array.isArray(profile?.specialties)
      ? profile.specialties
      : String(profile?.practice_areas ?? profile?.specialties ?? profile?.specialty ?? '').split(',');

  return Array.from(new Set(
    source.map((item: unknown) => String(item ?? '').trim()).filter(Boolean)
  ));
}

export default function LawyerProfile() {
  const router = useRouter();
  const { logout, updateUser, user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const { isConnected, isInternetReachable } = useNetworkStatus();
  const isOnline = isConnected && isInternetReachable;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [blockedDatesLoading, setBlockedDatesLoading] = useState(false);
  const [blockingActionLoading, setBlockingActionLoading] = useState(false);
  const [logoutConfirmVisible, setLogoutConfirmVisible] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [requestingEmailOtp, setRequestingEmailOtp] = useState(false);
  const [otpPhone, setOtpPhone] = useState('');
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [requestingPhoneOtp, setRequestingPhoneOtp] = useState(false);
  const [bio, setBio] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [location, setLocation] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [experienceYears, setExperienceYears] = useState('');
  const [availability, setAvailability] = useState<'available' | 'busy' | 'offline'>('available');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [blockedDates, setBlockedDates] = useState<BlockedDate[]>([]);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [selectedBlockedDate, setSelectedBlockedDate] = useState(() => formatDateValue(getNextBusinessDay()));
  const [blockedReason, setBlockedReason] = useState('');
  const [blockCalendarMonth, setBlockCalendarMonth] = useState(() => getMonthStart(getNextBusinessDay()));

  const loadProfile = useCallback(async () => {
    const { data } = await lawyerApi.profile();
    setProfile(data);
    setName(data.name ?? '');
    setPhone(data.phone ?? '');
    setBio(data.bio ?? '');
    setSpecialty(data.specialty ?? '');
    setLocation(data.location ?? '');
    setHourlyRate(String(data.hourly_rate ?? ''));
    setExperienceYears(String(data.experience_years ?? ''));
    setAvailability(data.availability_status ?? 'available');
  }, []);

  const loadBlockedDates = useCallback(async () => {
    setBlockedDatesLoading(true);
    try {
      const { data } = await lawyerApi.blockedDates();
      setBlockedDates(Array.isArray(data) ? data : []);
    } finally {
      setBlockedDatesLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      await Promise.all([loadProfile(), loadBlockedDates()]);
    } catch {
      // ignore initial loading errors; existing UI handles missing values
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadBlockedDates, loadProfile]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const selectedEntry = blockedDates.find((entry) => entry.date === selectedBlockedDate);
    setBlockedReason(selectedEntry?.reason ?? '');
  }, [blockedDates, selectedBlockedDate]);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        router.replace('/(lawyer)' as any);
        return true;
      });

      return () => subscription.remove();
    }, [router])
  );

  function onRefresh() {
    setRefreshing(true);
    load();
  }

  const handleLogout = useCallback(() => {
    setLogoutConfirmVisible(true);
  }, []);

  const confirmLogout = useCallback(() => {
    setLogoutConfirmVisible(false);
    logout();
  }, [logout]);

  async function save() {
    setSaving(true);
    try {
      const payload: any = {
        name,
        bio,
        specialty,
        location,
        hourly_rate: parseFloat(hourlyRate) || 0,
        experience_years: parseInt(experienceYears) || 0,
      };
      const { data } = await lawyerApi.updateProfile(payload);
      updateUser(data.user ?? data);
      setEditing(false);
      await loadProfile();
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? 'Failed to save changes.';
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword() {
    const current = currentPassword.trim();
    const next = newPassword.trim();
    const confirmNext = confirmNewPassword.trim();

    if (!current || !next || !confirmNext) {
      Alert.alert('Missing Fields', 'Please fill in current password, new password, and confirmation.');
      return;
    }

    if (next.length < 8) {
      Alert.alert('Weak Password', 'New password must be at least 8 characters long.');
      return;
    }

    if (next !== confirmNext) {
      Alert.alert('Mismatch', 'New password and confirmation do not match.');
      return;
    }

    setChangingPassword(true);
    try {
      await authApi.login((profile?.email ?? '').trim().toLowerCase(), current);
      await lawyerApi.updateProfile({
        password: next,
        password_confirmation: confirmNext,
      });

      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setShowConfirmNewPassword(false);
      Alert.alert('Password Updated', 'Your password was changed successfully.');
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.response?.data?.errors?.password?.[0] || 'Unable to change password right now.';
      Alert.alert('Change Failed', msg);
    } finally {
      setChangingPassword(false);
    }
  }

  async function handleRequestEmailChange() {
    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }
    if (trimmed === (profile?.email ?? '').toLowerCase()) {
      Alert.alert('Same Email', 'The new email is the same as your current one.');
      return;
    }
    setRequestingEmailOtp(true);
    try {
      const { data } = await authApi.requestEmailChange(trimmed);
      if (data?.debug_code) Alert.alert('Dev Code', `OTP: ${data.debug_code}`);
      setShowEmailModal(true);
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || err?.response?.data?.errors?.new_email?.[0] || 'Failed to send verification code.');
    } finally {
      setRequestingEmailOtp(false);
    }
  }

  async function handleRequestPhoneChange() {
    const trimmed = phone.trim();
    if (!trimmed) {
      Alert.alert('Invalid Phone', 'Please enter a phone number.');
      return;
    }
    setRequestingPhoneOtp(true);
    try {
      const { data } = await authApi.requestPhoneChange(trimmed);
      setOtpPhone(trimmed);
      if (data?.debug_code) Alert.alert('Dev Code', `OTP: ${data.debug_code}`);
      setShowPhoneModal(true);
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'Failed to send phone verification code.');
    } finally {
      setRequestingPhoneOtp(false);
    }
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

  async function onVerifyPhone(code: string) {
    await authApi.verifyPhoneChange(otpPhone, code);
    const updated = { phone: otpPhone };
    setProfile((prev: any) => ({ ...prev, ...updated }));
    updateUser(updated);
    setShowPhoneModal(false);
    Alert.alert('Phone Updated', 'Your phone number has been changed successfully.');
  }

  async function changeAvailability(newStatus: 'available' | 'busy' | 'offline') {
    setAvailability(newStatus);
    try {
      await lawyerApi.updateAvailability(newStatus);
    } catch {
      loadProfile();
    }
  }

  async function saveBlockedDate() {
    if (!selectedBlockedDate) {
      Alert.alert('Select a Date', 'Choose a weekday from the calendar first.');
      return;
    }

    setBlockingActionLoading(true);
    try {
      await lawyerApi.addBlockedDate({
        blocked_date: selectedBlockedDate,
        reason: blockedReason.trim() || undefined,
      });
      await loadBlockedDates();
      Alert.alert('Blocked', 'The selected date is now unavailable for clients.');
    } catch (e: any) {
      const errors = e?.response?.data?.errors;
      const message = errors ? Object.values(errors).flat().join('\n') : e?.response?.data?.message || 'Failed to block date.';
      Alert.alert('Error', message);
    } finally {
      setBlockingActionLoading(false);
    }
  }

  async function removeBlockedDate(id: number) {
    setBlockingActionLoading(true);
    try {
      await lawyerApi.removeBlockedDate(id);
      await loadBlockedDates();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message || 'Failed to remove blocked date.');
    } finally {
      setBlockingActionLoading(false);
    }
  }

  function confirmRemoveBlockedDate(entry: BlockedDate) {
    Alert.alert('Remove Blocked Date', `Make ${entry.date} bookable again?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeBlockedDate(entry.id) },
    ]);
  }

  const profileCompletion = useMemo(() => {
    const checks = [
      profile?.name,
      profile?.email,
      profile?.phone,
      profile?.specialty,
      profile?.location,
      profile?.bio,
      profile?.hourly_rate,
      profile?.experience_years,
    ];
    const filled = checks.filter((value) => String(value ?? '').trim().length > 0).length;
    return Math.round((filled / checks.length) * 100);
  }, [
    profile?.bio,
    profile?.email,
    profile?.experience_years,
    profile?.hourly_rate,
    profile?.location,
    profile?.name,
    profile?.phone,
    profile?.specialty,
  ]);

  const avatarSource = useMemo(
    () => String(profile?.avatar_url ?? user?.avatar_url ?? (user as any)?.avatar ?? '').trim(),
    [profile?.avatar_url, user]
  );

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [avatarSource]);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>;

  const initials = (profile?.name ?? user?.name ?? 'L').split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
  const avatarUri = avatarSource && !avatarLoadFailed ? resolveStorageUrl(avatarSource) : '';
  const statusColor = AVAILABILITY_OPTIONS.find((o) => o.value === availability)?.color ?? Colors.offline;
  const monthLabel = blockCalendarMonth.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
  const calendarDays = getCalendarDays(blockCalendarMonth);
  const todayKey = formatDateValue(new Date());
  const currentMonth = getMonthStart(getNextBusinessDay());
  const canGoPrevMonth = formatMonthValue(blockCalendarMonth) > formatMonthValue(currentMonth);
  const blockedLookup = new Map(blockedDates.map((entry) => [entry.date, entry]));
  const selectedBlockedEntry = blockedLookup.get(selectedBlockedDate);
  const practiceAreas = normalizePracticeAreas(profile);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
    >
      <AnimatedBorderCard style={styles.statusCardShell} contentStyle={styles.statusCard} borderRadius={14} borderWidth={1.1}>
        <Text style={styles.statusCardTitle}>Booking Rules</Text>
        <Text style={styles.statusCardText}>Clients can only book Monday to Friday, 9:00 AM to 5:00 PM.</Text>
        <Text style={styles.statusCardText}>Device status: <Text style={{ color: isOnline ? Colors.success : Colors.error, fontWeight: '700' }}>{isOnline ? 'Online' : 'Offline'}</Text></Text>
      </AnimatedBorderCard>

        <View style={styles.avatarSection}>
        <TouchableOpacity
          style={styles.settingsIconBtn}
          onPress={() => router.push('/(lawyer)/settings')}
          accessibilityLabel="Open profile settings"
          accessibilityRole="button"
        >
          <Ionicons name="settings-outline" size={21} color={Colors.primary} />
        </TouchableOpacity>
        {avatarUri ? (
          <View style={styles.avatarWrap}>
            <Image source={{ uri: avatarUri }} style={styles.avatarImage} resizeMode="cover" onError={() => setAvatarLoadFailed(true)} />
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          </View>
        ) : (
          <View style={[styles.avatar, styles.avatarWrap]}>
            <Text style={styles.avatarText}>{initials}</Text>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          </View>
        )}
        <Text style={styles.profileName}>{profile?.name ?? user?.name}</Text>
        <Text style={styles.profileEmail}>{profile?.email}</Text>
        <Text style={styles.profileRole}>Lawyer</Text>
      </View>


      <AnimatedBorderCard style={styles.cardShell} contentStyle={styles.accountHealthCard} borderRadius={14} borderWidth={1.1}>
        <View style={styles.accountHealthTop}>
          <Text style={styles.accountHealthTitle}>Account Health</Text>
          <Text style={styles.accountHealthPercent}>{profileCompletion}%</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${profileCompletion}%` }]} />
        </View>
        <Text style={styles.accountHealthHint}>Complete your profile in Settings to improve trust and booking confidence.</Text>
      </AnimatedBorderCard>

      <AnimatedBorderCard style={styles.cardShell} contentStyle={styles.accountDetailsCard} borderRadius={14} borderWidth={1.1}>
        <Text style={styles.accountDetailsTitle}>Account Details</Text>
        <DetailRow icon="mail-outline" label="Email" value={profile?.email || 'Not set'} verified />
        <DetailRow icon="call-outline" label="Phone" value={profile?.phone || 'Not set'} verified={Boolean(String(profile?.phone ?? '').trim())} />
        <DetailRow icon="briefcase-outline" label="Practice Areas" value={practiceAreas.join(', ') || profile?.specialty || 'Not set'} />
        <DetailRow icon="location-outline" label="Location" value={profile?.location || 'Not set'} />
        <View style={styles.badgesRow}>
          <VerificationBadge icon="shield-checkmark-outline" text="Protected Session" tone="blue" />
          <VerificationBadge icon="ribbon-outline" text="Lawyer Profile" tone="green" />
        </View>
      </AnimatedBorderCard>

      <AnimatedBorderCard style={styles.cardShell} contentStyle={styles.securityCardLite} borderRadius={14} borderWidth={1.1}>
        <View style={styles.securityIconWrapLite}>
          <Ionicons name="lock-closed-outline" size={18} color={Colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.securityTitleLite}>Account Security</Text>
          <Text style={styles.securityTextLite}>Single-device session protection is active on your account.</Text>
        </View>
      </AnimatedBorderCard>

      <TouchableOpacity style={styles.logoutCard} onPress={handleLogout} activeOpacity={0.85}>
        <View style={styles.logoutIconWrap}>
          <Ionicons name="log-out-outline" size={19} color="#B42318" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.logoutTitle}>Log out</Text>
          <Text style={styles.logoutSubtitle}>End this session and return to sign in.</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#B42318" />
      </TouchableOpacity>

      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statVal}>{profile?.rating ?? '0.0'}</Text>
          <Text style={styles.statLabel}>Rating</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statVal}>{profile?.reviews_count ?? 0}</Text>
          <Text style={styles.statLabel}>Reviews</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statVal}>{profile?.experience_years ?? 0} yrs</Text>
          <Text style={styles.statLabel}>Experience</Text>
        </View>
      </View>

      <OtpModal
        visible={showEmailModal}
        title="Verify Email Change"
        subtitle={`Enter the 6-digit code sent to ${newEmail.trim()}`}
        onVerify={onVerifyEmail}
        onResend={async () => {
          const { data } = await authApi.requestEmailChange(newEmail.trim().toLowerCase());
          if (data?.debug_code) Alert.alert('Dev Code', `OTP: ${data.debug_code}`);
        }}
        onClose={() => setShowEmailModal(false)}
      />
      <OtpModal
        visible={showPhoneModal}
        title="Verify Phone Change"
        subtitle={`Enter the 6-digit code sent to ${otpPhone}`}
        onVerify={onVerifyPhone}
        onResend={async () => {
          const { data } = await authApi.requestPhoneChange(otpPhone);
          if (data?.debug_code) Alert.alert('Dev Code', `OTP: ${data.debug_code}`);
        }}
        onClose={() => setShowPhoneModal(false)}
      />
    </ScrollView>

    <ConfirmActionModal
      visible={logoutConfirmVisible}
      title="End this session?"
      message="You will be signed out of this lawyer account and returned to the login screen."
      confirmLabel="Log out"
      cancelLabel="Stay signed in"
      icon="log-out-outline"
      tone="danger"
      onCancel={() => setLogoutConfirmVisible(false)}
      onConfirm={confirmLogout}
    />
    </SafeAreaView>
  );
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value?: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon as any} size={16} color={Colors.textMuted} style={{ width: 22 }} />
      <Text style={styles.infoLabel}>{label}:</Text>
      <Text style={styles.infoValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, paddingTop: 22, paddingBottom: 140 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  statusCardShell: { marginBottom: 14 },
  statusCard: { backgroundColor: Colors.primary + '10', borderColor: Colors.primary + '25', borderWidth: 1, borderRadius: 14, padding: 14 },
  statusCardTitle: { fontSize: 14, fontWeight: '800', color: Colors.primary, marginBottom: 6 },
  statusCardText: { fontSize: 13, color: Colors.textMuted, lineHeight: 19 },
  avatarSection: { alignItems: 'center', marginTop: 2, marginBottom: 24 },
  avatarWrap: { position: 'relative', overflow: 'visible' },
  settingsIconBtn: {
    position: 'absolute',
    right: 2,
    top: 0,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    zIndex: 5,
  },
  avatar: { width: 94, height: 94, borderRadius: 47, backgroundColor: Colors.primaryDark, justifyContent: 'center', alignItems: 'center', marginBottom: 12, overflow: 'hidden' },
  avatarImage: { width: 94, height: 94, borderRadius: 47, overflow: 'hidden' },
  avatarText: { color: '#fff', fontSize: 30, fontWeight: '700' },
  statusDot: { position: 'absolute', bottom: 4, right: 4, width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: Colors.background },
  profileName: { fontSize: 21, fontWeight: '800', color: Colors.text },
  profileEmail: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  profileRole: { fontSize: 12, color: Colors.secondary, fontWeight: '600', marginTop: 4, backgroundColor: Colors.secondary + '20', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 14,
    gap: 12,
  },
  settingsRowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.primary + '14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsRowText: { flex: 1, fontSize: 15, fontWeight: '600', color: Colors.text },
  cardShell: { marginBottom: 14 },
  accountHealthCard: { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, borderRadius: 14, padding: 14 },
  accountHealthTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  accountHealthTitle: { color: Colors.text, fontSize: 15, fontWeight: '800' },
  accountHealthPercent: { color: Colors.primary, fontSize: 18, fontWeight: '800' },
  progressTrack: { height: 8, borderRadius: 999, backgroundColor: Colors.border + '66', overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 999 },
  accountHealthHint: { color: Colors.textMuted, fontSize: 12, marginTop: 8, lineHeight: 17 },
  accountDetailsCard: { backgroundColor: Colors.card, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, padding: 14 },
  accountDetailsTitle: { color: Colors.text, fontSize: 16, fontWeight: '800', marginBottom: 8 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: Colors.border + '66' },
  detailLabel: { color: Colors.textMuted, fontSize: 12, width: 74, fontWeight: '600' },
  detailValue: { color: Colors.text, fontSize: 13, fontWeight: '600', flex: 1 },
  verifiedDot: { marginLeft: 4 },
  badgesRow: { marginTop: 12, flexDirection: 'row', gap: 8 },
  badgeBlue: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#E8F1FF', borderColor: '#CFE0FF', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  badgeGreen: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#EBFAF2', borderColor: '#C6EED7', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  badgeTextBlue: { color: '#1A4FA3', fontSize: 11, fontWeight: '700' },
  badgeTextGreen: { color: '#197A49', fontSize: 11, fontWeight: '700' },
  securityCardLite: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#F6FAFF', borderWidth: 1, borderColor: '#D8E8FF', borderRadius: 14, padding: 14 },
  securityIconWrapLite: { width: 34, height: 34, borderRadius: 10, backgroundColor: Colors.primary + '18', alignItems: 'center', justifyContent: 'center' },
  securityTitleLite: { color: Colors.text, fontSize: 14, fontWeight: '800', marginBottom: 3 },
  securityTextLite: { color: Colors.textMuted, fontSize: 12, lineHeight: 17 },
  card: { backgroundColor: Colors.card, borderRadius: 14, padding: 16, marginBottom: 14, elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  cardSubtitle: { fontSize: 12, color: Colors.textMuted, lineHeight: 18, maxWidth: 250 },
  availRow: { flexDirection: 'row', gap: 8 },
  availChip: { flex: 1, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  availChipText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  calendarCard: { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, borderRadius: 14, padding: 12, marginBottom: 14 },
  calendarHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  calendarNavBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.card },
  calendarNavBtnDisabled: { opacity: 0.45 },
  calendarMonthLabel: { fontSize: 15, fontWeight: '700', color: Colors.text },
  calendarWeekRow: { flexDirection: 'row', marginBottom: 8 },
  calendarWeekLabel: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: Colors.textMuted },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  calendarDayBtn: { width: '13.2%', aspectRatio: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border },
  calendarDayEmpty: { backgroundColor: 'transparent', borderColor: 'transparent' },
  calendarDaySelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  calendarDayBlocked: { backgroundColor: Colors.error + '18', borderColor: Colors.error + '55' },
  calendarDayWeekend: { backgroundColor: Colors.textLight + '18', borderColor: Colors.textLight + '45' },
  calendarDayText: { fontSize: 13, fontWeight: '700', color: Colors.text },
  calendarDayTextSelected: { color: '#fff' },
  calendarDayTextDisabled: { color: Colors.textLight },
  calendarLegendRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginTop: 12 },
  calendarLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  calendarLegendDot: { width: 8, height: 8, borderRadius: 4 },
  calendarLegendText: { fontSize: 11, color: Colors.textMuted },
  selectedDateCard: { backgroundColor: Colors.primary + '0F', borderColor: Colors.primary + '25', borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12 },
  selectedDateLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, color: Colors.textMuted, marginBottom: 4 },
  selectedDateValue: { fontSize: 16, fontWeight: '800', color: Colors.text },
  selectedDateHint: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },
  subsectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.text, marginTop: 16, marginBottom: 10 },
  blockedList: { gap: 10 },
  blockedListItem: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 12, backgroundColor: Colors.background },
  blockedListDate: { fontSize: 14, fontWeight: '700', color: Colors.text },
  blockedListReason: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },
  blockedListRemove: { padding: 4 },
  emptyStateText: { fontSize: 13, color: Colors.textMuted },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statBox: { flex: 1, backgroundColor: Colors.card, borderRadius: 12, padding: 14, alignItems: 'center', elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  statVal: { fontSize: 18, fontWeight: '800', color: Colors.primary },
  statLabel: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  label: { fontSize: 12, fontWeight: '600', color: Colors.textMuted, marginBottom: 6, marginTop: 10 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: Colors.text, backgroundColor: Colors.background },
  valueText: { color: Colors.text, fontSize: 14, fontWeight: '600', marginBottom: 8 },
  verifyBtn: { marginTop: 8, backgroundColor: Colors.primary, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  verifyBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  securityHint: { fontSize: 12, color: Colors.textMuted, marginBottom: 8 },
  passwordRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Colors.border, borderRadius: 10, backgroundColor: Colors.background },
  passwordInput: { flex: 1, borderWidth: 0, backgroundColor: 'transparent' },
  eyeBtn: { paddingHorizontal: 12, paddingVertical: 10 },
  reasonInput: { minHeight: 64, textAlignVertical: 'top' },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  cancelBtnText: { color: Colors.textMuted, fontWeight: '600' },
  saveBtn: { flex: 2, paddingVertical: 13, borderRadius: 10, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  dashboardShortcutBtn: { flexDirection: 'row', gap: 8, marginTop: 14, flex: undefined },
  saveBtnText: { color: '#fff', fontWeight: '700' },
  removeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: Colors.error + '35', backgroundColor: Colors.error + '10' },
  removeBtnText: { color: Colors.error, fontWeight: '700' },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: Colors.border + '60', gap: 6 },
  infoLabel: { fontSize: 13, color: Colors.textMuted, width: 80 },
  infoValue: { fontSize: 13, color: Colors.text, flex: 1, fontWeight: '500' },
  logoutCard: {
    backgroundColor: '#FFF8F8',
    borderWidth: 1,
    borderColor: '#F4C7C3',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    marginBottom: 10,
  },
  logoutIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#FEE4E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutTitle: {
    color: '#B42318',
    fontSize: 15,
    fontWeight: '900',
  },
  logoutSubtitle: {
    color: '#8A3A34',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
});

function DetailRow({
  icon,
  label,
  value,
  verified,
}: {
  icon: string;
  label: string;
  value: string;
  verified?: boolean;
}) {
  return (
    <View style={styles.detailRow}>
      <Ionicons name={icon as any} size={15} color={Colors.primary} />
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={1}>{value}</Text>
      {verified ? <Ionicons name="checkmark-circle" size={16} color={Colors.success} style={styles.verifiedDot} /> : null}
    </View>
  );
}

function VerificationBadge({
  icon,
  text,
  tone,
}: {
  icon: string;
  text: string;
  tone: 'blue' | 'green';
}) {
  const isBlue = tone === 'blue';
  return (
    <View style={isBlue ? styles.badgeBlue : styles.badgeGreen}>
      <Ionicons name={icon as any} size={13} color={isBlue ? '#1A4FA3' : '#197A49'} />
      <Text style={isBlue ? styles.badgeTextBlue : styles.badgeTextGreen}>{text}</Text>
    </View>
  );
}
