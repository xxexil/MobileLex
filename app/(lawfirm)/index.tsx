import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, RoleColors } from '@/constants/theme';
import { formatPhp } from '@/constants/currency';
import { lawFirmApi } from '@/services/api';
import { useAuth } from '@/context/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNotifications } from '@/context/notifications';
import { resolveStorageUrl } from '@/services/endpoints';
import DashboardPopupBanner from '@/components/DashboardPopupBanner';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

const NOTIF_SEEN_KEY = 'lawfirm_notifications_seen_at';

function initials(name?: string | null) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

function formatScheduled(date?: string | null) {
  if (!date) return '—';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  return (
    d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
    + ' '
    + d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true })
  );
}

function thisMonth(dateStr?: string | null) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function consultStatusColor(status: string) {
  switch (status?.toLowerCase()) {
    case 'upcoming':  return '#2563EB';
    case 'completed': return '#16A34A';
    case 'pending':   return '#D97706';
    case 'cancelled': return '#DC2626';
    default:          return '#6B7280';
  }
}

function StatPill({ label, value, color, onPress }: { label: string; value: number; color: string; onPress?: () => void }) {
  return (
    <TouchableOpacity style={styles.webStatusPill} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.statDot, { backgroundColor: color }]} />
      <Text style={styles.webStatusPillValue}>{value}</Text>
      <Text style={styles.webStatusPillLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function FirmMetricCard({
  label,
  value,
  icon,
  color,
  onPress,
}: {
  label: string;
  value: string | number;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity style={styles.metricCard} onPress={onPress} activeOpacity={onPress ? 0.86 : 1}>
      <View style={[styles.metricIconWrap, { backgroundColor: `${color}18` }]}>
        <Ionicons name={icon as any} size={22} color={color} />
      </View>
      <View style={styles.metricTextWrap}>
        <Text style={styles.metricValue} numberOfLines={1}>{value}</Text>
        <Text style={styles.metricLabel} numberOfLines={2}>{label}</Text>
      </View>
    </TouchableOpacity>
  );
}

function QuickActionTile({
  icon,
  label,
  description,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.quickActionTile} activeOpacity={0.92} onPress={onPress}>
      <View style={styles.quickActionIcon}>
        <Ionicons name={icon} size={18} color={RoleColors.lawFirm.shell} />
      </View>
      <Text style={styles.quickActionLabel}>{label}</Text>
      <Text style={styles.quickActionDesc}>{description}</Text>
    </TouchableOpacity>
  );
}

function SectionHeader({ title, badge, action, onAction }: { title: string; badge?: number; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.webSectionHeader}>
      <View style={styles.sectionTitleRow}>
        <Text style={styles.webSectionTitle}>{title}</Text>
        {badge != null && badge > 0 && (
          <View style={styles.sectionBadge}>
            <Text style={styles.sectionBadgeText}>{badge}</Text>
          </View>
        )}
      </View>
      {action && onAction && (
        <TouchableOpacity onPress={onAction}>
          <Text style={styles.webSectionAction}>{action}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function LawFirmDashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const { unreadActivityCount } = useNotifications();
  const insets = useSafeAreaInsets();

  const [dashboard, setDashboard] = useState<any>(null);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [consultations, setConsultations] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [earnings, setEarnings] = useState<any>(null);
  const [apiIssues, setApiIssues] = useState<string[]>([]);
  const [notifCount, setNotifCount] = useState(0);
  const [inboxBreakdown, setInboxBreakdown] = useState({ client: 0, lawyer: 0, internal: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actioningId, setActioningId] = useState<number | null>(null);

  const notifPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const unreadMessagesRef = useRef(0);
  const consultationSeenAtRef = useRef(0);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(NOTIF_SEEN_KEY).then((value) => {
      if (!active) return;
      const parsed = Number(value || '0');
      consultationSeenAtRef.current = Number.isFinite(parsed) ? parsed : 0;
    });
    return () => { active = false; };
  }, []);

  const handleOpenNotifications = useCallback(async () => {
    const now = Date.now();
    consultationSeenAtRef.current = now;
    await AsyncStorage.setItem(NOTIF_SEEN_KEY, String(now));
    router.push('/(lawfirm)/notifications');
  }, [router]);

  const loadNotificationCount = useCallback(async () => {
    try {
      const { data: convs } = await lawFirmApi.messages();
      const conversationPayload: any[] = Array.isArray(convs?.data) ? convs.data : Array.isArray(convs) ? convs : [];
      const unreadMessages = conversationPayload.reduce((sum, c) => sum + Number(c?.unread ?? 0), 0);
      const breakdown = conversationPayload.reduce((acc, c) => {
        const role = String(c?.role ?? c?.participant_role ?? c?.thread_type ?? c?.category ?? '').toLowerCase();
        if (role.includes('client') || c?.client?.name || c?.client_name) {
          acc.client += 1;
        } else if (role.includes('lawyer') || c?.lawyer?.name || c?.lawyer_name) {
          acc.lawyer += 1;
        } else {
          acc.internal += 1;
        }
        return acc;
      }, { client: 0, lawyer: 0, internal: 0 });
      unreadMessagesRef.current = unreadMessages;
      setInboxBreakdown(breakdown);
      setNotifCount(Math.min(99, Math.max(unreadMessages, unreadActivityCount, 0)));
    } catch {
      setNotifCount(0);
      setInboxBreakdown({ client: 0, lawyer: 0, internal: 0 });
    }
  }, [unreadActivityCount]);

  const load = useCallback(async () => {
    if (!loading) setRefreshing(true);

    const [dashRes, teamRes, consultsRes, appsRes, earningsRes] = await Promise.allSettled([
      lawFirmApi.dashboard(),
      lawFirmApi.team(),
      lawFirmApi.consultations(),
      lawFirmApi.applications(),
      lawFirmApi.earnings(),
    ]);

    const issues: string[] = [];
    const fmt = (label: string, r: any) => {
      const status = r?.response?.status;
      const msg = r?.response?.data?.message ?? r?.message ?? 'Request failed';
      return status ? `${label}: ${status} — ${String(msg)}` : `${label}: ${String(msg)}`;
    };
    if (dashRes.status === 'rejected') issues.push(fmt('Dashboard', dashRes.reason));
    if (teamRes.status === 'rejected') issues.push(fmt('Team', teamRes.reason));
    if (consultsRes.status === 'rejected') issues.push(fmt('Consultations', consultsRes.reason));
    setApiIssues(issues);

    if (dashRes.status === 'fulfilled') setDashboard(dashRes.value?.data ?? null);
    else setDashboard(null);

    if (teamRes.status === 'fulfilled') {
      const p = teamRes.value?.data;
      setTeamMembers(Array.isArray(p?.data) ? p.data : Array.isArray(p) ? p : []);
    } else setTeamMembers([]);

    if (consultsRes.status === 'fulfilled') {
      const p = consultsRes.value?.data;
      setConsultations(Array.isArray(p?.data) ? p.data : Array.isArray(p) ? p : []);
    } else setConsultations([]);

    if (appsRes.status === 'fulfilled') {
      const p = appsRes.value?.data;
      setApplications(Array.isArray(p) ? p : []);
    } else setApplications([]);

    if (earningsRes.status === 'fulfilled') setEarnings(earningsRes.value?.data ?? null);
    else setEarnings(null);

    setLoading(false);
    setRefreshing(false);
  }, [loading]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    loadNotificationCount();
    if (notifPollRef.current) clearInterval(notifPollRef.current);
    notifPollRef.current = setInterval(loadNotificationCount, 15000);
    return () => {
      if (notifPollRef.current) clearInterval(notifPollRef.current);
      notifPollRef.current = null;
    };
  }, [loadNotificationCount]);

  useEffect(() => {
    setNotifCount(Math.min(99, Math.max(unreadMessagesRef.current, unreadActivityCount, 0)));
  }, [unreadActivityCount]);

  const derivedStats = useMemo(() => ({
    pendingThisMonth: consultations.filter(
      (c) => c?.status === 'pending' && thisMonth(c?.scheduled_at ?? c?.created_at),
    ).length,
    upcomingSessions: consultations.filter((c) => c?.status === 'upcoming').length,
    completedThisMonth: consultations.filter(
      (c) => c?.status === 'completed' && thisMonth(c?.scheduled_at ?? c?.updated_at),
    ).length,
  }), [consultations]);

  const recentConsultations = useMemo(
    () => [...consultations].sort((a, b) => (
      (Date.parse(b?.scheduled_at || '') || 0) - (Date.parse(a?.scheduled_at || '') || 0)
    )).slice(0, 8),
    [consultations],
  );

  const ds = dashboard?.stats ?? dashboard ?? {};
  const firmName = dashboard?.firm_name ?? dashboard?.firm?.name ?? (user?.name || 'Law Firm');
  const firmNeedsVerification = (
    dashboard?.is_verified === false
    || dashboard?.firm?.is_verified === false
    || dashboard?.profile?.is_verified === false
    || ds?.is_verified === false
  );
  const firmAvatarUri = dashboard?.avatar_url
    || dashboard?.firm?.avatar_url
    || user?.avatar_url
    || (user as any)?.avatar
    || '';
  const [firmAvatarLoadFailed, setFirmAvatarLoadFailed] = useState(false);
  const teamCount = Number(ds?.team_lawyers ?? ds?.team_count ?? teamMembers.length ?? 0);
  const totalEarned = Number(earnings?.total_earned ?? ds?.total_earned ?? 0);
  const thisMonthEarned = Number(earnings?.this_month ?? ds?.this_month_earned ?? 0);
  const dashboardMonthlyEarnings = useMemo(() => {
    const source = dashboard?.monthly_earnings ?? dashboard?.monthlyEarnings ?? ds?.monthly_earnings ?? ds?.monthlyEarnings ?? [];
    if (!Array.isArray(source)) return [];
    return source.map((item: any, index: number) => ({
      label: String(item?.month ?? item?.label ?? item?.name ?? `M${index + 1}`),
      amount: Number(item?.amount ?? item?.total ?? item?.earned ?? item?.firm_cut ?? 0),
    })).slice(-6);
  }, [dashboard?.monthlyEarnings, dashboard?.monthly_earnings, ds?.monthlyEarnings, ds?.monthly_earnings]);
  const dashboardHighestMonth = dashboard?.highest_month ?? dashboard?.highestMonth ?? ds?.highest_month ?? ds?.highestMonth;
  const dashboardTotalThisYear = Number(dashboard?.total_this_year ?? dashboard?.totalThisYear ?? ds?.total_this_year ?? ds?.totalThisYear ?? 0);
  const dashboardYearlyEarnings = dashboard?.yearly_earnings ?? dashboard?.yearlyEarnings ?? ds?.yearly_earnings ?? ds?.yearlyEarnings ?? [];
  const visibleMonthlyEarnings = useMemo(() => {
    if (dashboardMonthlyEarnings.length > 0) return dashboardMonthlyEarnings;
    const payments = Array.isArray(earnings?.recent_payments) ? earnings.recent_payments : [];
    const grouped = new Map<string, { label: string; amount: number; timestamp: number }>();
    payments.forEach((payment: any) => {
      const date = new Date(payment?.date ?? payment?.created_at ?? '');
      if (Number.isNaN(date.getTime())) return;
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      const label = date.toLocaleDateString('en-PH', { month: 'short', year: 'numeric' });
      const current = grouped.get(key) ?? { label, amount: 0, timestamp: date.getTime() };
      current.amount += Number(payment?.amount ?? payment?.firm_cut ?? 0);
      grouped.set(key, current);
    });
    return Array.from(grouped.values())
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-6)
      .map(({ label, amount }) => ({ label, amount }));
  }, [dashboardMonthlyEarnings, earnings?.recent_payments]);
  const highestMonthLabel = dashboardHighestMonth?.month ?? dashboardHighestMonth?.label ?? visibleMonthlyEarnings.reduce(
    (best, item) => (item.amount > best.amount ? item : best),
    { label: 'N/A', amount: 0 },
  ).label;
  const highestMonthAmount = Number(dashboardHighestMonth?.amount ?? dashboardHighestMonth?.total ?? dashboardHighestMonth?.earned ?? visibleMonthlyEarnings.reduce(
    (best, item) => Math.max(best, item.amount),
    0,
  ));
  const todayLabel = new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const todaySessions = useMemo(() => {
    const source = dashboard?.today_sessions ?? dashboard?.todaySessions ?? [];
    if (Array.isArray(source) && source.length > 0) return source;
    const now = new Date();
    return consultations.filter((entry) => {
      const date = new Date(entry?.scheduled_at ?? '');
      return !Number.isNaN(date.getTime())
        && date.getFullYear() === now.getFullYear()
        && date.getMonth() === now.getMonth()
        && date.getDate() === now.getDate()
        && String(entry?.status ?? '').toLowerCase() === 'upcoming';
    });
  }, [consultations, dashboard?.todaySessions, dashboard?.today_sessions]);
  const teamStatusCounts = useMemo(() => {
    return teamMembers.reduce(
      (acc, member) => {
        const status = String(member?.current_status ?? member?.availability_status ?? '').toLowerCase();
        if (status === 'active' || status === 'available') acc.active += 1;
        else if (status === 'busy') acc.busy += 1;
        else acc.offline += 1;
        return acc;
      },
      { active: 0, busy: 0, offline: 0 }
    );
  }, [teamMembers]);

  async function handleAccept(appId: number, lawyerName: string) {
    Alert.alert('Accept Application', `Add ${lawyerName} to your team?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Accept',
        onPress: async () => {
          setActioningId(appId);
          try {
            await lawFirmApi.acceptApplication(appId);
            setApplications((prev) => prev.filter((a) => a.id !== appId));
            Alert.alert('Accepted', `${lawyerName} has been added to your team.`);
            load();
          } catch (err: any) {
            Alert.alert('Error', err?.response?.data?.message ?? 'Failed to accept application.');
          } finally {
            setActioningId(null);
          }
        },
      },
    ]);
  }

  async function handleReject(appId: number, lawyerName: string) {
    Alert.alert('Reject Application', `Reject application from ${lawyerName}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reject', style: 'destructive',
        onPress: async () => {
          setActioningId(appId);
          try {
            await lawFirmApi.rejectApplication(appId);
            setApplications((prev) => prev.filter((a) => a.id !== appId));
          } catch (err: any) {
            Alert.alert('Error', err?.response?.data?.message ?? 'Failed to reject application.');
          } finally {
            setActioningId(null);
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <>
    <DashboardPopupBanner
      role="lawFirm"
      storageKey={`lawfirm-dashboard-popup-${user?.id ?? 'guest'}`}
      visible={firmNeedsVerification}
      title="Verify your firm to unlock trust signals"
      message="Upload registration documents and complete firm details so clients and lawyers can recognize your organization."
      primaryLabel="Complete Verification"
      onPrimaryPress={() => router.push('/(lawfirm)/settings' as any)}
    />
    <ScrollView
      style={styles.webRoot}
      contentContainerStyle={[styles.webContent, { paddingTop: Math.max(0, insets.top) }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      showsVerticalScrollIndicator={false}
    >
      {/* ── header gradient ──────────────────────────────────────────────── */}
      <LinearGradient colors={['#EEF2F6', '#EEF2F6']} style={styles.webHeader}>
        <View style={styles.webHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.webHeaderTitle}>Firm Dashboard</Text>
            <Text style={styles.webHeaderSub} numberOfLines={1}>{firmName} - {todayLabel}</Text>
          </View>
          <TouchableOpacity style={styles.webBellBtn} onPress={handleOpenNotifications}>
            <Ionicons name="notifications-outline" size={20} color={RoleColors.lawFirm.shell} />
            {notifCount > 0 && (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>{notifCount > 99 ? '99+' : notifCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsRow}>
          <StatPill
            label="Pending this month"
            value={derivedStats.pendingThisMonth}
            color="#F59E0B"
            onPress={() => router.push('/(lawfirm)/consultations')}
          />
          <StatPill
            label="Upcoming sessions"
            value={derivedStats.upcomingSessions}
            color="#2563EB"
            onPress={() => router.push('/(lawfirm)/consultations')}
          />
          <StatPill
            label="Completed this month"
            value={derivedStats.completedThisMonth}
            color="#22C55E"
            onPress={() => router.push('/(lawfirm)/consultations')}
          />
        </ScrollView>
      </LinearGradient>

      <View style={styles.webBody}>
        <Animated.View entering={FadeInDown.duration(300).delay(40)} style={styles.webMetricGrid}>
          <DashboardMiniStat label="Team Lawyers" value={teamCount} icon="people" color="#15803D" onPress={() => router.push('/(lawfirm)/team')} />
          <DashboardMiniStat label="Active Now" value={Number(ds?.active_count ?? teamStatusCounts.active)} icon="ellipse" color="#16A34A" onPress={() => router.push('/(lawfirm)/team')} />
          <DashboardMiniStat label="Pending Apps" value={applications.length || Number(ds?.pending_applications ?? 0)} icon="person-add" color="#D97706" onPress={() => router.push('/(lawfirm)/team')} />
          <DashboardMiniStat label="Total Consults" value={Number(ds?.total_consultations ?? consultations.length ?? 0)} icon="calendar" color="#2563EB" onPress={() => router.push('/(lawfirm)/consultations')} />
          <DashboardMiniStat label="This Month" value={formatPhp(thisMonthEarned)} icon="calendar-outline" color="#2563EB" onPress={() => router.push('/(lawfirm)/earnings')} />
          <DashboardMiniStat label="Total Earned" value={formatPhp(totalEarned)} icon="cash" color="#9333EA" onPress={() => router.push('/(lawfirm)/earnings')} />
        </Animated.View>
        {/* ── api errors ───────────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.duration(300).delay(60)} style={styles.hiddenSection}>
          <QuickActionTile icon="people-outline" label="Team" description="Review lawyers and roles" onPress={() => router.push('/(lawfirm)/team')} />
          <QuickActionTile icon="calendar-outline" label="Consultations" description="Handle the queue" onPress={() => router.push('/(lawfirm)/consultations')} />
          <QuickActionTile icon="chatbubbles-outline" label="Messages" description="Open firm inbox" onPress={() => router.push('/(lawfirm)/messages')} />
          <QuickActionTile icon="cash-outline" label="Earnings" description="Check revenue summary" onPress={() => router.push('/(lawfirm)/earnings')} />
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(300).delay(100)} style={styles.hiddenSection}>
          <View style={styles.focusHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.focusEyebrow}>TEAM FLOW</Text>
              <Text style={styles.focusTitle}>Approval-first operations</Text>
              <Text style={styles.focusDesc}>
                Keep lawyers moving by reviewing applications, monitoring the active team, and jumping into consultations fast.
              </Text>
            </View>
            <View style={styles.focusBadge}>
              <Ionicons name="shield-checkmark-outline" size={16} color="#fff" />
            </View>
          </View>
          <View style={styles.focusStatsRow}>
            <View style={styles.focusStat}>
              <Text style={styles.focusStatValue}>{applications.length || Number(ds?.pending_applications ?? 0)}</Text>
              <Text style={styles.focusStatLabel}>Pending apps</Text>
            </View>
            <View style={styles.focusDivider} />
            <View style={styles.focusStat}>
              <Text style={styles.focusStatValue}>{teamCount}</Text>
              <Text style={styles.focusStatLabel}>Team lawyers</Text>
            </View>
            <View style={styles.focusDivider} />
            <View style={styles.focusStat}>
              <Text style={styles.focusStatValue}>{derivedStats.upcomingSessions}</Text>
              <Text style={styles.focusStatLabel}>Open consults</Text>
            </View>
          </View>
          <View style={styles.focusSummaryRow}>
            <View style={styles.focusSummaryItem}>
              <Text style={styles.focusSummaryValue}>{applications.length || Number(ds?.pending_applications ?? 0)}</Text>
              <Text style={styles.focusSummaryLabel}>Today&apos;s queue</Text>
            </View>
            <View style={styles.focusSummaryItem}>
              <Text style={styles.focusSummaryValue}>{teamCount}</Text>
              <Text style={styles.focusSummaryLabel}>Team online</Text>
            </View>
            <View style={styles.focusSummaryItem}>
              <Text style={styles.focusSummaryValue}>{notifCount}</Text>
              <Text style={styles.focusSummaryLabel}>Unread alerts</Text>
            </View>
            <View style={styles.focusSummaryItem}>
              <Text style={styles.focusSummaryValue}>{derivedStats.upcomingSessions}</Text>
              <Text style={styles.focusSummaryLabel}>Consults today</Text>
            </View>
          </View>
          <View style={styles.focusActions}>
            <TouchableOpacity style={styles.focusPrimaryBtn} onPress={() => router.push('/(lawfirm)/team')}>
              <Text style={styles.focusPrimaryText}>Review applications</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.focusGhostBtn} onPress={() => router.push('/(lawfirm)/consultations')}>
              <Text style={styles.focusGhostText}>Open consultations</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(300).delay(120)} style={styles.hiddenSection}>
          <View style={styles.statusBoardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.statusBoardEyebrow}>TEAM STATUS</Text>
              <Text style={styles.statusBoardTitle}>Who is active right now</Text>
              <Text style={styles.statusBoardDesc}>
                Keep the firm moving by seeing active, busy, and offline lawyers at a glance.
              </Text>
            </View>
            <TouchableOpacity style={styles.statusBoardAction} onPress={() => router.push('/(lawfirm)/team')}>
              <Text style={styles.statusBoardActionText}>Open team</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.statusBoardRow}>
            <View style={[styles.statusBoardStat, styles.statusBoardStatActive]}>
              <Text style={styles.statusBoardStatValue}>{teamStatusCounts.active}</Text>
              <Text style={styles.statusBoardStatLabel}>Active</Text>
            </View>
            <View style={[styles.statusBoardStat, styles.statusBoardStatBusy]}>
              <Text style={styles.statusBoardStatValue}>{teamStatusCounts.busy}</Text>
              <Text style={styles.statusBoardStatLabel}>Busy</Text>
            </View>
            <View style={[styles.statusBoardStat, styles.statusBoardStatOffline]}>
              <Text style={styles.statusBoardStatValue}>{teamStatusCounts.offline}</Text>
              <Text style={styles.statusBoardStatLabel}>Offline</Text>
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(300).delay(140)} style={styles.hiddenSection}>
          <View style={styles.inboxHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.inboxEyebrow}>FIRM INBOX</Text>
              <Text style={styles.inboxTitle}>Triage by source</Text>
              <Text style={styles.inboxDesc}>
                Use the same thread list, but keep conversations grouped by client, lawyer, or internal coordination.
              </Text>
            </View>
            <View style={styles.inboxBadge}>
              <Ionicons name="chatbubbles-outline" size={15} color={RoleColors.lawFirm.accent} />
            </View>
          </View>

          <View style={styles.inboxCounterRow}>
            <TouchableOpacity style={styles.inboxCounterCard} onPress={() => router.push('/(lawfirm)/messages')}>
              <Text style={styles.inboxCounterValue}>{inboxBreakdown.client}</Text>
              <Text style={styles.inboxCounterLabel}>Client</Text>
              <Text style={styles.inboxCounterHint}>Threads</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.inboxCounterCard} onPress={() => router.push('/(lawfirm)/messages')}>
              <Text style={styles.inboxCounterValue}>{inboxBreakdown.lawyer}</Text>
              <Text style={styles.inboxCounterLabel}>Lawyer</Text>
              <Text style={styles.inboxCounterHint}>Threads</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.inboxCounterCard} onPress={() => router.push('/(lawfirm)/messages')}>
              <Text style={styles.inboxCounterValue}>{inboxBreakdown.internal}</Text>
              <Text style={styles.inboxCounterLabel}>Internal</Text>
              <Text style={styles.inboxCounterHint}>Threads</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(300).delay(160)} style={styles.hiddenSection}>
          <View style={styles.dailyQueueHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.dailyQueueEyebrow}>DAILY QUEUE</Text>
              <Text style={styles.dailyQueueTitle}>What needs attention today</Text>
              <Text style={styles.dailyQueueDesc}>
                Keep the firm moving by checking the same counts in one compact row.
              </Text>
            </View>
            <TouchableOpacity style={styles.dailyQueueAction} onPress={() => router.push('/(lawfirm)/consultations')}>
              <Text style={styles.dailyQueueActionText}>Open queue</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.dailyQueueRow}>
            <View style={styles.dailyQueueItem}>
              <Text style={styles.dailyQueueValue}>{applications.length || Number(ds?.pending_applications ?? 0)}</Text>
              <Text style={styles.dailyQueueLabel}>Apps</Text>
            </View>
            <View style={styles.dailyQueueItem}>
              <Text style={styles.dailyQueueValue}>{derivedStats.upcomingSessions}</Text>
              <Text style={styles.dailyQueueLabel}>Consults</Text>
            </View>
            <View style={styles.dailyQueueItem}>
              <Text style={styles.dailyQueueValue}>{notifCount}</Text>
              <Text style={styles.dailyQueueLabel}>Alerts</Text>
            </View>
            <View style={styles.dailyQueueItem}>
              <Text style={styles.dailyQueueValue}>{teamStatusCounts.active}</Text>
              <Text style={styles.dailyQueueLabel}>Active</Text>
            </View>
          </View>
        </Animated.View>

        {apiIssues.length > 0 && (
          <View style={styles.errorCard}>
            <Ionicons name="warning-outline" size={16} color="#B91C1C" style={{ marginRight: 6 }} />
            <View style={{ flex: 1 }}>
              {apiIssues.map((issue, i) => (
                <Text key={String(i)} style={styles.errorLine}>{issue}</Text>
              ))}
            </View>
          </View>
        )}

        {/* ── pending applications ─────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.duration(300).delay(140)}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hiddenSection} contentContainerStyle={styles.metricsRow}>
          <FirmMetricCard label="Team Lawyers" value={teamCount} icon="people-outline" color="#2563EB" onPress={() => router.push('/(lawfirm)/team')} />
          <FirmMetricCard label="Active Lawyers" value={Number(ds?.active_count ?? teamMembers.filter((m) => String(m?.current_status ?? m?.availability_status ?? '').toLowerCase() === 'active').length)} icon="pulse-outline" color="#16A34A" onPress={() => router.push('/(lawfirm)/team')} />
          <FirmMetricCard label="Pending Apps" value={applications.length || Number(ds?.pending_applications ?? 0)} icon="mail-unread-outline" color="#F59E0B" onPress={() => router.push('/(lawfirm)/team')} />
          <FirmMetricCard label="Total Consults" value={Number(ds?.total_consultations ?? consultations.length ?? 0)} icon="calendar-outline" color="#7C3AED" onPress={() => router.push('/(lawfirm)/consultations')} />
          <FirmMetricCard label="Total Earned" value={formatPhp(totalEarned)} icon="cash-outline" color="#059669" onPress={() => router.push('/(lawfirm)/earnings')} />
          <FirmMetricCard label="This Month" value={formatPhp(thisMonthEarned)} icon="trending-up-outline" color="#0EA5E9" onPress={() => router.push('/(lawfirm)/earnings')} />
          </ScrollView>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(300).delay(155)} style={styles.hiddenSection}>
          <SectionHeader
            title="Web Dashboard Snapshot"
            action="Full Report"
            onAction={() => router.push('/(lawfirm)/earnings')}
          />
          <View style={styles.webStatsGrid}>
            <View style={styles.webStatBox}>
              <Text style={styles.webStatLabel}>Today Sessions</Text>
              <Text style={styles.webStatValue}>{todaySessions.length}</Text>
            </View>
            <View style={styles.webStatBox}>
              <Text style={styles.webStatLabel}>This Year</Text>
              <Text style={styles.webStatValue}>{formatPhp(dashboardTotalThisYear || totalEarned)}</Text>
            </View>
            <View style={styles.webStatBox}>
              <Text style={styles.webStatLabel}>Highest Month</Text>
              <Text style={styles.webStatValue} numberOfLines={1}>
                {dashboardHighestMonth?.month ?? dashboardHighestMonth?.label ?? 'N/A'}
              </Text>
            </View>
            <View style={styles.webStatBox}>
              <Text style={styles.webStatLabel}>Year Records</Text>
              <Text style={styles.webStatValue}>{Array.isArray(dashboardYearlyEarnings) ? dashboardYearlyEarnings.length : 0}</Text>
            </View>
          </View>
          {dashboardMonthlyEarnings.length > 0 ? (
            <View style={styles.monthlyChart}>
              {dashboardMonthlyEarnings.map((item, index) => {
                const maxAmount = Math.max(...dashboardMonthlyEarnings.map((entry) => entry.amount), 1);
                const height = Math.max(18, Math.round((item.amount / maxAmount) * 86));
                return (
                  <View key={`${item.label}-${index}`} style={styles.monthBarCol}>
                    <View style={[styles.monthBar, { height }]} />
                    <Text style={styles.monthLabel} numberOfLines={1}>{item.label}</Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={styles.webDashboardHint}>Monthly earnings chart will appear once the backend returns web dashboard data.</Text>
          )}
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(300).delay(180)} style={styles.webPanelCard}>
          <SectionHeader
            title="Pending Applications"
            badge={applications.length}
            action="View Team"
            onAction={() => router.push('/(lawfirm)/team')}
          />
          {applications.length === 0 ? (
            <View style={styles.emptyRow}>
              <Ionicons name="checkmark-circle-outline" size={20} color="#9CA3AF" />
              <Text style={styles.emptyText}>No pending applications</Text>
            </View>
          ) : (
            applications.map((app, idx) => {
              const lawyer = app?.lawyer ?? {};
              const isActioning = actioningId === app.id;
              return (
                <View key={String(app.id ?? idx)} style={[styles.webAppRow, idx > 0 && styles.appRowDivider]}>
                  <View style={styles.webAppAvatar}>
                    <Text style={styles.appAvatarText}>{initials(lawyer.name)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.webAppName}>{lawyer.name || '—'}</Text>
                    <View style={styles.appMetaRow}>
                      {lawyer.specialty ? (
                        <View style={styles.appSpecialtyPill}>
                          <Ionicons name="briefcase-outline" size={11} color={RoleColors.lawFirm.shell} />
                          <Text style={styles.appSpecialtyText}>{lawyer.specialty}</Text>
                        </View>
                      ) : null}
                      {lawyer.experience_years != null ? (
                        <Text style={styles.appExp}>{lawyer.experience_years} yrs exp</Text>
                      ) : null}
                    </View>
                    {app.message ? (
                      <Text style={styles.webAppMessage} numberOfLines={2}>"{app.message}"</Text>
                    ) : null}
                    <TouchableOpacity style={styles.appDocsBtn} onPress={() => router.push('/(lawfirm)/team')}>
                      <Ionicons name="document-text" size={13} color={RoleColors.lawFirm.shell} />
                      <Text style={styles.appDocsText}>Review Docs</Text>
                    </TouchableOpacity>
                    <View style={styles.webAppActions}>
                      <TouchableOpacity
                        style={[styles.webAcceptBtn, isActioning && styles.btnDisabled]}
                        onPress={() => handleAccept(app.id, lawyer.name || 'this lawyer')}
                        disabled={isActioning}
                      >
                        {isActioning
                          ? <ActivityIndicator size="small" color="#fff" />
                          : (
                            <>
                              <Ionicons name="checkmark" size={14} color="#fff" />
                              <Text style={styles.acceptBtnText}>Accept</Text>
                            </>
                          )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.webRejectBtn, isActioning && styles.btnDisabled]}
                        onPress={() => handleReject(app.id, lawyer.name || 'this lawyer')}
                        disabled={isActioning}
                      >
                        <Ionicons name="close" size={14} color="#DC2626" />
                        <Text style={styles.rejectBtnText}>Reject</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </Animated.View>

        {/* ── team members ─────────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.duration(300).delay(220)} style={styles.webPanelCard}>
          <SectionHeader
            title="Team Members"
            badge={teamCount}
            action="Manage Team"
            onAction={() => router.push('/(lawfirm)/team')}
          />
          {teamMembers.length === 0 ? (
            <View style={styles.emptyRow}>
              <Ionicons name="people-outline" size={20} color="#9CA3AF" />
              <Text style={styles.emptyText}>No team members yet</Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.webTeamScroll}>
              {teamMembers.slice(0, 8).map((member, idx) => {
                const isActive = String(member?.availability_status ?? '').toLowerCase() === 'available';
                return (
                  <View key={String(member?.id ?? idx)} style={styles.webTeamMemberCard}>
                    <View style={styles.webTeamAvatar}>
                      <Text style={styles.teamAvatarText}>{initials(member?.name)}</Text>
                    </View>
                    <View style={[styles.webTeamStatusDot, { backgroundColor: isActive ? '#22C55E' : '#9CA3AF' }]} />
                    <Text style={styles.webTeamMemberName} numberOfLines={1}>{member?.name || '—'}</Text>
                    <Text style={styles.webTeamMemberRole} numberOfLines={1}>
                      {member?.role === 'admin' ? 'Admin' : member?.specialty || 'Lawyer'}
                    </Text>
                    <View style={[styles.teamStatusBadge, { backgroundColor: isActive ? '#DCFCE7' : '#F3F4F6' }]}>
                      <Text style={[styles.teamStatusText, { color: isActive ? '#16A34A' : '#6B7280' }]}>
                        {isActive ? 'Active' : 'Offline'}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </Animated.View>

        {/* ── recent consultations ─────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.duration(300).delay(260)} style={styles.webPanelCard}>
          <SectionHeader
            title="Recent Consultations"
            action="View All"
            onAction={() => router.push('/(lawfirm)/consultations')}
          />
          {recentConsultations.length === 0 ? (
            <View style={styles.emptyRow}>
              <Ionicons name="calendar-outline" size={20} color="#9CA3AF" />
              <Text style={styles.emptyText}>No consultations yet</Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ minWidth: 640 }}>
                <View style={styles.webTableHeader}>
                  <Text style={[styles.tableHeaderCell, { width: 110 }]}>CLIENT</Text>
                  <Text style={[styles.tableHeaderCell, { width: 110 }]}>LAWYER</Text>
                  <Text style={[styles.tableHeaderCell, { width: 70 }]}>TYPE</Text>
                  <Text style={[styles.tableHeaderCell, { width: 160 }]}>SCHEDULED</Text>
                  <Text style={[styles.tableHeaderCell, { width: 90, textAlign: 'center' }]}>STATUS</Text>
                  <Text style={[styles.tableHeaderCell, { width: 80, textAlign: 'right' }]}>AMOUNT</Text>
                </View>
                {recentConsultations.map((entry, idx) => {
                  const sc = consultStatusColor(entry?.status ?? '');
                  return (
                    <View key={String(entry?.id ?? idx)} style={[styles.webTableRow, idx % 2 === 1 && styles.webTableRowAlt]}>
                      <Text style={[styles.tableCell, { width: 110 }]} numberOfLines={1}>
                        {entry?.client?.name ?? entry?.client_name ?? '—'}
                      </Text>
                      <Text style={[styles.tableCell, { width: 110 }]} numberOfLines={1}>
                        {entry?.lawyer?.name ?? entry?.lawyer_name ?? '—'}
                      </Text>
                      <View style={[styles.typePill, { width: 70 }]}>
                        <Ionicons
                          name={entry?.type === 'video' ? 'videocam-outline' : 'call-outline'}
                          size={11}
                          color={RoleColors.lawFirm.shell}
                        />
                        <Text style={styles.typePillText} numberOfLines={1}>
                          {entry?.type === 'video' ? 'Video' : String(entry?.type ?? '—')}
                        </Text>
                      </View>
                      <Text style={[styles.tableCell, styles.tableCellMuted, { width: 160 }]} numberOfLines={1}>
                        {formatScheduled(entry?.scheduled_at)}
                      </Text>
                      <View style={[styles.statusPill, { width: 90, backgroundColor: `${sc}18`, borderColor: `${sc}40` }]}>
                        <Text style={[styles.statusPillText, { color: sc }]} numberOfLines={1}>
                          {String(entry?.status ?? '—').charAt(0).toUpperCase() + String(entry?.status ?? '').slice(1)}
                        </Text>
                      </View>
                      <Text style={[styles.tableCell, styles.tableCellAmount, { width: 80 }]} numberOfLines={1}>
                        {formatPhp(Number(entry?.amount ?? 0))}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          )}
        </Animated.View>

        {/* ── earnings at a glance ─────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.duration(300).delay(300)}>
        <LinearGradient colors={['#FFFFFF', '#FFFFFF']} style={styles.webEarningsCard}>
          <View style={styles.webEarningsHeader}>
            <View>
              <View style={styles.earningsTitleRow}>
                <Ionicons name="trending-up-outline" size={18} color={RoleColors.lawFirm.shell} />
                <Text style={styles.webEarningsTitle}>Monthly Earnings</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.webEarningsBtn} onPress={() => router.push('/(lawfirm)/earnings')}>
              <Text style={styles.webEarningsBtnText}>Last 12 months</Text>
              <Ionicons name="chevron-down" size={13} color={RoleColors.lawFirm.shell} />
            </TouchableOpacity>
          </View>
          <View style={styles.earningsMetaRow}>
            <View style={styles.earningsMetaItem}>
              <Ionicons name="trophy" size={14} color="#F59E0B" />
              <Text style={styles.earningsMetaText}>Highest: {highestMonthLabel} - {formatPhp(highestMonthAmount)}</Text>
            </View>
            <View style={styles.earningsMetaItem}>
              <Ionicons name="calendar" size={14} color="#2563EB" />
              <Text style={styles.earningsMetaText}>This year: {formatPhp(dashboardTotalThisYear || totalEarned)}</Text>
            </View>
          </View>
          {visibleMonthlyEarnings.length > 0 ? (
            <MonthlyEarningsChart data={visibleMonthlyEarnings} />
          ) : (
            <Text style={styles.webDashboardHint}>Monthly earnings chart will appear once earnings are recorded.</Text>
          )}
        </LinearGradient>
        </Animated.View>
      </View>
    </ScrollView>
    </>
  );
}

function DashboardMiniStat({
  icon,
  value,
  label,
  color,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string | number;
  label: string;
  color: string;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity style={styles.webMetricCard} onPress={onPress} activeOpacity={onPress ? 0.86 : 1}>
      <View style={[styles.webMetricIcon, { backgroundColor: `${color}1F` }]}>
        <Ionicons name={icon} size={19} color={color} />
      </View>
      <View style={styles.webMetricCopy}>
        <Text style={styles.webMetricValue} numberOfLines={1}>{value}</Text>
        <Text style={styles.webMetricLabel} numberOfLines={2}>{label}</Text>
      </View>
    </TouchableOpacity>
  );
}

function MonthlyEarningsChart({ data }: { data: { label: string; amount: number }[] }) {
  const chartWidth = 300;
  const chartHeight = 172;
  const padX = 18;
  const padTop = 12;
  const padBottom = 30;
  const usableWidth = chartWidth - padX * 2;
  const usableHeight = chartHeight - padTop - padBottom;
  const maxAmount = Math.max(...data.map((item) => item.amount), 1);
  const points = data.map((item, index) => {
    const x = padX + (data.length <= 1 ? usableWidth : (usableWidth / (data.length - 1)) * index);
    const y = padTop + usableHeight - (item.amount / maxAmount) * usableHeight;
    return { ...item, x, y };
  });
  const polyPoints = points.map((item) => `${item.x},${item.y}`).join(' ');

  return (
    <View style={styles.webChartWrap}>
      <Svg width="100%" height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
        {[0, 1, 2, 3].map((line) => {
          const y = padTop + (usableHeight / 3) * line;
          return <Line key={line} x1={padX} x2={chartWidth - padX} y1={y} y2={y} stroke="#E5E7EB" strokeWidth="1" />;
        })}
        <Polyline points={polyPoints} fill="none" stroke="#1F365F" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((item, index) => (
          <Circle key={`${item.label}-${index}`} cx={item.x} cy={item.y} r="4" fill="#B8860B" />
        ))}
      </Svg>
      <View style={styles.webChartLabels}>
        {points.map((item, index) => (
          <Text key={`${item.label}-${index}`} style={styles.webChartLabel} numberOfLines={1}>{item.label}</Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: RoleColors.lawFirm.background },
  content: { paddingBottom: 120 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: RoleColors.lawFirm.background },
  body: { paddingHorizontal: 14, paddingTop: 14, gap: 12 },
  quickActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quickActionTile: {
    width: '48.5%',
    minHeight: 106,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E7ECF3',
    padding: 14,
    shadowColor: RoleColors.lawFirm.shell,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  quickActionIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#EEF4FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  quickActionLabel: {
    color: RoleColors.lawFirm.shell,
    fontSize: 14,
    fontWeight: '900',
  },
  quickActionDesc: {
    color: '#6B7280',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  focusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E6ECF5',
    padding: 16,
    shadowColor: RoleColors.lawFirm.shell,
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  focusHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  focusEyebrow: {
    color: RoleColors.lawFirm.accent,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  focusTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 2,
  },
  focusDesc: {
    color: Colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  focusBadge: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: RoleColors.lawFirm.shell,
  },
  focusStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
  },
  focusStat: {
    flex: 1,
    alignItems: 'center',
  },
  focusStatValue: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  focusStatLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  focusSummaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  focusSummaryItem: {
    flexBasis: '48%',
    backgroundColor: '#F8FAFD',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5ECF5',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  focusSummaryValue: {
    color: RoleColors.lawFirm.shell,
    fontSize: 16,
    fontWeight: '900',
  },
  focusSummaryLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  focusDivider: {
    width: 1,
    height: 36,
    backgroundColor: '#E6ECF5',
  },
  focusActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  focusPrimaryBtn: {
    flex: 1,
    backgroundColor: RoleColors.lawFirm.shell,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
  },
  focusPrimaryText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 13,
  },
  focusGhostBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D9E2F2',
    paddingVertical: 11,
    alignItems: 'center',
    backgroundColor: '#F8FAFD',
  },
  focusGhostText: {
    color: RoleColors.lawFirm.shell,
    fontWeight: '900',
    fontSize: 13,
  },
  statusBoardCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E7ECF3',
    padding: 16,
    gap: 12,
    shadowColor: RoleColors.lawFirm.shell,
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  statusBoardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  statusBoardEyebrow: {
    color: '#6B7280',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  statusBoardTitle: { color: RoleColors.lawFirm.shell, fontSize: 16, fontWeight: '800' },
  statusBoardDesc: { color: '#6B7280', fontSize: 12, lineHeight: 17, marginTop: 4 },
  statusBoardAction: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#EEF4FF',
  },
  statusBoardActionText: { color: RoleColors.lawFirm.shell, fontSize: 12, fontWeight: '800' },
  statusBoardRow: { flexDirection: 'row', gap: 8 },
  statusBoardStat: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 2,
    borderWidth: 1,
  },
  statusBoardStatActive: { backgroundColor: '#DCFCE7', borderColor: '#BBF7D0' },
  statusBoardStatBusy: { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' },
  statusBoardStatOffline: { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' },
  statusBoardStatValue: { color: RoleColors.lawFirm.shell, fontSize: 18, fontWeight: '900' },
  statusBoardStatLabel: { color: '#6B7280', fontSize: 11, fontWeight: '800' },
  inboxCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E7ECF3',
    padding: 16,
    gap: 12,
  },
  inboxHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  inboxEyebrow: {
    color: '#6B7280',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  inboxTitle: { color: RoleColors.lawFirm.shell, fontSize: 16, fontWeight: '800' },
  inboxDesc: { color: '#6B7280', fontSize: 12, lineHeight: 17, marginTop: 4 },
  inboxBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF4FF',
  },
  inboxCounterRow: { flexDirection: 'row', gap: 8 },
  inboxCounterCard: {
    flex: 1,
    backgroundColor: '#F8FAFD',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DDE6F4',
    paddingVertical: 12,
    alignItems: 'center',
  },
  inboxCounterValue: { color: RoleColors.lawFirm.shell, fontSize: 18, fontWeight: '900' },
  inboxCounterLabel: { color: Colors.text, fontSize: 12, fontWeight: '800', marginTop: 2 },
  inboxCounterHint: { color: '#6B7280', fontSize: 10, fontWeight: '700', marginTop: 1 },
  dailyQueueCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E7ECF3',
    padding: 16,
    gap: 12,
  },
  dailyQueueHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  dailyQueueEyebrow: { color: '#6B7280', fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginBottom: 4 },
  dailyQueueTitle: { color: RoleColors.lawFirm.shell, fontSize: 16, fontWeight: '800' },
  dailyQueueDesc: { color: '#6B7280', fontSize: 12, lineHeight: 17, marginTop: 4 },
  dailyQueueAction: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#EEF4FF',
  },
  dailyQueueActionText: { color: RoleColors.lawFirm.shell, fontSize: 12, fontWeight: '800' },
  dailyQueueRow: { flexDirection: 'row', gap: 8 },
  dailyQueueItem: {
    flex: 1,
    backgroundColor: '#F8FAFD',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5ECF5',
    paddingVertical: 10,
    alignItems: 'center',
  },
  dailyQueueValue: { color: RoleColors.lawFirm.shell, fontSize: 16, fontWeight: '900' },
  dailyQueueLabel: { color: '#6B7280', fontSize: 11, fontWeight: '700', marginTop: 2 },
  webDashboardCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E7ECF3',
    padding: 16,
    shadowColor: RoleColors.lawFirm.shell,
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  webStatsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  webStatBox: {
    width: '48.5%',
    backgroundColor: '#F8FAFD',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5ECF5',
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  webStatLabel: { color: '#6B7280', fontSize: 11, fontWeight: '800' },
  webStatValue: { color: RoleColors.lawFirm.shell, fontSize: 16, fontWeight: '900', marginTop: 4 },
  monthlyChart: {
    height: 132,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginTop: 14,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5ECF5',
  },
  monthBarCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  monthBar: { width: '70%', borderRadius: 8, backgroundColor: RoleColors.lawFirm.shell },
  monthLabel: { color: '#6B7280', fontSize: 10, fontWeight: '800' },
  webDashboardHint: { color: '#6B7280', fontSize: 12, lineHeight: 18, marginTop: 10 },

  header: { paddingHorizontal: 16, paddingBottom: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 14, marginBottom: 16, gap: 12 },
  firmAvatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)',
  },
  firmAvatarText: { color: '#fff', fontWeight: '800', fontSize: 18 },
  headerEyebrow: { color: '#BFE8C8', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  headerFirmName: { color: '#fff', fontWeight: '800', fontSize: 22, marginTop: 1 },
  bellBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center', justifyContent: 'center',
  },
  bellBadge: {
    position: 'absolute', top: 6, right: 6,
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: '#EF4444',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  bellBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },

  pillsRow: { gap: 8, paddingBottom: 4 },
  statPill: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  statDot: { width: 8, height: 8, borderRadius: 4 },
  statPillValue: { color: '#fff', fontWeight: '800', fontSize: 15 },
  statPillLabel: { color: '#D7F3DE', fontSize: 12, fontWeight: '500' },

  errorCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#FEF2F2', borderRadius: 12,
    borderWidth: 1, borderColor: '#FECACA', padding: 10,
  },
  errorLine: { color: '#991B1B', fontSize: 12 },

  metricsScroller: { flexGrow: 0, marginHorizontal: -14 },
  metricsRow: { paddingHorizontal: 14, gap: 12, paddingBottom: 3 },
  metricCard: {
    width: 250,
    minHeight: 104,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E7ECF3',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: RoleColors.lawFirm.shell,
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  metricIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  metricTextWrap: { flex: 1 },
  metricValue: { color: RoleColors.lawFirm.shell, fontSize: 22, fontWeight: '900', marginBottom: 4 },
  metricLabel: { color: '#6B7280', fontSize: 13, fontWeight: '800', lineHeight: 17 },

  card: {
    backgroundColor: '#fff', borderRadius: 18,
    paddingHorizontal: 14, paddingVertical: 14,
    shadowColor: RoleColors.lawFirm.shell, shadowOpacity: 0.07,
    shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontWeight: '800', fontSize: 16, color: RoleColors.lawFirm.shell },
  sectionBadge: {
    backgroundColor: RoleColors.lawFirm.shell, borderRadius: 999,
    paddingHorizontal: 7, paddingVertical: 2, minWidth: 22, alignItems: 'center',
  },
  sectionBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  sectionAction: { color: '#1A7F45', fontWeight: '700', fontSize: 13 },

  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  emptyText: { color: '#9CA3AF', fontSize: 14 },

  appRow: { flexDirection: 'row', gap: 12, paddingVertical: 12 },
  appRowDivider: { borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  appAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: RoleColors.lawFirm.shell, alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  appAvatarText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  appName: { color: RoleColors.lawFirm.shell, fontWeight: '700', fontSize: 15, marginBottom: 4 },
  appMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  appSpecialtyPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: RoleColors.lawFirm.accentSoft, borderRadius: 999,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  appSpecialtyText: { color: RoleColors.lawFirm.shell, fontSize: 11, fontWeight: '600' },
  appExp: { color: '#6B7280', fontSize: 12 },
  appMessage: { color: '#6B7280', fontSize: 12, fontStyle: 'italic', marginBottom: 8, lineHeight: 17 },
  appActions: { flexDirection: 'row', gap: 8 },
  acceptBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#16A34A', borderRadius: 10,
    paddingVertical: 7, paddingHorizontal: 14,
  },
  acceptBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  rejectBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1.5, borderColor: '#DC2626', borderRadius: 10,
    paddingVertical: 7, paddingHorizontal: 14,
  },
  rejectBtnText: { color: '#DC2626', fontWeight: '700', fontSize: 13 },
  btnDisabled: { opacity: 0.5 },

  teamScroll: { gap: 10, paddingBottom: 4 },
  teamMemberCard: {
    width: 96, alignItems: 'center', padding: 10,
    backgroundColor: '#F7FBF8', borderRadius: 16,
    borderWidth: 1, borderColor: '#DCEFE2',
  },
  teamAvatar: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: RoleColors.lawFirm.shell, alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  teamAvatarText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  teamStatusDot: {
    position: 'absolute', top: 12, right: 12,
    width: 10, height: 10, borderRadius: 5,
    borderWidth: 1.5, borderColor: '#fff',
  },
  teamMemberName: { color: RoleColors.lawFirm.shell, fontWeight: '700', fontSize: 12, textAlign: 'center', marginTop: 2 },
  teamMemberRole: { color: '#6B7280', fontSize: 11, textAlign: 'center', marginBottom: 6 },
  teamStatusBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  teamStatusText: { fontSize: 10, fontWeight: '700' },

  tableHeader: {
    flexDirection: 'row', paddingVertical: 6,
    borderBottomWidth: 1.5, borderBottomColor: '#DCEFE2', marginBottom: 2,
  },
  tableHeaderCell: { fontSize: 10, fontWeight: '800', color: '#6B7280', letterSpacing: 0.5 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9 },
  tableRowAlt: { backgroundColor: '#F7FBF8', borderRadius: 8 },
  tableCell: { fontSize: 13, color: '#1E293B', fontWeight: '500', paddingHorizontal: 2 },
  tableCellMuted: { color: '#6B7280', fontSize: 12 },
  tableCellAmount: { textAlign: 'right', fontWeight: '700', color: RoleColors.lawFirm.shell },
  typePill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: RoleColors.lawFirm.accentSoft, borderRadius: 999,
    paddingHorizontal: 6, paddingVertical: 3, alignSelf: 'center',
  },
  typePillText: { color: RoleColors.lawFirm.shell, fontSize: 11, fontWeight: '600' },
  statusPill: {
    borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, alignSelf: 'center',
  },
  statusPillText: { fontSize: 11, fontWeight: '700' },

  earningsCard: {
    borderRadius: 20, padding: 18,
    shadowColor: RoleColors.lawFirm.shell, shadowOpacity: 0.18,
    shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  earningsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  earningsEyebrow: { color: '#BFE8C8', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  earningsTitle: { color: '#fff', fontWeight: '800', fontSize: 18, marginTop: 2 },
  earningsBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  earningsBtnText: { color: RoleColors.lawFirm.accent, fontWeight: '700', fontSize: 13 },
  earningsRow: { flexDirection: 'row', alignItems: 'center' },
  earningsStat: { flex: 1, alignItems: 'center', gap: 6 },
  earningsDivider: { width: 1, height: 60, backgroundColor: 'rgba(255,255,255,0.15)' },
  earningsIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  earningsStatLabel: { color: '#BFE8C8', fontSize: 11, fontWeight: '600' },
  earningsStatValue: { color: '#fff', fontWeight: '800', fontSize: 14, textAlign: 'center' },

  webRoot: { flex: 1, backgroundColor: '#EEF2F6' },
  webContent: { paddingBottom: 112 },
  webBody: { paddingHorizontal: 14, paddingTop: 12, gap: 12 },
  webHeader: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
  webHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 12 },
  webHeaderTitle: { color: RoleColors.lawFirm.shell, fontWeight: '900', fontSize: 28, marginTop: 0 },
  webHeaderSub: { color: '#60748A', fontSize: 14, fontWeight: '500', marginTop: 4 },
  webBellBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5EAF2',
  },
  webStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E5EAF2',
    shadowColor: '#102A56',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  webStatusPillValue: { color: RoleColors.lawFirm.shell, fontWeight: '900', fontSize: 15 },
  webStatusPillLabel: { color: '#55677D', fontSize: 13, fontWeight: '500' },
  webMetricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  webMetricCard: {
    width: '48.5%',
    minHeight: 96,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5EAF2',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#102A56',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  webMetricIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  webMetricCopy: { flex: 1 },
  webMetricValue: { color: RoleColors.lawFirm.shell, fontSize: 20, fontWeight: '900' },
  webMetricLabel: { color: '#55677D', fontSize: 13, lineHeight: 18, marginTop: 2 },
  hiddenSection: { display: 'none' },
  webPanelCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderWidth: 1,
    borderColor: '#E5EAF2',
    overflow: 'hidden',
    shadowColor: '#102A56',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  webSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E8EDF3',
    marginBottom: 0,
  },
  webSectionTitle: { fontWeight: '900', fontSize: 17, color: RoleColors.lawFirm.shell },
  webSectionAction: { color: RoleColors.lawFirm.shell, fontWeight: '700', fontSize: 14 },
  webAppRow: { flexDirection: 'row', gap: 12, paddingVertical: 16, paddingHorizontal: 16 },
  webAppAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: RoleColors.lawFirm.shell, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  webAppName: { color: RoleColors.lawFirm.shell, fontWeight: '900', fontSize: 16, marginBottom: 6 },
  webAppMessage: { color: '#60748A', fontSize: 12, fontStyle: 'italic', backgroundColor: '#F8FAFC', borderRadius: 7, paddingHorizontal: 10, paddingVertical: 7, marginBottom: 8, lineHeight: 17 },
  appDocsBtn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: '#BFD0EA', backgroundColor: '#EEF4FF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, marginBottom: 10 },
  appDocsText: { color: RoleColors.lawFirm.shell, fontSize: 12, fontWeight: '800' },
  webAppActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  webAcceptBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#16A34A', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 13 },
  webRejectBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1.2, borderColor: '#F87171', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 13 },
  webTeamScroll: { gap: 0, paddingBottom: 0, flexDirection: 'column' },
  webTeamMemberCard: {
    width: '100%',
    minHeight: 78,
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 0,
    borderWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F6',
    flexDirection: 'row',
    gap: 12,
  },
  webTeamAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: RoleColors.lawFirm.shell, alignItems: 'center', justifyContent: 'center', marginBottom: 0 },
  webTeamStatusDot: { position: 'absolute', top: 18, right: 16, width: 9, height: 9, borderRadius: 5, borderWidth: 1.5, borderColor: '#fff' },
  webTeamMemberName: { color: RoleColors.lawFirm.shell, fontWeight: '900', fontSize: 15, textAlign: 'left', flex: 1 },
  webTeamMemberRole: { color: '#60748A', fontSize: 12, textAlign: 'left', marginBottom: 0, flex: 1 },
  webTableHeader: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#E8EDF3', marginBottom: 0, backgroundColor: '#F8FAFC' },
  webTableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  webTableRowAlt: { backgroundColor: '#FFFFFF', borderRadius: 0 },
  webEarningsCard: {
    borderRadius: 14,
    padding: 0,
    borderWidth: 1,
    borderColor: '#E5EAF2',
    shadowColor: '#102A56',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    overflow: 'hidden',
  },
  webEarningsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#E8EDF3', marginBottom: 0 },
  earningsTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  webEarningsTitle: { color: RoleColors.lawFirm.shell, fontWeight: '900', fontSize: 17, marginTop: 0 },
  webEarningsBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#D8E2F1', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#FFFFFF' },
  webEarningsBtnText: { color: RoleColors.lawFirm.shell, fontWeight: '700', fontSize: 12 },
  earningsMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 16, paddingTop: 14 },
  earningsMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  earningsMetaText: { color: '#60748A', fontSize: 12, fontWeight: '700' },
  webChartWrap: { paddingHorizontal: 8, paddingTop: 8, paddingBottom: 14 },
  webChartLabels: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: -26 },
  webChartLabel: { width: 46, color: '#60748A', fontSize: 10, textAlign: 'center' },
});

