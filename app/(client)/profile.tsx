import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  BackHandler,
  Modal,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { clientApi } from '@/services/api';
import { useAuth } from '@/context/auth';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Colors } from '@/constants/theme';
import AnimatedBorderCard from '@/components/AnimatedBorderCard';
import { resolveStorageUrl } from '@/services/endpoints';

interface ProfileData {
  id?: number;
  name?: string;
  email?: string;
  phone?: string | null;
  bio?: string | null;
  role?: string;
  avatar_url?: string | null;
}

export default function ProfileScreen() {
  const { logout, user } = useAuth();
  const { isConnected, isInternetReachable } = useNetworkStatus();
  const router = useRouter();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [logoutConfirmVisible, setLogoutConfirmVisible] = useState(false);

  const initials = useMemo(() => {
    const source = (profile?.name || user?.name || 'U').trim();
    return source.charAt(0).toUpperCase();
  }, [profile?.name, user?.name]);
  const avatarSource = useMemo(() => {
    const profileAvatar = typeof profile?.avatar_url === 'string' ? profile.avatar_url.trim() : '';
    const userAvatar = typeof user?.avatar_url === 'string' ? user.avatar_url.trim() : '';
    const legacyUserAvatar = typeof (user as any)?.avatar === 'string' ? (user as any).avatar.trim() : '';

    const isFreshUserAvatar = userAvatar
      && (/^https?:\/\//i.test(userAvatar) ? userAvatar.includes('?v=') : true);

    return (isFreshUserAvatar ? userAvatar : profileAvatar) || userAvatar || legacyUserAvatar || profileAvatar || '';
  }, [profile?.avatar_url, user]);
  const avatarUri = useMemo(() => {
    const raw = avatarSource;
    return raw && !avatarLoadFailed ? resolveStorageUrl(String(raw)) : '';
  }, [avatarLoadFailed, avatarSource]);

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [avatarSource]);

  const isOnline = !!(isConnected && isInternetReachable !== false);
  const profileCompletion = useMemo(() => {
    const checks = [profile?.name || user?.name, profile?.email || user?.email, profile?.phone, profile?.bio];
    const filled = checks.filter((value) => String(value ?? '').trim().length > 0).length;
    return Math.round((filled / checks.length) * 100);
  }, [profile?.bio, profile?.email, profile?.name, profile?.phone, user?.email, user?.name]);

  const load = useCallback(async () => {
    try {
      const { data } = await clientApi.profile();
      const payload = data?.data || data || {};
      setProfile(payload);
    } catch {
      setProfile({
        name: user?.name,
        email: user?.email,
        role: user?.role,
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.email, user?.name, user?.role]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        router.replace('/(client)' as any);
        return true;
      });

      return () => subscription.remove();
    }, [router])
  );

  const handleLogout = useCallback(() => {
    setLogoutConfirmVisible(true);
  }, []);

  const confirmLogout = useCallback(() => {
    setLogoutConfirmVisible(false);
    logout();
  }, [logout]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
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
            <TouchableOpacity style={styles.settingsBtn} onPress={() => router.push('/(client)/settings' as any)} hitSlop={8}>
              <Ionicons name="settings-outline" size={20} color={Colors.primaryDark} />
            </TouchableOpacity>
          </View>

          <Text style={styles.name}>{profile?.name || user?.name || 'Client User'}</Text>
          <Text style={styles.role}>{(profile?.role || user?.role || 'client').toString().toUpperCase()}</Text>

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
          <Text style={styles.accountHealthHint}>Complete your profile details in Settings for a better client experience.</Text>
        </AnimatedBorderCard>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(300).delay(140)}>
        <AnimatedBorderCard style={styles.cardShell} contentStyle={styles.accountDetailsCard} borderRadius={14} borderWidth={1.1}>
          <Text style={styles.accountDetailsTitle}>Account Details</Text>
          <DetailRow icon="mail-outline" label="Email" value={profile?.email || user?.email || 'Not set'} verified />
          <DetailRow icon="call-outline" label="Phone" value={profile?.phone || 'Not set'} />
          <DetailRow icon="person-outline" label="Name" value={profile?.name || user?.name || 'Not set'} />
          <DetailRow icon="document-text-outline" label="Bio" value={profile?.bio || 'No bio yet'} />
          <View style={styles.badgesRow}>
            <VerificationBadge icon="shield-checkmark-outline" text="Protected Session" tone="blue" />
            <VerificationBadge icon="mail-open-outline" text="Email Verified" tone="green" />
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

      <Modal
        visible={logoutConfirmVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setLogoutConfirmVisible(false)}
      >
        <View style={styles.logoutModalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setLogoutConfirmVisible(false)} />
          <View style={styles.logoutModalSheet}>
            <View style={styles.logoutModalHandle} />
            <View style={styles.logoutModalHero}>
              <View style={styles.logoutModalIconWrap}>
                <Ionicons name="log-out-outline" size={23} color="#B42318" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.logoutModalTitle}>End this session?</Text>
                <Text style={styles.logoutModalCopy}>
                  You will be signed out of this client account and returned to the login screen.
                </Text>
              </View>
            </View>

            <View style={styles.logoutModalActions}>
              <TouchableOpacity
                style={styles.logoutModalCancelBtn}
                onPress={() => setLogoutConfirmVisible(false)}
                activeOpacity={0.85}
              >
                <Text style={styles.logoutModalCancelText}>Stay signed in</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.logoutModalConfirmBtn}
                onPress={confirmLogout}
                activeOpacity={0.85}
              >
                <Text style={styles.logoutModalConfirmText}>Log out</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
  content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 120 },
  heroCardShell: {
    marginBottom: 12,
  },
  heroCard: {
    backgroundColor: Colors.primaryDark,
    borderRadius: 20,
    padding: 18,
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
  settingsBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { color: '#fff', fontSize: 23, fontWeight: '800', marginTop: 14 },
  role: { color: '#C9D4E8', fontSize: 12, fontWeight: '700', marginTop: 2, letterSpacing: 0.5 },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 8 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 12,
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
  cardShell: {
    marginBottom: 12,
  },
  accountHealthCard: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    padding: 14,
  },
  accountHealthTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  accountHealthTitle: { color: Colors.text, fontSize: 15, fontWeight: '800' },
  accountHealthPercent: { color: Colors.primary, fontSize: 18, fontWeight: '800' },
  progressTrack: { height: 8, borderRadius: 999, backgroundColor: Colors.border + '66', overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 999 },
  accountHealthHint: { color: Colors.textMuted, fontSize: 12, marginTop: 8, lineHeight: 17 },
  accountDetailsCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
  },
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
  logoutModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 14,
    paddingBottom: 18,
    backgroundColor: 'rgba(7, 15, 31, 0.56)',
  },
  logoutModalSheet: {
    borderRadius: 28,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    shadowColor: '#061224',
    shadowOpacity: 0.24,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 20,
  },
  logoutModalHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#D8E0EC',
    marginBottom: 14,
  },
  logoutModalHero: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: 20,
    padding: 14,
    backgroundColor: '#FFF7F6',
    borderWidth: 1,
    borderColor: '#FAD4D0',
  },
  logoutModalIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#FEE4E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutModalTitle: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  logoutModalCopy: {
    color: Colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
  },
  logoutModalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  logoutModalCancelBtn: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF3FA',
  },
  logoutModalCancelText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  logoutModalConfirmBtn: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#B42318',
  },
  logoutModalConfirmText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
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
