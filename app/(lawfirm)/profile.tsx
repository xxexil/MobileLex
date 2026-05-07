import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Image,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { lawFirmApi } from '@/services/api';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import AnimatedBorderCard from '@/components/AnimatedBorderCard';
import { resolveStorageUrl } from '@/services/endpoints';

function buildInitials(name: string) {
  const parts = String(name)
    .split(/\s+/)
    .map((part) => part.replace(/[^A-Za-z]/g, ''))
    .filter(Boolean);

  if (!parts.length) return 'LF';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function pickText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text.length > 0) return text;
  }
  return '';
}

export default function LawFirmProfile() {
  const { logout, user } = useAuth();
  const router = useRouter();
  const { isConnected, isInternetReachable } = useNetworkStatus();

  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const profileCompletion = useMemo(() => {
    const checks = [profile?.firm_name ?? profile?.name ?? user?.name, profile?.email ?? user?.email, profile?.phone, profile?.address ?? profile?.location];
    const filled = checks.filter((value) => String(value ?? '').trim().length > 0).length;
    return Math.round((filled / checks.length) * 100);
  }, [profile?.address, profile?.email, profile?.firm_name, profile?.location, profile?.name, profile?.phone, user?.email, user?.name]);

  const avatarSource = useMemo(
    () => pickText(profile?.avatar_url, profile?.firm?.avatar_url, user?.avatar_url, (user as any)?.avatar),
    [profile?.avatar_url, profile?.firm?.avatar_url, user]
  );

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [avatarSource]);

  const load = useCallback(async () => {
    try {
      const [profileRes, dashboardRes] = await Promise.allSettled([
        lawFirmApi.profile(),
        lawFirmApi.dashboard(),
      ]);

      const profileData = profileRes.status === 'fulfilled' ? (profileRes.value?.data ?? {}) : {};
      const dashboardData = dashboardRes.status === 'fulfilled' ? (dashboardRes.value?.data ?? {}) : {};

      const resolvedFirmName = pickText(
        profileData?.firm_name,
        profileData?.firm?.name,
        dashboardData?.firm_name,
        dashboardData?.firm?.name,
        profileData?.company_name,
        profileData?.organization_name,
        user?.name,
        profileData?.name,
      );

      setProfile({
        ...profileData,
        ...(resolvedFirmName ? { firm_name: resolvedFirmName } : {}),
      });
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.name]);

  useEffect(() => {
    load();
  }, [load]);

  const handleLogout = useCallback(() => {
    Alert.alert('Log out', 'Are you sure you want to log out of this law firm account?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: logout },
    ]);
  }, [logout]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const displayName = pickText(profile?.firm_name, profile?.firm?.name, profile?.company_name, profile?.organization_name, user?.name, profile?.name, user?.email?.split('@')[0], 'Law Firm');
  const initials = buildInitials(displayName);
  const avatarUri = avatarSource && !avatarLoadFailed ? resolveStorageUrl(avatarSource) : '';
  const isOnline = !!(isConnected && isInternetReachable !== false);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        <Animated.View entering={FadeInDown.duration(300).delay(40)}>
        <AnimatedBorderCard
          style={styles.heroCardShell}
          contentStyle={styles.heroCard}
          borderRadius={20}
          borderWidth={1.2}
          borderBaseColor="rgba(130, 174, 232, 0.62)"
          contentBackgroundColor={Colors.primaryDark}
        >
          <View style={styles.heroTopRow}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatar} onError={() => setAvatarLoadFailed(true)} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
            )}
            <TouchableOpacity style={styles.settingsIconBtn} onPress={() => router.push('/lawfirm-settings' as any)} hitSlop={8}>
              <Ionicons name="settings-outline" size={20} color={Colors.primaryDark} />
            </TouchableOpacity>
          </View>

          <Text style={styles.title}>{displayName}</Text>
          <Text style={styles.heroRole}>LAW FIRM</Text>

          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: isOnline ? Colors.success : Colors.error }]} />
            <Text style={styles.statusText}>{isOnline ? 'Online' : 'Offline'}</Text>
          </View>
        </AnimatedBorderCard>
        </Animated.View>


        <Animated.View entering={FadeInDown.duration(300).delay(100)}>
        <AnimatedBorderCard style={styles.cardShell} contentStyle={styles.accountHealthCard} borderRadius={14} borderWidth={1.1}>
          <View style={styles.accountHealthTop}>
            <Text style={styles.accountHealthTitle}>Account Health</Text>
            <Text style={styles.accountHealthPercent}>{profileCompletion}%</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${profileCompletion}%` }]} />
          </View>
          <Text style={styles.accountHealthHint}>Complete your firm details in Settings to build stronger client trust.</Text>
        </AnimatedBorderCard>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(300).delay(140)}>
        <AnimatedBorderCard style={styles.cardShell} contentStyle={styles.accountDetailsCard} borderRadius={14} borderWidth={1.1}>
          <Text style={styles.accountDetailsTitle}>Account Details</Text>
          <DetailRow icon="mail-outline" label="Email" value={pickText(profile?.email, user?.email, 'Not set')} verified />
          <DetailRow icon="call-outline" label="Phone" value={pickText(profile?.phone, 'Not set')} />
          <DetailRow icon="business-outline" label="Firm" value={displayName} />
          <DetailRow icon="location-outline" label="Address" value={pickText(profile?.address, profile?.location, 'Not set')} />
          <View style={styles.badgesRow}>
            <VerificationBadge icon="shield-checkmark-outline" text="Protected Session" tone="blue" />
            <VerificationBadge icon="business-outline" text="Firm Account" tone="green" />
          </View>
        </AnimatedBorderCard>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(300).delay(180)}>
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
        </Animated.View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#EEF2F6' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#EEF2F6' },
  content: { padding: 14, paddingBottom: 24 },
  heroCardShell: {
    marginBottom: 10,
  },
  heroCard: {
    backgroundColor: Colors.primaryDark,
    borderRadius: 20,
    padding: 16,
  },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarText: { color: Colors.primaryDark, fontSize: 30, fontWeight: '800' },
  settingsIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', marginTop: 12 },
  heroRole: { color: '#C9D4E8', fontSize: 12, fontWeight: '700', marginTop: 2, letterSpacing: 0.5 },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 8 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E0E7EF',
    padding: 14,
    marginBottom: 10,
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
  cardShell: { marginBottom: 10 },
  accountHealthCard: { backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#E0E7EF', padding: 14 },
  accountHealthTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  accountHealthTitle: { color: Colors.text, fontSize: 15, fontWeight: '800' },
  accountHealthPercent: { color: Colors.primary, fontSize: 18, fontWeight: '800' },
  progressTrack: { height: 8, borderRadius: 999, backgroundColor: Colors.border + '66', overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 999 },
  accountHealthHint: { color: Colors.textMuted, fontSize: 12, marginTop: 8, lineHeight: 17 },
  accountDetailsCard: { backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#E0E7EF', padding: 14 },
  accountDetailsTitle: { color: Colors.text, fontSize: 16, fontWeight: '800', marginBottom: 8 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: Colors.border + '66' },
  detailLabel: { color: Colors.textMuted, fontSize: 12, width: 64, fontWeight: '600' },
  detailValue: { color: Colors.text, fontSize: 13, fontWeight: '600', flex: 1 },
  verifiedDot: { marginLeft: 4 },
  badgesRow: { marginTop: 12, flexDirection: 'row', gap: 8 },
  badgeBlue: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#E8F1FF', borderColor: '#CFE0FF', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  badgeGreen: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#EBFAF2', borderColor: '#C6EED7', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  badgeTextBlue: { color: '#1A4FA3', fontSize: 11, fontWeight: '700' },
  badgeTextGreen: { color: '#197A49', fontSize: 11, fontWeight: '700' },
  logoutCard: {
    backgroundColor: '#FFF8F8',
    borderWidth: 1,
    borderColor: '#F4C7C3',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
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
