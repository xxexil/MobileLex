import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, RoleColors } from '@/constants/theme';
import { formatPhp } from '@/constants/currency';
import { useAuth } from '@/context/auth';
import { adminApi } from '@/services/api';
import { createReverbEcho, isReverbConfigured } from '@/services/realtime';

export default function AdminHomeScreen() {
  const router = useRouter();
  const { user, token, logout } = useAuth();
  const [dashboard, setDashboard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [logoutConfirmVisible, setLogoutConfirmVisible] = useState(false);
  const echoRef = useRef<any | null>(null);

  const displayName = user?.name?.trim() || 'Admin';
  const avatarLetter = (displayName.charAt(0) || 'A').toUpperCase();
  const isPreview = user?.id === 0;

  const previewDashboard = useMemo(
    () => ({
      stats: {
        users: 164,
        reports: 11,
        flags: 5,
        uptime: 99,
      },
      summary: {
        payments_today: 18250,
        pending_consultations: 7,
        pending_firm_applications: 3,
      },
    }),
    []
  );

  const stats = useMemo(() => {
    const source = dashboard?.stats ?? {};
    const totalClients = source.total_clients ?? source.clients ?? source.users ?? 0;
    const totalLawyers = source.total_lawyers ?? source.lawyers ?? 0;
    const totalFirms = source.total_firms ?? source.law_firms ?? source.firms ?? 0;
    const totalConsults = source.total_consultations ?? source.consultations ?? dashboard?.summary?.total_consultations ?? 0;
    return [
      { label: 'Clients', value: String(totalClients), icon: 'people-outline' as const, color: '#2563EB' },
      { label: 'Lawyers', value: String(totalLawyers), icon: 'briefcase-outline' as const, color: '#7C3AED' },
      { label: 'Law Firms', value: String(totalFirms), icon: 'business-outline' as const, color: '#059669' },
      { label: 'Total Consultations', value: String(totalConsults), icon: 'calendar-outline' as const, color: '#EA580C' },
    ];
  }, [dashboard]);
  const statusStats = useMemo(() => {
    const source = dashboard?.stats ?? {};
    return [
      { label: 'Pending', value: source.pending_consultations ?? dashboard?.summary?.pending_consultations ?? 0, color: '#F59E0B' },
      { label: 'Upcoming', value: source.upcoming_consultations ?? 0, color: '#2563EB' },
      { label: 'Completed', value: source.completed_consultations ?? 0, color: '#16A34A' },
      { label: 'Cancelled', value: source.cancelled_consultations ?? 0, color: '#DC2626' },
    ];
  }, [dashboard]);
  const extraStats = useMemo(() => {
    const source = dashboard?.stats ?? {};
    return [
      { label: 'Unverified Firms', value: source.unverified_firms ?? dashboard?.summary?.pending_firm_applications ?? 0, icon: 'shield-outline' as const },
      { label: 'Certified Lawyers', value: source.certified_lawyers ?? 0, icon: 'ribbon-outline' as const },
      { label: 'Payments Today', value: formatPhp(Number(dashboard?.summary?.payments_today ?? 0)), icon: 'cash-outline' as const },
    ];
  }, [dashboard]);
  const moderationStats = useMemo(() => {
    const source = dashboard?.stats ?? {};
    return [
      { label: 'Flags', value: Number(source.flags ?? source.reports ?? 0), color: '#DC2626' },
      { label: 'Pending', value: Number(source.pending_consultations ?? dashboard?.summary?.pending_consultations ?? 0), color: '#F59E0B' },
      { label: 'Firms', value: Number(source.unverified_firms ?? dashboard?.summary?.pending_firm_applications ?? 0), color: '#2563EB' },
    ];
  }, [dashboard]);
  const recentConsultations = useMemo(() => {
    const payload = dashboard?.recent_consultations ?? dashboard?.recentConsultations ?? [];
    return Array.isArray(payload) ? payload.slice(0, 4) : [];
  }, [dashboard]);
  const recentUsers = useMemo(() => {
    const payload = dashboard?.recent_users ?? dashboard?.recentUsers ?? [];
    return Array.isArray(payload) ? payload.slice(0, 4) : [];
  }, [dashboard]);

  const load = useCallback(async () => {
    if (isPreview) {
      setDashboard(previewDashboard);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const { data } = await adminApi.dashboard();
      setDashboard(data);
    } catch {
      setDashboard(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isPreview, previewDashboard]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (isPreview || !token || !isReverbConfigured()) return;

    const echo = createReverbEcho(token);
    const metricsChannelName = 'admin.metrics';
    const usersChannelName = 'admin.users';
    const metricsChannel = echo.private(metricsChannelName);
    const usersChannel = echo.private(usersChannelName);
    echoRef.current = echo;

    const onChanged = () => {
      load();
    };

    metricsChannel.listen('.MetricsChanged', onChanged);
    metricsChannel.listen('.metrics.changed', onChanged);
    usersChannel.listen('.UserChanged', onChanged);
    usersChannel.listen('.user.changed', onChanged);

    return () => {
      try {
        metricsChannel.stopListening('.MetricsChanged');
        metricsChannel.stopListening('.metrics.changed');
        usersChannel.stopListening('.UserChanged');
        usersChannel.stopListening('.user.changed');
        echo.leave(metricsChannelName);
        echo.leave(`private-${metricsChannelName}`);
        echo.leave(usersChannelName);
        echo.leave(`private-${usersChannelName}`);
        echo.disconnect();
      } catch {
        // ignore realtime cleanup errors
      }
      echoRef.current = null;
    };
  }, [isPreview, load, token]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
  }

  async function handleLogout() {
    setLogoutConfirmVisible(false);
    try {
      await logout();
      router.replace('/(auth)/login');
    } catch {
      router.replace('/(auth)/login');
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={RoleColors.admin.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[RoleColors.admin.accent]} />}
      >
      <View style={styles.headerRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{avatarLetter}</Text>
        </View>
        <View>
          <Text style={styles.welcomeText}>Welcome back,</Text>
          <Text style={styles.username}>{displayName}</Text>
        </View>
        <TouchableOpacity style={styles.bellBtn} onPress={() => router.push('/notifications')}>
          <Ionicons name="notifications-outline" size={20} color={RoleColors.admin.accent} />
        </TouchableOpacity>
      </View>

      <View style={styles.hero}>
        <View style={styles.heroBadge}>
          <Text style={styles.heroBadgeText}>ADMIN PANEL</Text>
        </View>
        <Text style={styles.heroTitle}>Control Center</Text>
        <Text style={styles.heroDesc}>Manage platform operations, monitor activity, and review system status.</Text>
        {isPreview && (
          <View style={styles.previewChip}>
            <Ionicons name="flask-outline" size={14} color={RoleColors.admin.shell} />
            <Text style={styles.previewText}>Preview Mode</Text>
          </View>
        )}
      </View>

      {isPreview && (
        <View style={styles.previewBanner}>
          <Ionicons name="information-circle-outline" size={16} color={RoleColors.admin.shell} />
          <Text style={styles.previewBannerText}>Preview Data: values shown here are mock data for local testing.</Text>
        </View>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statsScroller} contentContainerStyle={styles.grid}>
        {stats.map((item) => (
          <View key={item.label} style={styles.statCard}>
            <View style={[styles.statIconWrap, { backgroundColor: `${item.color}18` }]}>
              <Ionicons name={item.icon} size={22} color={item.color} />
            </View>
            <View style={styles.statTextWrap}>
              <Text style={styles.statValue}>{item.value}</Text>
              <Text style={styles.statLabel}>{item.label}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={styles.statusCard}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>Consultation Status</Text>
          <Ionicons name="analytics-outline" size={18} color={RoleColors.admin.accent} />
        </View>
        <View style={styles.statusGrid}>
          {statusStats.map((item) => (
            <View key={item.label} style={styles.statusItem}>
              <View style={[styles.statusDot, { backgroundColor: item.color }]} />
              <Text style={styles.statusValue}>{item.value}</Text>
              <Text style={styles.statusLabel}>{item.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.extraScroller} contentContainerStyle={styles.extraRow}>
        {extraStats.map((item) => (
          <View key={item.label} style={styles.extraCard}>
            <Ionicons name={item.icon} size={18} color={RoleColors.admin.accent} />
            <Text style={styles.extraValue} numberOfLines={1}>{item.value}</Text>
            <Text style={styles.extraLabel} numberOfLines={2}>{item.label}</Text>
          </View>
        ))}
      </ScrollView>

      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.quickRow}>
        <QuickButton icon="people-outline" label="Users" onPress={() => router.push('/(admin)/users' as any)} />
        <QuickButton icon="settings-outline" label="System" onPress={() => router.push('/(admin)/system' as any)} />
        <QuickButton icon="refresh-outline" label="Refresh" onPress={onRefresh} />
      </View>

      <View style={styles.moderationCard}>
        <View style={styles.moderationHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.moderationEyebrow}>MODERATION</Text>
            <Text style={styles.moderationTitle}>Review queue</Text>
            <Text style={styles.moderationDesc}>
              Keep the platform healthy by checking flags, pending items, and system issues first.
            </Text>
          </View>
          <View style={styles.moderationBadge}>
            <Ionicons name="shield-checkmark-outline" size={16} color="#fff" />
          </View>
        </View>
        <View style={styles.moderationStatsRow}>
          {moderationStats.map((item) => (
            <View key={item.label} style={styles.moderationStat}>
              <View style={[styles.moderationDot, { backgroundColor: item.color }]} />
              <Text style={styles.moderationValue}>{item.value}</Text>
              <Text style={styles.moderationLabel}>{item.label}</Text>
            </View>
          ))}
        </View>
        <View style={styles.moderationActions}>
          <TouchableOpacity style={styles.moderationPrimaryBtn} onPress={() => router.push('/(admin)/users' as any)}>
            <Text style={styles.moderationPrimaryText}>Open users</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.moderationGhostBtn} onPress={() => router.push('/(admin)/system' as any)}>
            <Text style={styles.moderationGhostText}>System tools</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.twoPanelStack}>
        <AdminListCard
          title="Recent Consultations"
          icon="calendar-outline"
          empty="No recent consultations."
          items={recentConsultations.map((item: any) => ({
            id: String(item?.id ?? item?.code ?? Math.random()),
            title: item?.code || `${item?.client?.name ?? 'Client'} / ${item?.lawyer?.name ?? 'Lawyer'}`,
            meta: String(item?.status ?? 'Consultation').toUpperCase(),
          }))}
        />
        <AdminListCard
          title="Recent Users"
          icon="person-add-outline"
          empty="No recent users."
          items={recentUsers.map((item: any) => ({
            id: String(item?.id ?? item?.email ?? Math.random()),
            title: item?.name || item?.email || 'User',
            meta: String(item?.role ?? 'user').replace('_', ' ').toUpperCase(),
          }))}
        />
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>Admin Notes</Text>
        <Text style={styles.infoLine}>Pending consultations: {dashboard?.summary?.pending_consultations ?? 0}</Text>
        <Text style={styles.infoLine}>Pending firm applications: {dashboard?.summary?.pending_firm_applications ?? 0}</Text>
        <Text style={styles.infoLine}>Payments today: {formatPhp(Number(dashboard?.summary?.payments_today ?? 0))}</Text>
        <View style={styles.infoActions}>
          <TouchableOpacity style={styles.ghostBtn} onPress={() => router.push('/privacy-policy')}>
            <Text style={styles.ghostBtnText}>Privacy Policy</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ghostBtn} onPress={() => router.push('/terms')}>
            <Text style={styles.ghostBtnText}>Terms</Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity
        style={styles.logoutBtn}
        onPress={() => setLogoutConfirmVisible(true)}
      >
        <Ionicons name="log-out-outline" size={18} color="#B42318" />
        <Text style={styles.logoutText}>Log out</Text>
      </TouchableOpacity>
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
                <Ionicons name="shield-outline" size={23} color="#B42318" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.logoutModalTitle}>Leave admin console?</Text>
                <Text style={styles.logoutModalCopy}>
                  You will be signed out of the admin dashboard and returned to the shared login screen.
                </Text>
              </View>
            </View>

            <View style={styles.logoutModalActions}>
              <TouchableOpacity
                style={styles.logoutModalCancelBtn}
                onPress={() => setLogoutConfirmVisible(false)}
                activeOpacity={0.85}
              >
                <Text style={styles.logoutModalCancelText}>Stay here</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.logoutModalConfirmBtn}
                onPress={handleLogout}
                activeOpacity={0.85}
              >
                <Text style={styles.logoutModalConfirmText}>Log out</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function QuickButton({ icon, label, onPress }: { icon: any; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.quickBtn} onPress={onPress}>
      <Ionicons name={icon} size={18} color={RoleColors.admin.accent} />
      <Text style={styles.quickLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function AdminListCard({
  title,
  icon,
  empty,
  items,
}: {
  title: string;
  icon: any;
  empty: string;
  items: Array<{ id: string; title: string; meta: string }>;
}) {
  return (
    <View style={styles.listCard}>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Ionicons name={icon} size={18} color={RoleColors.admin.accent} />
      </View>
      {items.length === 0 ? (
        <View style={styles.listEmptyRow}>
          <Ionicons name="information-circle-outline" size={18} color={Colors.textLight} />
          <Text style={styles.listEmptyText}>{empty}</Text>
        </View>
      ) : (
        items.map((item) => (
          <View key={item.id} style={styles.listRow}>
            <View style={styles.listBullet} />
            <View style={{ flex: 1 }}>
              <Text style={styles.listTitle} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.listMeta} numberOfLines={1}>{item.meta}</Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: RoleColors.admin.background },
  container: { flex: 1, backgroundColor: RoleColors.admin.background },
  content: { padding: 16, paddingBottom: 124 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: RoleColors.admin.accent,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 20 },
  welcomeText: { color: Colors.textMuted, fontSize: 14 },
  username: { color: Colors.text, fontWeight: '800', fontSize: 24 },
  bellBtn: {
    marginLeft: 'auto',
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: {
    backgroundColor: RoleColors.admin.shell,
    borderRadius: 24,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: RoleColors.admin.shell,
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 10,
  },
  heroBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  heroTitle: { color: '#fff', fontSize: 24, fontWeight: '800' },
  heroDesc: { color: '#D7E1F4', marginTop: 6, fontSize: 13, lineHeight: 18 },
  previewChip: {
    marginTop: 10,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.secondary,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
  },
  previewText: { color: RoleColors.admin.shell, fontSize: 11, fontWeight: '800' },
  previewBanner: {
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF5DC',
    borderWidth: 1,
    borderColor: '#F1D28C',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  previewBannerText: {
    flex: 1,
    color: RoleColors.admin.shell,
    fontSize: 12,
    fontWeight: '600',
  },
  statsScroller: { flexGrow: 0, marginHorizontal: -16, marginBottom: 12 },
  grid: { paddingHorizontal: 16, gap: 12, paddingBottom: 3 },
  statCard: {
    width: 260,
    minHeight: 108,
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E8EDF5',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#102042',
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  statIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  statTextWrap: { flex: 1 },
  statValue: { fontSize: 24, fontWeight: '900', color: RoleColors.admin.shell },
  statLabel: { fontSize: 13, color: Colors.textMuted, marginTop: 3, fontWeight: '800', lineHeight: 17 },
  statusCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E8EDF5',
    padding: 16,
    marginBottom: 12,
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  cardTitle: { color: RoleColors.admin.shell, fontWeight: '900', fontSize: 16 },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statusItem: {
    width: '48%',
    borderRadius: 14,
    backgroundColor: '#F8FAFD',
    borderWidth: 1,
    borderColor: '#EEF2F7',
    padding: 12,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 8 },
  statusValue: { color: RoleColors.admin.shell, fontSize: 22, fontWeight: '900' },
  statusLabel: { color: Colors.textMuted, fontSize: 12, fontWeight: '800', marginTop: 2 },
  extraScroller: { flexGrow: 0, marginHorizontal: -16, marginBottom: 2 },
  extraRow: { paddingHorizontal: 16, gap: 10 },
  extraCard: {
    width: 150,
    minHeight: 96,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E8EDF5',
    padding: 12,
  },
  extraValue: { color: RoleColors.admin.shell, fontSize: 17, fontWeight: '900', marginTop: 8 },
  extraLabel: { color: Colors.textMuted, fontSize: 12, fontWeight: '800', marginTop: 3, lineHeight: 16 },
  sectionTitle: { marginTop: 14, marginBottom: 8, fontSize: 18, fontWeight: '800', color: Colors.text },
  quickRow: { flexDirection: 'row', gap: 10 },
  quickBtn: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8EDF5',
    paddingVertical: 12,
    alignItems: 'center',
  },
  quickLabel: { marginTop: 5, color: RoleColors.admin.accent, fontSize: 12, fontWeight: '700' },
  moderationCard: {
    marginTop: 14,
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E8EDF5',
    padding: 16,
    shadowColor: RoleColors.admin.shell,
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  moderationHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  moderationEyebrow: {
    color: RoleColors.admin.accent,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  moderationTitle: { color: Colors.text, fontWeight: '900', fontSize: 18, marginTop: 2 },
  moderationDesc: { color: Colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  moderationBadge: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: RoleColors.admin.accent,
  },
  moderationStatsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  moderationStat: { flex: 1, alignItems: 'center' },
  moderationDot: { width: 10, height: 10, borderRadius: 5, marginBottom: 8 },
  moderationValue: { color: Colors.text, fontSize: 18, fontWeight: '900' },
  moderationLabel: { color: Colors.textMuted, fontSize: 11, fontWeight: '700', marginTop: 2 },
  moderationActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  moderationPrimaryBtn: {
    flex: 1,
    backgroundColor: RoleColors.admin.shell,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
  },
  moderationPrimaryText: { color: '#fff', fontWeight: '900', fontSize: 13 },
  moderationGhostBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D9E2F2',
    paddingVertical: 11,
    alignItems: 'center',
    backgroundColor: '#F8FAFD',
  },
  moderationGhostText: { color: RoleColors.admin.shell, fontWeight: '900', fontSize: 13 },
  twoPanelStack: { gap: 12, marginTop: 12 },
  listCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E8EDF5',
    padding: 16,
  },
  listEmptyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  listEmptyText: { color: Colors.textMuted, fontSize: 13, fontWeight: '700' },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    backgroundColor: '#F8FAFD',
    padding: 11,
    marginBottom: 8,
  },
  listBullet: { width: 9, height: 9, borderRadius: 5, backgroundColor: RoleColors.admin.accent },
  listTitle: { color: RoleColors.admin.shell, fontWeight: '900', fontSize: 14 },
  listMeta: { color: Colors.textMuted, fontSize: 12, fontWeight: '700', marginTop: 2 },
  infoCard: {
    marginTop: 12,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8EDF5',
    padding: 14,
  },
  infoTitle: { color: Colors.text, fontWeight: '800', fontSize: 14, marginBottom: 6 },
  infoLine: { color: Colors.textMuted, fontSize: 12, marginTop: 4 },
  infoActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  ghostBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  ghostBtnText: { color: RoleColors.admin.accent, fontSize: 12, fontWeight: '700' },
  logoutBtn: {
    marginTop: 14,
    backgroundColor: '#FFF8F8',
    borderWidth: 1,
    borderColor: '#F4C7C3',
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  logoutText: { color: '#B42318', fontWeight: '900', fontSize: 14 },
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
