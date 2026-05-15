import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, RoleColors } from '@/constants/theme';
import { formatPhp } from '@/constants/currency';
import { useAuth } from '@/context/auth';
import { adminApi } from '@/services/api';
import { createReverbEcho, isReverbConfigured } from '@/services/realtime';

const WEB_ADMIN_NAVY = '#1E2D4D';
const WEB_ADMIN_NAVY_DARK = '#162240';
const WEB_ADMIN_GOLD = '#B5860D';
const WEB_ADMIN_BG = '#F0F2F5';

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
  const todayLabel = useMemo(
    () => new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
    []
  );

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
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={WEB_ADMIN_GOLD} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[WEB_ADMIN_GOLD]} />}
      >
      <View style={styles.webAdminShell}>
        <View style={styles.webBrandRow}>
          <View style={styles.webBrandIcon}>
            <Ionicons name="shield" size={24} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.webBrandTitle}>Lex<Text style={styles.webBrandTitleAccent}>Connect</Text></Text>
            <Text style={styles.webBrandSub}>Smart Legal Services Platform</Text>
          </View>
          <View style={styles.webAdminBadge}>
            <Ionicons name="shield" size={13} color="#FFFFFF" />
            <Text style={styles.webAdminBadgeText}>Admin</Text>
          </View>
        </View>

        <View style={styles.webAdminCard}>
          <View style={styles.webAdminAvatar}>
            <Text style={styles.webAdminAvatarText}>{avatarLetter}</Text>
          </View>
          <View>
            <Text style={styles.webAdminName}>{displayName}</Text>
            <Text style={styles.webAdminRole}>Administrator Console</Text>
          </View>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.webNavScroll} contentContainerStyle={styles.webNavRow}>
        <AdminNavChip active icon="pie-chart" label="Dashboard" onPress={() => router.push('/(admin)' as any)} />
        <AdminNavChip icon="people" label="All Users" onPress={() => router.push('/(admin)/all-users' as any)} />
        <AdminNavChip icon="briefcase" label="Lawyers" onPress={() => router.push('/(admin)/lawyers' as any)} />
        <AdminNavChip icon="business" label="Law Firms" onPress={() => router.push('/(admin)/law-firms' as any)} />
        <AdminNavChip icon="calendar" label="Consultations" onPress={() => router.push('/(admin)/consultations' as any)} />
        <AdminNavChip icon="shield-checkmark" label="Fraud Review" onPress={() => router.push('/(admin)/fraud-review' as any)} />
      </ScrollView>

      <View style={styles.webPageHeader}>
        <View>
          <Text style={styles.webPageTitle}>Admin Dashboard</Text>
          <Text style={styles.webPageDate}>{todayLabel}</Text>
        </View>
        {isPreview ? (
          <View style={styles.webPreviewPill}>
            <Ionicons name="flask-outline" size={13} color={WEB_ADMIN_GOLD} />
            <Text style={styles.webPreviewText}>Preview</Text>
          </View>
        ) : null}
      </View>

      {isPreview && (
        <View style={styles.previewBanner}>
          <Ionicons name="information-circle-outline" size={16} color={WEB_ADMIN_NAVY} />
          <Text style={styles.previewBannerText}>Preview Data: values shown here are mock data for local testing.</Text>
        </View>
      )}

      <View style={styles.webStatsGrid}>
        {stats.map((item) => (
          <View key={item.label} style={styles.webStatCard}>
            <View style={[styles.webStatIcon, { backgroundColor: `${item.color}1D` }]}>
              <Ionicons name={item.icon} size={23} color={item.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.webStatValue}>{item.value}</Text>
              <Text style={styles.webStatLabel}>{item.label}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.webStatusPanel}>
          {statusStats.map((item) => (
            <View key={item.label} style={styles.webStatusItem}>
              <Text style={[styles.webStatusValue, { color: item.color }]}>{item.value}</Text>
              <Text style={styles.webStatusLabel}>{item.label}</Text>
            </View>
          ))}
      </View>

      <View style={styles.webMiniGrid}>
        {extraStats.map((item) => (
          <View key={item.label} style={styles.webMiniCard}>
            <View style={styles.webMiniIcon}>
              <Ionicons name={item.icon} size={19} color={WEB_ADMIN_NAVY} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.webMiniValue} numberOfLines={1}>{item.value}</Text>
              <Text style={styles.webMiniLabel} numberOfLines={2}>{item.label}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.twoPanelStack}>
        <WebConsultationCard
          title="Recent Consultations"
          onViewAll={() => router.push('/(admin)/consultations' as any)}
          items={recentConsultations}
        />
        <WebUsersCard
          title="Recent Users"
          onViewAll={() => router.push('/(admin)/all-users' as any)}
          items={recentUsers}
        />
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
    </SafeAreaView>
  );
}

function AdminNavChip({ active, icon, label, onPress }: { active?: boolean; icon: any; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.webNavChip, active && styles.webNavChipActive]} onPress={onPress} activeOpacity={0.85}>
      <Ionicons name={icon} size={15} color={active ? '#FFFFFF' : '#C2C8D6'} />
      <Text style={[styles.webNavChipText, active && styles.webNavChipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function consultationStatusTone(statusRaw: unknown) {
  const status = String(statusRaw ?? '').toLowerCase();
  if (status.includes('completed')) return { bg: '#D1FAE5', text: '#047857', label: 'Completed' };
  if (status.includes('cancel')) return { bg: '#FEE2E2', text: '#B91C1C', label: 'Cancelled' };
  if (status.includes('upcoming')) return { bg: '#DBEAFE', text: '#1D4ED8', label: 'Upcoming' };
  if (status.includes('pending')) return { bg: '#FEF3C7', text: '#B45309', label: 'Pending' };
  return { bg: '#FFF5DC', text: WEB_ADMIN_GOLD, label: String(statusRaw || 'Status') };
}

function WebPanelHeader({ title, icon, onViewAll }: { title: string; icon: any; onViewAll: () => void }) {
  return (
    <View style={styles.webPanelHeader}>
      <View style={styles.webPanelTitleRow}>
        <Ionicons name={icon} size={18} color={WEB_ADMIN_GOLD} />
        <Text style={styles.webPanelTitle}>{title}</Text>
      </View>
      <TouchableOpacity onPress={onViewAll}>
        <Text style={styles.webPanelAction}>View all {'->'}</Text>
      </TouchableOpacity>
    </View>
  );
}

function WebConsultationCard({ title, items, onViewAll }: { title: string; items: any[]; onViewAll: () => void }) {
  return (
    <View style={styles.webPanelCard}>
      <WebPanelHeader title={title} icon="calendar" onViewAll={onViewAll} />
      {items.length === 0 ? (
        <Text style={styles.webEmptyText}>No recent consultations.</Text>
      ) : (
        items.map((item: any, index: number) => {
          const tone = consultationStatusTone(item?.status);
          const code = item?.code ?? item?.consultation_code ?? item?.consult_code ?? `LC-${String(item?.id ?? index).padStart(6, '0')}`;
          const client = item?.client?.name ?? item?.client_name ?? 'Client';
          const lawyer = item?.lawyer?.name ?? item?.lawyer_name ?? 'Lawyer';
          return (
            <View key={String(item?.id ?? code ?? index)} style={styles.webConsultRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.webConsultCode} numberOfLines={1}>{code}</Text>
                <Text style={styles.webConsultClient} numberOfLines={1}>{client}</Text>
                <Text style={styles.webConsultLawyer} numberOfLines={1}>{lawyer}</Text>
              </View>
              <View style={[styles.webStatusBadge, { backgroundColor: tone.bg }]}>
                <Text style={[styles.webStatusBadgeText, { color: tone.text }]}>{tone.label}</Text>
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

function WebUsersCard({ title, items, onViewAll }: { title: string; items: any[]; onViewAll: () => void }) {
  return (
    <View style={styles.webPanelCard}>
      <WebPanelHeader title={title} icon="person-add" onViewAll={onViewAll} />
      {items.length === 0 ? (
        <Text style={styles.webEmptyText}>No recent users.</Text>
      ) : (
        items.map((item: any, index: number) => {
          const name = item?.name ?? item?.email ?? 'User';
          const email = item?.email ?? 'No email';
          const role = String(item?.role ?? 'client').replace('_', ' ');
          return (
            <View key={String(item?.id ?? email ?? index)} style={styles.webUserRow}>
              <View style={styles.webUserAvatar}>
                <Text style={styles.webUserAvatarText}>{String(name).charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.webUserName} numberOfLines={1}>{name}</Text>
                <Text style={styles.webUserEmail} numberOfLines={1}>{email}</Text>
              </View>
              <View style={styles.webRolePill}>
                <Text style={styles.webRoleText}>{role}</Text>
              </View>
            </View>
          );
        })
      )}
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: WEB_ADMIN_BG },
  container: { flex: 1, backgroundColor: WEB_ADMIN_BG },
  content: { padding: 16, paddingTop: 10, paddingBottom: 124 },
  webAdminShell: {
    backgroundColor: WEB_ADMIN_NAVY,
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    shadowColor: WEB_ADMIN_NAVY_DARK,
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  webBrandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  webBrandIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: WEB_ADMIN_GOLD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webBrandTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
  webBrandTitleAccent: { color: WEB_ADMIN_GOLD },
  webBrandSub: { color: '#D7DEE9', fontSize: 12, fontWeight: '600', marginTop: 2 },
  webAdminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: WEB_ADMIN_GOLD,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  webAdminBadgeText: { color: '#FFFFFF', fontWeight: '900', fontSize: 12 },
  webAdminCard: {
    marginTop: 18,
    backgroundColor: '#162240',
    borderWidth: 1,
    borderColor: 'rgba(181,134,13,0.42)',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  webAdminAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: WEB_ADMIN_GOLD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webAdminAvatarText: { color: '#FFFFFF', fontWeight: '900', fontSize: 16 },
  webAdminName: { color: '#FFFFFF', fontWeight: '900', fontSize: 15 },
  webAdminRole: { color: '#D7DEE9', fontWeight: '700', fontSize: 12, marginTop: 2 },
  webNavScroll: { flexGrow: 0, marginHorizontal: -16, marginBottom: 14 },
  webNavRow: { paddingHorizontal: 16, gap: 8 },
  webNavChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: WEB_ADMIN_NAVY,
    borderRadius: 8,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  webNavChipActive: { backgroundColor: WEB_ADMIN_GOLD, borderWidth: 1, borderColor: WEB_ADMIN_GOLD },
  webNavChipText: { color: '#C2C8D6', fontSize: 12, fontWeight: '800' },
  webNavChipTextActive: { color: '#FFFFFF' },
  webPageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  webPageTitle: { color: WEB_ADMIN_NAVY, fontSize: 22, fontWeight: '900' },
  webPageDate: { color: '#8A94A6', fontSize: 13, fontWeight: '600', marginTop: 4 },
  webPreviewPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    backgroundColor: '#FFF5DC',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  webPreviewText: { color: WEB_ADMIN_GOLD, fontSize: 11, fontWeight: '900' },
  webStatsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 },
  webStatCard: {
    width: '48%',
    minHeight: 112,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DEE2E6',
    padding: 14,
    alignItems: 'flex-start',
    gap: 12,
    shadowColor: '#102042',
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  webStatIcon: { width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  webStatValue: { color: WEB_ADMIN_NAVY, fontSize: 27, fontWeight: '900' },
  webStatLabel: { color: '#6C757D', fontSize: 12, fontWeight: '800', marginTop: 3, lineHeight: 16 },
  webStatusPanel: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DEE2E6',
    flexDirection: 'row',
    marginBottom: 12,
    overflow: 'hidden',
  },
  webStatusItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 18,
    borderRightWidth: 1,
    borderRightColor: '#EEF2F7',
  },
  webStatusValue: { fontSize: 22, fontWeight: '900' },
  webStatusLabel: { color: '#6C757D', fontSize: 12, fontWeight: '800', marginTop: 6 },
  webMiniGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 },
  webMiniCard: {
    width: '48%',
    minHeight: 94,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DEE2E6',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  webMiniIcon: { width: 42, height: 42, borderRadius: 10, backgroundColor: '#F8F9FA', alignItems: 'center', justifyContent: 'center' },
  webMiniValue: { color: WEB_ADMIN_NAVY, fontSize: 20, fontWeight: '900' },
  webMiniLabel: { color: '#6C757D', fontSize: 12, fontWeight: '800', marginTop: 2 },
  webPanelCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DEE2E6',
    overflow: 'hidden',
  },
  webPanelHeader: {
    minHeight: 56,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F7',
  },
  webPanelTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  webPanelTitle: { color: WEB_ADMIN_NAVY, fontSize: 16, fontWeight: '900' },
  webPanelAction: { color: WEB_ADMIN_GOLD, fontSize: 12, fontWeight: '800' },
  webEmptyText: { color: Colors.textMuted, fontSize: 13, fontWeight: '700', padding: 14 },
  webConsultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 10,
  },
  webConsultCode: { color: WEB_ADMIN_NAVY, fontSize: 13, fontWeight: '900' },
  webConsultClient: { color: '#111827', fontSize: 14, fontWeight: '800', marginTop: 4 },
  webConsultLawyer: { color: '#667085', fontSize: 12, fontWeight: '700', marginTop: 2 },
  webStatusBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  webStatusBadgeText: { fontSize: 12, fontWeight: '900' },
  webUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  webUserAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFF5DC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  webUserAvatarText: { color: WEB_ADMIN_GOLD, fontSize: 14, fontWeight: '900' },
  webUserName: { color: WEB_ADMIN_NAVY, fontSize: 14, fontWeight: '900' },
  webUserEmail: { color: '#8A94A6', fontSize: 12, fontWeight: '600', marginTop: 2 },
  webRolePill: { borderRadius: 999, backgroundColor: '#FFF5DC', paddingHorizontal: 10, paddingVertical: 6 },
  webRoleText: { color: WEB_ADMIN_GOLD, fontSize: 11, fontWeight: '900', textTransform: 'capitalize' },
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
