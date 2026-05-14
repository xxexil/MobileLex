import { useCallback, useEffect, useMemo, useState } from 'react';
import type React from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Colors, RoleColors } from '@/constants/theme';
import { formatPhp } from '@/constants/currency';
import { useAuth } from '@/context/auth';
import { lawFirmApi } from '@/services/api';
import ConfirmActionModal from '@/components/ConfirmActionModal';
import { resolveStorageUrl } from '@/services/endpoints';

const PRACTICE_AREAS = [
  'Corporate Law',
  'Tax Law',
  'Family Law',
  'Criminal Defense',
  'Immigration Law',
  'Real Estate',
  'Personal Injury',
  'Employment Law',
  'Intellectual Property',
  'Estate Planning',
];

function pickText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text.length > 0) return text;
  }
  return '';
}

function initials(name?: string | null) {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return String(name ?? 'LF').slice(0, 2).toUpperCase();
}

function asList(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function hasUploaded(profile: any, key: string) {
  return !!pickText(profile?.[key], profile?.documents?.[key], profile?.firm?.[key]);
}

export default function LawFirmProfile() {
  const router = useRouter();
  const navigation = useNavigation();
  const { logout, user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [dashboard, setDashboard] = useState<any>(null);
  const [earnings, setEarnings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [logoutConfirmVisible, setLogoutConfirmVisible] = useState(false);

  const load = useCallback(async () => {
    try {
      const [profileRes, dashboardRes, earningsRes] = await Promise.allSettled([
        lawFirmApi.profile(),
        lawFirmApi.dashboard(),
        lawFirmApi.earnings(),
      ]);

      setProfile(profileRes.status === 'fulfilled' ? profileRes.value?.data ?? {} : {});
      setDashboard(dashboardRes.status === 'fulfilled' ? dashboardRes.value?.data ?? {} : {});
      setEarnings(earningsRes.status === 'fulfilled' ? earningsRes.value?.data ?? {} : {});
    } catch {
      setProfile({});
      setDashboard({});
      setEarnings({});
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        router.replace('/(lawfirm)' as any);
        return true;
      });

      return () => subscription.remove();
    }, [router])
  );

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      const actionType = String(event?.data?.action?.type ?? '');
      if (actionType === 'JUMP_TO') return;

      event.preventDefault();
      router.replace('/(lawfirm)' as any);
    });

    return unsubscribe;
  }, [navigation, router]);

  const firmName = pickText(
    profile?.firm_name,
    profile?.firm?.name,
    dashboard?.firm_name,
    dashboard?.firm?.name,
    profile?.name,
    user?.name,
    'Law Firm',
  );
  const tagline = pickText(profile?.tagline, dashboard?.tagline, 'Excellence in Corporate and Commercial Law');
  const description = pickText(
    profile?.description,
    profile?.about,
    dashboard?.description,
    'A premier law firm specializing in corporate transactions, mergers and acquisitions, and commercial litigation with years of experience serving clients.',
  );
  const avatarSource = pickText(profile?.avatar_url, profile?.firm?.avatar_url, dashboard?.avatar_url, user?.avatar_url, (user as any)?.avatar);
  const avatarUri = avatarSource && !avatarFailed ? resolveStorageUrl(avatarSource) : '';
  const stats = dashboard?.stats ?? dashboard ?? {};
  const lawyersCount = Number(stats?.team_lawyers ?? stats?.team_count ?? 0);
  const rating = Number(profile?.rating ?? dashboard?.rating ?? 4.8);
  const reviews = Number(profile?.reviews_count ?? dashboard?.reviews_count ?? 0);
  const practiceAreas = useMemo(() => {
    const selected = asList(profile?.specialties ?? profile?.practice_areas ?? dashboard?.specialties);
    return selected.length ? selected : PRACTICE_AREAS.slice(0, 2);
  }, [dashboard?.specialties, profile?.practice_areas, profile?.specialties]);
  const memberSince = pickText(profile?.founded_year, profile?.established_year, '2004');
  const location = pickText(profile?.city, profile?.address, profile?.location, 'Makati, Metro Manila');

  const handleLogout = useCallback(() => {
    setLogoutConfirmVisible(true);
  }, []);

  const confirmLogout = useCallback(() => {
    setLogoutConfirmVisible(false);
    logout();
  }, [logout]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={RoleColors.lawFirm.shell} /></View>;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleRow}>
          <Ionicons name="business" size={18} color="#fff" />
          <Text style={styles.screenTitle}>Firm Profile</Text>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroCircle} />
          <View style={styles.heroTop}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatar} onError={() => setAvatarFailed(true)} />
            ) : (
              <View style={styles.avatar}><Text style={styles.avatarText}>{initials(firmName)}</Text></View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.firmName}>{firmName}</Text>
              <Text style={styles.tagline}>{tagline}</Text>
              <View style={styles.heroBadges}>
                <Badge icon="shield-checkmark" text="Verified" gold />
                <Badge icon="people" text={`${lawyersCount || 1} lawyers`} />
                <Badge icon="calendar" text={`Est. ${memberSince}`} />
                <Badge icon="location" text={location} />
              </View>
            </View>
          </View>
          <View style={styles.heroStats}>
            <HeroStat value={String(lawyersCount || 1)} label="Lawyers" />
            <HeroStat value={rating.toFixed(1)} label="Rating" />
            <HeroStat value={String(reviews || 94)} label="Reviews" />
            <HeroStat value={String(practiceAreas.length)} label="Practice Areas" />
          </View>
        </View>

        <View style={styles.editCard}>
          <View style={styles.editIcon}>
            <Ionicons name="create-outline" size={16} color={RoleColors.lawFirm.shell} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.editTitle}>Edit Firm Information</Text>
            <Text style={styles.editSub}>Update your firm's public-facing profile</Text>
          </View>
          <TouchableOpacity style={styles.editBtn} onPress={() => router.push('/(lawfirm)/settings' as any)}>
            <Text style={styles.editBtnText}>Open</Text>
          </TouchableOpacity>
        </View>

        <InfoCard title="Contact Info" icon="mail-outline">
          <InfoRow icon="location" text={pickText(profile?.address, profile?.location, 'No address provided')} />
          <InfoRow icon="call" text={pickText(profile?.phone, 'No phone provided')} />
          <InfoRow icon="globe-outline" text={pickText(profile?.website, 'No website provided')} />
        </InfoCard>

        <InfoCard title="Registration Documents" icon="folder-outline">
          <DocumentStatus label="DTI/SEC registration" uploaded={hasUploaded(profile, 'dti_sec_registration')} />
          <DocumentStatus label="Business permit" uploaded={hasUploaded(profile, 'business_permit')} />
          <DocumentStatus label="Valid ID" uploaded={hasUploaded(profile, 'valid_id')} />
          <DocumentStatus label="IBP ID" uploaded={hasUploaded(profile, 'firm_ibp_id') || hasUploaded(profile, 'ibp_id')} />
        </InfoCard>

        <InfoCard title="About" icon="document-text-outline">
          <Text style={styles.aboutText}>{description}</Text>
        </InfoCard>

        <InfoCard title="Practice Areas" icon="briefcase-outline">
          <View style={styles.practiceWrap}>
            {practiceAreas.map((area) => (
              <View key={area} style={styles.practiceChip}>
                <Text style={styles.practiceText}>{area}</Text>
              </View>
            ))}
          </View>
        </InfoCard>

        <InfoCard title="Admin Account" icon="person-outline">
          <InfoRow icon="person" text={pickText(profile?.admin_name, user?.name, firmName)} />
          <InfoRow icon="mail" text={pickText(profile?.email, user?.email, 'No email provided')} />
          <InfoRow icon="cash" text={`Total earned ${formatPhp(Number(earnings?.total_earned ?? earnings?.firm_cut_total ?? 0))}`} />
        </InfoCard>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={17} color="#B42318" />
          <Text style={styles.logoutText}>Log out</Text>
        </TouchableOpacity>
      </ScrollView>

      <ConfirmActionModal
        visible={logoutConfirmVisible}
        title="End this session?"
        message="You will be signed out of this law firm account and returned to the login screen."
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

function Badge({ icon, text, gold }: { icon: keyof typeof Ionicons.glyphMap; text: string; gold?: boolean }) {
  return (
    <View style={[styles.badge, gold && styles.badgeGold]}>
      <Ionicons name={icon} size={10} color={gold ? '#7A4D00' : '#fff'} />
      <Text style={[styles.badgeText, gold && styles.badgeGoldText]}>{text}</Text>
    </View>
  );
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.heroStat}>
      <Text style={styles.heroStatValue}>{value}</Text>
      <Text style={styles.heroStatLabel}>{label}</Text>
    </View>
  );
}

function InfoCard({ title, icon, children }: { title: string; icon: keyof typeof Ionicons.glyphMap; children: React.ReactNode }) {
  return (
    <View style={styles.infoCard}>
      <View style={styles.infoTitleRow}>
        <Ionicons name={icon} size={14} color="#B7791F" />
        <Text style={styles.infoTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function InfoRow({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={13} color="#B7791F" />
      <Text style={styles.infoText}>{text}</Text>
    </View>
  );
}

function DocumentStatus({ label, uploaded }: { label: string; uploaded: boolean }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={uploaded ? 'checkmark-circle' : 'close-circle-outline'} size={13} color={uploaded ? '#15803D' : '#B7791F'} />
      <Text style={styles.infoText}>{uploaded ? label : `No ${label} uploaded yet.`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#EEF2F6' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF2F6' },
  content: { padding: 12, paddingBottom: 112, gap: 10 },
  titleRow: {
    backgroundColor: RoleColors.lawFirm.shell,
    minHeight: 52,
    borderRadius: 0,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: -12,
    marginTop: -12,
  },
  screenTitle: { color: '#fff', fontSize: 18, fontWeight: '900' },
  hero: { backgroundColor: '#194F32', borderRadius: 8, padding: 16, overflow: 'hidden' },
  heroCircle: { position: 'absolute', right: -34, top: -28, width: 118, height: 118, borderRadius: 59, backgroundColor: 'rgba(255,255,255,0.06)' },
  heroTop: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  avatar: { width: 52, height: 52, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  firmName: { color: '#fff', fontSize: 18, fontWeight: '900' },
  tagline: { color: '#DDF5E7', fontSize: 11, fontWeight: '700', marginTop: 2 },
  heroBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: 'rgba(255,255,255,0.13)' },
  badgeGold: { backgroundColor: '#F6C453' },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '900' },
  badgeGoldText: { color: '#7A4D00' },
  heroStats: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.16)', marginTop: 16, paddingTop: 12 },
  heroStat: { flex: 1, alignItems: 'center', borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.14)' },
  heroStatValue: { color: '#fff', fontSize: 16, fontWeight: '900' },
  heroStatLabel: { color: '#DDF5E7', fontSize: 9, fontWeight: '700', marginTop: 2, textAlign: 'center' },
  editCard: { backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#DDE5EF', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  editIcon: { width: 30, height: 30, borderRadius: 8, backgroundColor: '#E9F7EF', alignItems: 'center', justifyContent: 'center' },
  editTitle: { color: RoleColors.lawFirm.shell, fontSize: 14, fontWeight: '900' },
  editSub: { color: '#60748A', fontSize: 11, marginTop: 1 },
  editBtn: { backgroundColor: RoleColors.lawFirm.shell, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  editBtnText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  infoCard: { backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#DDE5EF', padding: 12 },
  infoTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  infoTitle: { color: '#B7791F', fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 4 },
  infoText: { flex: 1, color: '#334155', fontSize: 12, lineHeight: 17, fontWeight: '600' },
  aboutText: { color: '#334155', fontSize: 12, lineHeight: 18 },
  practiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  practiceChip: { borderWidth: 1, borderColor: '#7BB58E', backgroundColor: '#EDF8F0', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  practiceText: { color: '#14532D', fontSize: 11, fontWeight: '800' },
  logoutBtn: { marginTop: 4, backgroundColor: '#FFF8F8', borderWidth: 1, borderColor: '#F4C7C3', borderRadius: 10, padding: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  logoutText: { color: '#B42318', fontWeight: '900' },
});
