import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming, FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { lawyerApi } from '@/services/api';
import { useAuth } from '@/context/auth';
import { useNotifications } from '@/context/notifications';
import { Colors } from '@/constants/theme';
import { formatPhp } from '@/constants/currency';
import AnimatedBorderCard from '@/components/AnimatedBorderCard';
import BrandLogo from '@/components/BrandLogo';
import LawyerBlockedDatesCard from '@/components/LawyerBlockedDatesCard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createReverbEcho,
  isReverbConfigured,
  subscribeUserConsultationEvents,
  subscribeUserPaymentEvents,
  subscribeUserMessageEvents,
} from '@/services/realtime';
import { resolveStorageUrl } from '@/services/endpoints';

const NOTIF_SEEN_KEY = 'lawyer_notifications_seen_at';

function StatCard({ label, value, color, icon, onPress }: { label: string; value: number | string; color: string; icon: any; onPress?: () => void }) {
  return (
    <TouchableOpacity
      style={styles.statCard}
      onPress={onPress}
      activeOpacity={onPress ? 0.75 : 1}
    >
      <View style={[styles.statIconWrap, { backgroundColor: `${color}18` }]}>
        <FontAwesome5 name={icon} size={19} color={color} />
      </View>
      <View style={styles.statTextWrap}>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
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
        <Ionicons name={icon} size={18} color={Colors.primary} />
      </View>
      <Text style={styles.quickActionLabel}>{label}</Text>
      <Text style={styles.quickActionDesc}>{description}</Text>
    </TouchableOpacity>
  );
}

function buildMonthlySeries(payments: any[]): { label: string; key: string; value: number }[] {
  const now = new Date();
  const buckets: { label: string; key: string; value: number }[] = [];

  for (let offset = 11; offset >= 0; offset -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const month = d.getMonth() + 1;
    const key = `${d.getFullYear()}-${String(month).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    buckets.push({ label, key, value: 0 });
  }

  const indexByKey = new Map(buckets.map((bucket, idx) => [bucket.key, idx]));

  for (const payment of payments) {
    const rawDate = payment?.created_at || payment?.date || payment?.paid_at;
    const parsed = new Date(String(rawDate || ''));
    if (Number.isNaN(parsed.getTime())) continue;

    const key = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
    const idx = indexByKey.get(key);
    if (idx === undefined) continue;

    const amount = Number(payment?.amount ?? payment?.lawyer_net ?? 0);
    buckets[idx].value += Number.isFinite(amount) ? amount : 0;
  }

  return buckets;
}

function formatPesoCompact(value: number): string {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  if (safe >= 1_000_000) return `P${(safe / 1_000_000).toFixed(1)}M`;
  if (safe >= 1_000) return `P${Math.round(safe / 1_000)}k`;
  return `P${Math.round(safe)}`;
}

function formatSessionLabel(date?: string | null) {
  if (!date) return 'No upcoming session';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return 'No upcoming session';
  return d.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function LawyerDashboard() {
  const { user, token } = useAuth();
  const { unreadActivityCount } = useNotifications();
  const router = useRouter();
  const displayName = user?.name?.trim() || 'Lawyer';
  const avatarLetter = (displayName.charAt(0) || 'L').toUpperCase();
  const avatarUri = user?.avatar_url
    ? resolveStorageUrl(String(user.avatar_url))
    : (user as any)?.avatar
      ? resolveStorageUrl(String((user as any).avatar))
      : '';
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);

  const [data, setData] = useState<any>(null);
  const [monthlyEarnings, setMonthlyEarnings] = useState<{ label: string; key: string; value: number }[]>([]);
  const [consultationsPerMonth, setConsultationsPerMonth] = useState<{ label: string; key: string; value: number }[]>([]);
  const [chartWidth, setChartWidth] = useState(0);
  const [consultChartWidth, setConsultChartWidth] = useState(0);
  const [notifCount, setNotifCount] = useState(0);
  const [liveAlert, setLiveAlert] = useState<{ message: string; type: 'message' | 'consultation' } | null>(null);
  const liveAlertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const notifPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dashboardPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chartBootstrappedRef = useRef(false);
  const unreadMessagesRef = useRef(0);

  const showLiveAlert = useCallback((message: string, type: 'message' | 'consultation') => {
    setLiveAlert({ message, type });
    if (liveAlertTimerRef.current) clearTimeout(liveAlertTimerRef.current);
    liveAlertTimerRef.current = setTimeout(() => setLiveAlert(null), 5000);
  }, []);
  const consultationSeenAtRef = useRef(0);
  const chartPulse = useSharedValue(0);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(NOTIF_SEEN_KEY).then((value) => {
      if (!active) return;
      const parsed = Number(value || '0');
      consultationSeenAtRef.current = Number.isFinite(parsed) ? parsed : 0;
    });
    return () => {
      active = false;
    };
  }, []);

  const handleOpenNotifications = useCallback(async () => {
    const now = Date.now();
    consultationSeenAtRef.current = now;
    void AsyncStorage.setItem(NOTIF_SEEN_KEY, String(now));
    setNotifCount(Math.min(99, Math.max(0, unreadMessagesRef.current, unreadActivityCount)));
    router.navigate('/(lawyer)/notifications');
  }, [router, unreadActivityCount]);

  const loadNotificationCount = useCallback(async () => {
    try {
      const [{ data: convs }, { data: consults }] = await Promise.all([
        lawyerApi.unreadCount(),
        lawyerApi.consultations(),
      ]);
      const conversationPayload: any[] = Array.isArray(convs) ? convs : [];
      const consultationPayload: any[] = Array.isArray(consults?.data) ? consults.data : Array.isArray(consults) ? consults : [];
      const unreadMessages = conversationPayload.reduce((sum, c) => sum + Number(c?.unread ?? 0), 0);
      unreadMessagesRef.current = unreadMessages;
      const consultationAlerts = consultationPayload.filter((item) => {
        const raw = item?.updated_at || item?.created_at || item?.scheduled_at;
        const ts = Date.parse(String(raw || ''));
        return Number.isFinite(ts) && ts > consultationSeenAtRef.current;
      }).length;
      setNotifCount(Math.min(99, Math.max(0, unreadMessages + consultationAlerts, unreadActivityCount)));
    } catch {
      setNotifCount(0);
    }
  }, [unreadActivityCount]);

  useEffect(() => {
    setNotifCount(Math.min(99, Math.max(0, unreadMessagesRef.current, unreadActivityCount)));
  }, [unreadActivityCount]);

  const load = useCallback(async () => {
    try {
      const [dashboardRes, earningsRes, consultMonthlyRes] = await Promise.all([
        lawyerApi.dashboard(),
        lawyerApi.earnings().catch(() => null),
        lawyerApi.consultationsMonthly().catch(() => null),
      ]);
      const res = dashboardRes?.data;
      const earningsTotal = Number(earningsRes?.data?.total_earned ?? 0);
      const recentPayments = Array.isArray(earningsRes?.data?.recent_payments) ? earningsRes?.data?.recent_payments : [];
      setData({
        ...(res ?? {}),
        total_earned: Number.isFinite(earningsTotal) ? earningsTotal : Number(res?.total_earned ?? 0),
      });
      setMonthlyEarnings(buildMonthlySeries(recentPayments));
      // Prefer dedicated endpoint; fall back to dashboard payload if available
      const monthlyData = Array.isArray(consultMonthlyRes?.data)
        ? consultMonthlyRes.data
        : Array.isArray(res?.consultations_per_month)
        ? res.consultations_per_month
        : [];
      setConsultationsPerMonth(monthlyData);
    } catch {
      setData(null);
      setMonthlyEarnings(buildMonthlySeries([]));
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
      load();
    }, [load])
  );

  useEffect(() => {
    loadNotificationCount();
    if (notifPollRef.current) clearInterval(notifPollRef.current);
    notifPollRef.current = setInterval(() => {
      loadNotificationCount();
    }, 10000);

    return () => {
      if (notifPollRef.current) clearInterval(notifPollRef.current);
      notifPollRef.current = null;
    };
  }, [loadNotificationCount]);

  useEffect(() => {
    if (dashboardPollRef.current) clearInterval(dashboardPollRef.current);
    dashboardPollRef.current = setInterval(() => {
      load();
    }, 15000);

    return () => {
      if (dashboardPollRef.current) clearInterval(dashboardPollRef.current);
      dashboardPollRef.current = null;
    };
  }, [load]);

  useEffect(() => {
    if (!user?.id || !token || !isReverbConfigured()) return;

    const echo = createReverbEcho(token);
    const refresh = () => {
      load();
      loadNotificationCount();
    };

    const unsubscribeConsultations = subscribeUserConsultationEvents(echo, user.id, {
      onCreated: (e?: any) => {
        refresh();
        showLiveAlert('New consultation request received!', 'consultation');
      },
      onUpdated: (e?: any) => {
        refresh();
        showLiveAlert('A consultation was updated', 'consultation');
      },
    });
    const unsubscribePayments = subscribeUserPaymentEvents(echo, user.id, (e?: any) => {
      refresh();
      showLiveAlert('New payment activity on your account', 'consultation');
    });
    const unsubscribeMessages = subscribeUserMessageEvents(echo, user.id, (e?: any) => {
      loadNotificationCount();
      const senderName = e?.sender_name || e?.sender?.name || 'Someone';
      showLiveAlert(`${senderName} sent you a message`, 'message');
    });

    return () => {
      unsubscribeConsultations();
      unsubscribePayments();
      unsubscribeMessages();
      echo.disconnect();
      if (liveAlertTimerRef.current) clearTimeout(liveAlertTimerRef.current);
    };
  }, [load, loadNotificationCount, showLiveAlert, token, user?.id]);

  useEffect(() => {
    if (!monthlyEarnings.length) return;
    if (!chartBootstrappedRef.current) {
      chartBootstrappedRef.current = true;
      return;
    }
    chartPulse.value = 0;
    chartPulse.value = withSequence(
      withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }),
      withTiming(0, { duration: 820, easing: Easing.inOut(Easing.quad) })
    );
  }, [monthlyEarnings, chartPulse]);

  const chartPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + chartPulse.value * 0.006 }],
    opacity: 1 - chartPulse.value * 0.02,
  }));

  const peakPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + chartPulse.value * 1.05 }],
    opacity: 0.45 - chartPulse.value * 0.45,
  }));

  async function handleAccept(id: number) {
    try {
      await lawyerApi.acceptConsultation(id);
      load();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'Failed to accept.');
    }
  }

  async function handleDecline(id: number) {
    Alert.alert('Decline?', 'This will cancel the consultation and refund the client.', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Decline',
        style: 'destructive',
        onPress: async () => {
          try {
            await lawyerApi.declineConsultation(id);
            load();
          } catch (err: any) {
            Alert.alert('Error', err?.response?.data?.message || 'Failed to decline.');
          }
        },
      },
    ]);
  }

  const openAvailability = useCallback((status?: string) => {
    const suffix = status ? `?status=${encodeURIComponent(status)}` : '';
    router.push((`/(lawyer)/availability${suffix}`) as any);
  }, [router]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const upcoming = data?.stats?.upcoming ?? 0;
  const pending = data?.stats?.pending ?? 0;
  const clients = data?.stats?.total_clients ?? 0;
  const totalEarned = data?.total_earned ?? 0;
  const workModeValue = String(data?.availability_status ?? data?.current_status ?? data?.status ?? 'active').toLowerCase();
  const workMode = workModeValue === 'busy' || workModeValue === 'offline' ? workModeValue : 'active';
  const workModeLabel = workMode === 'busy' ? 'Busy right now' : workMode === 'offline' ? 'Offline' : 'Active now';
  const pinnedClients = [
    ...(Array.isArray(data?.pending_consultations) ? data.pending_consultations : []),
    ...(Array.isArray(data?.upcoming_consultations) ? data.upcoming_consultations : []),
  ].slice(0, 3);
  const chartHeight = 190;
  const horizontalPadding = 14;
  const yLabelWidth = 52;
  const chartLeft = yLabelWidth + horizontalPadding;
  const chartRight = horizontalPadding;
  const yPadding = 18;
  const graphValues = monthlyEarnings.map((item) => Number(item.value ?? 0));
  const maxGraph = Math.max(1, ...graphValues);
  const usableWidth = Math.max(40, chartWidth - chartLeft - chartRight);
  const segment = monthlyEarnings.length > 1 ? usableWidth / (monthlyEarnings.length - 1) : usableWidth;
  const points = monthlyEarnings.map((item, idx) => {
    const x = chartLeft + idx * segment;
    const ratio = maxGraph <= 0 ? 0 : Number(item.value ?? 0) / maxGraph;
    const y = yPadding + (1 - ratio) * (chartHeight - yPadding * 2);
    return { x, y, value: Number(item.value ?? 0) };
  });
  const lineSegments = points.slice(0, -1).map((from, idx) => {
    const to = points[idx + 1];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    return {
      key: `${monthlyEarnings[idx]?.key ?? idx}-${monthlyEarnings[idx + 1]?.key ?? idx + 1}`,
      x: from.x,
      y: from.y,
      length,
      angle,
    };
  });
  const peakIndex = graphValues.reduce((bestIdx, value, idx, arr) => (value > arr[bestIdx] ? idx : bestIdx), 0);
  const peakPoint = points[peakIndex];
  const peakItem = monthlyEarnings[peakIndex];
  const peakLabel = peakItem ? `${peakItem.label} • ${formatPesoCompact(peakItem.value)}` : '';
  const yTicks = [1, 0.75, 0.5, 0.25, 0].map((ratio) => ({
    y: yPadding + (1 - ratio) * (chartHeight - yPadding * 2),
    label: formatPesoCompact(maxGraph * ratio),
  }));
  const peakLabelWidth = 118;
  const peakLabelHeight = 22;
  const peakLabelX = peakPoint
    ? Math.min(Math.max(peakPoint.x - peakLabelWidth / 2, chartLeft), chartWidth - chartRight - peakLabelWidth)
    : chartLeft;
  const peakLabelY = peakPoint ? Math.max(yPadding - 6, peakPoint.y - 34) : yPadding;

  // Consultations per month chart
  const consultValues = consultationsPerMonth.map((item) => Number(item.value ?? 0));
  const maxConsult = Math.max(1, ...consultValues);
  const consultUsableWidth = Math.max(40, consultChartWidth - chartLeft - chartRight);
  const consultSegment = consultationsPerMonth.length > 1 ? consultUsableWidth / (consultationsPerMonth.length - 1) : consultUsableWidth;
  const consultPoints = consultationsPerMonth.map((item, idx) => {
    const x = chartLeft + idx * consultSegment;
    const ratio = maxConsult <= 0 ? 0 : Number(item.value ?? 0) / maxConsult;
    const y = yPadding + (1 - ratio) * (chartHeight - yPadding * 2);
    return { x, y, value: Number(item.value ?? 0) };
  });
  const consultLineSegments = consultPoints.slice(0, -1).map((from, idx) => {
    const to = consultPoints[idx + 1];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    return {
      key: `c-${consultationsPerMonth[idx]?.key ?? idx}-${consultationsPerMonth[idx + 1]?.key ?? idx + 1}`,
      x: from.x, y: from.y, length, angle,
    };
  });
  const consultPeakIndex = consultValues.reduce((best, v, i, arr) => (v > arr[best] ? i : best), 0);
  const consultPeakPoint = consultPoints[consultPeakIndex];
  const consultPeakItem = consultationsPerMonth[consultPeakIndex];
  // Integer Y-axis ticks (0 to maxConsult)
  const consultTickStep = maxConsult <= 10 ? 1 : Math.ceil(maxConsult / 8);
  const consultYTicks: { y: number; label: string }[] = [];
  for (let v = 0; v <= maxConsult; v += consultTickStep) {
    consultYTicks.push({
      y: yPadding + (1 - v / maxConsult) * (chartHeight - yPadding * 2),
      label: String(v),
    });
  }
  // Area fill strips (interpolated vertical lines from line y to chart bottom)
  const consultFillStrips: { x: number; y: number }[] = [];
  const FILL_STEP = 3;
  const consultChartBottom = chartHeight - yPadding;
  for (let i = 0; i < consultPoints.length - 1; i++) {
    const from = consultPoints[i];
    const to = consultPoints[i + 1];
    const steps = Math.max(1, Math.ceil((to.x - from.x) / FILL_STEP));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      consultFillStrips.push({ x: from.x + t * (to.x - from.x), y: from.y + t * (to.y - from.y) });
    }
  }
  const consultPeakLabelX = consultPeakPoint
    ? Math.min(Math.max(consultPeakPoint.x - peakLabelWidth / 2, chartLeft), consultChartWidth - chartRight - peakLabelWidth)
    : chartLeft;
  const consultPeakLabelY = consultPeakPoint ? Math.max(yPadding - 6, consultPeakPoint.y - 34) : yPadding;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      showsVerticalScrollIndicator={false}
    >
      {liveAlert ? (
        <Animated.View entering={FadeInDown.duration(300)} exiting={FadeOutUp.duration(250)} style={[styles.liveAlertBanner, liveAlert.type === 'message' ? styles.liveAlertMessage : styles.liveAlertConsultation]}>
          <Ionicons name={liveAlert.type === 'message' ? 'chatbubble-ellipses' : 'notifications'} size={18} color="#fff" />
          <Text style={styles.liveAlertText} numberOfLines={1}>{liveAlert.message}</Text>
          <TouchableOpacity onPress={() => setLiveAlert(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={16} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
        </Animated.View>
      ) : null}

      <View style={styles.headerRow}>
        {avatarUri && !avatarLoadFailed ? (
          <Image
            source={{ uri: avatarUri }}
            style={styles.avatar}
            onError={() => setAvatarLoadFailed(true)}
          />
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{avatarLetter}</Text>
          </View>
        )}
        <View>
          <Text style={styles.welcomeText}>Welcome back,</Text>
          <Text style={styles.username}>{displayName}</Text>
        </View>
        <TouchableOpacity style={styles.bellButton} onPress={handleOpenNotifications}>
          <Ionicons name="notifications-outline" size={20} color={Colors.primary} />
          {notifCount > 0 && (
            <View style={styles.bellBadge}>
              <Text style={styles.bellBadgeText}>{notifCount > 99 ? '99+' : notifCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <AnimatedBorderCard
        style={styles.bannerShell}
        contentStyle={styles.banner}
        borderRadius={24}
        borderWidth={1.2}
        borderBaseColor="rgba(183, 206, 237, 0.55)"
        contentBackgroundColor={Colors.primaryDark}
      >
        <BrandLogo
          size={56}
          title="LexConnect"
          subtitle="Professional tools for client consultations"
          align="left"
        />
        <View style={styles.bannerBadge}>
          <Text style={styles.bannerBadgeText}>LAWYER PORTAL</Text>
        </View>
      </AnimatedBorderCard>

      <Animated.View entering={FadeInDown.duration(300).delay(60)} style={styles.quickActionRow}>
        <QuickActionTile icon="briefcase-outline" label="Cases" description="Review pending requests" onPress={() => router.push('/(lawyer)/consultations')} />
        <QuickActionTile icon="chatbubbles-outline" label="Messages" description="Answer client inbox" onPress={() => router.push('/(lawyer)/messages')} />
        <QuickActionTile icon="calendar-outline" label="Availability" description="Update your schedule" onPress={() => router.push('/(lawyer)/availability')} />
        <QuickActionTile icon="cash-outline" label="Earnings" description="Check revenue summary" onPress={() => router.push('/(lawyer)/earnings')} />
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(300).delay(70)} style={styles.workModeCard}>
        <View style={styles.workModeHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.workModeEyebrow}>WORK STATUS</Text>
            <Text style={styles.workModeTitle}>Set how clients should reach you</Text>
            <Text style={styles.workModeDesc}>
              Keep your schedule clear with a visible status that matches your current workload.
            </Text>
          </View>
          <View style={[styles.workModeBadge, workMode === 'busy' ? styles.workModeBadgeBusy : workMode === 'offline' ? styles.workModeBadgeOffline : styles.workModeBadgeActive]}>
            <Text style={styles.workModeBadgeText}>{workModeLabel}</Text>
          </View>
        </View>

        <View style={styles.workModeChips}>
          {[
            { key: 'active', label: 'Active', icon: 'pulse-outline' as const },
            { key: 'busy', label: 'Busy', icon: 'time-outline' as const },
            { key: 'offline', label: 'Offline', icon: 'moon-outline' as const },
          ].map((option) => {
            const selected = workMode === option.key;
            return (
              <TouchableOpacity
                key={option.key}
                style={[styles.workModeChip, selected && styles.workModeChipActive]}
                onPress={() => openAvailability(option.key)}
                activeOpacity={0.9}
              >
                <Ionicons
                  name={option.icon}
                  size={13}
                  color={selected ? '#fff' : Colors.textMuted}
                />
                <Text style={[styles.workModeChipText, selected && styles.workModeChipTextActive]}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.workModeFooter}>
          <Text style={styles.workModeFooterText}>Current mode: {workModeLabel}</Text>
          <TouchableOpacity onPress={() => openAvailability(workMode)}>
            <Text style={styles.workModeFooterLink}>Set current status</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(300).delay(80)} style={styles.todayCard}>
          <View style={styles.todayHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.todayEyebrow}>SCHEDULE FIRST</Text>
              <Text style={styles.todayTitle}>Today&apos;s focus</Text>
              <Text style={styles.todayDesc}>
                Keep availability, consultations, and inbox replies in one place so bookings stay organized.
              </Text>
            </View>
          <View style={styles.todayBadge}>
            <Ionicons name="calendar-outline" size={16} color="#fff" />
          </View>
        </View>
        <View style={styles.todayStatsRow}>
          <View style={styles.todayStat}>
            <Text style={styles.todayStatValue}>{pending}</Text>
            <Text style={styles.todayStatLabel}>Pending</Text>
          </View>
          <View style={styles.todayDivider} />
          <View style={styles.todayStat}>
            <Text style={styles.todayStatValue}>{upcoming}</Text>
            <Text style={styles.todayStatLabel}>Upcoming</Text>
          </View>
          <View style={styles.todayDivider} />
          <View style={styles.todayStat}>
            <Text style={styles.todayStatValue}>{clients}</Text>
            <Text style={styles.todayStatLabel}>Clients</Text>
          </View>
        </View>
          <View style={styles.todayInfoPill}>
            <Ionicons name="time-outline" size={13} color={Colors.primaryDark} />
            <Text style={styles.todayInfoText}>
              Next session: {formatSessionLabel(data?.next_consultation?.scheduled_at ?? data?.upcoming_consultations?.[0]?.scheduled_at ?? null)}
            </Text>
          </View>
        <View style={styles.todayActions}>
          <TouchableOpacity style={styles.todayPrimaryBtn} onPress={() => openAvailability(workMode)}>
            <Text style={styles.todayPrimaryText}>Set current status</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.todayGhostBtn} onPress={() => router.push('/(lawyer)/consultations')}>
            <Text style={styles.todayGhostText}>Open consultations</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(300).delay(90)} style={styles.priorityCard}>
        <View style={styles.priorityHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.priorityEyebrow}>TODAY&apos;S QUEUE</Text>
            <Text style={styles.priorityTitle}>Priority conversations</Text>
            <Text style={styles.priorityDesc}>
              Focus on the threads that need a reply, the consultations that need action, and the dates that are blocked.
            </Text>
          </View>
          <TouchableOpacity style={styles.priorityBadge} onPress={() => router.push('/(lawyer)/messages')}>
            <Text style={styles.priorityBadgeText}>{Number(data?.unread_messages ?? 0)} unread</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.priorityRow}>
          <View style={styles.priorityItem}>
            <Text style={styles.priorityValue}>{Number(data?.pending_consultations?.length ?? pending)}</Text>
            <Text style={styles.priorityLabel}>Pending</Text>
          </View>
          <View style={styles.priorityItem}>
            <Text style={styles.priorityValue}>{Number(data?.unread_messages ?? 0)}</Text>
            <Text style={styles.priorityLabel}>Unread</Text>
          </View>
          <View style={styles.priorityItem}>
            <Text style={styles.priorityValue}>{Number(data?.blocked_dates?.length ?? 0)}</Text>
            <Text style={styles.priorityLabel}>Blocked</Text>
          </View>
        </View>

        <View style={styles.priorityActions}>
          <TouchableOpacity style={styles.priorityPrimaryBtn} onPress={() => router.push('/(lawyer)/messages')}>
            <Text style={styles.priorityPrimaryText}>Open inbox</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.priorityGhostBtn} onPress={() => router.push('/(lawyer)/consultations')}>
            <Text style={styles.priorityGhostText}>Review requests</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(300).delay(100)} style={styles.pinnedCard}>
        <View style={styles.pinnedHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.pinnedEyebrow}>PINNED CLIENTS</Text>
            <Text style={styles.pinnedTitle}>Keep priority threads close</Text>
            <Text style={styles.pinnedDesc}>
              Use this as a small worklist for consultations you do not want to miss.
            </Text>
          </View>
          <TouchableOpacity style={styles.pinnedBadge} onPress={() => router.push('/(lawyer)/consultations')}>
            <Text style={styles.pinnedBadgeText}>{pinnedClients.length}</Text>
          </TouchableOpacity>
        </View>

        {pinnedClients.length === 0 ? (
          <Text style={styles.pinnedEmpty}>No priority clients yet.</Text>
        ) : (
          <View style={styles.pinnedList}>
            {pinnedClients.map((item: any, index: number) => {
              const clientName = item?.client?.name ?? item?.client_name ?? 'Client';
              const isUpcoming = String(item?.status ?? '').toLowerCase() === 'upcoming';
              return (
                <TouchableOpacity
                  key={String(item?.id ?? index)}
                  style={styles.pinnedItem}
                  onPress={() => router.push('/(lawyer)/consultations')}
                  activeOpacity={0.88}
                >
                  <View style={styles.pinnedAvatar}>
                    <Text style={styles.pinnedAvatarText}>{clientName.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pinnedName} numberOfLines={1}>{clientName}</Text>
                    <Text style={styles.pinnedMeta} numberOfLines={1}>
                      {item?.code ?? 'Consultation'} · {formatSessionLabel(item?.scheduled_at ?? item?.created_at ?? null)}
                    </Text>
                  </View>
                  <View style={[styles.pinnedStatus, isUpcoming ? styles.pinnedStatusUpcoming : styles.pinnedStatusPending]}>
                    <Text style={[styles.pinnedStatusText, isUpcoming ? styles.pinnedStatusTextUpcoming : styles.pinnedStatusTextPending]}>
                      {isUpcoming ? 'Upcoming' : 'Pending'}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(300).delay(100)}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statScroller} contentContainerStyle={styles.statCardsRow}>
        <StatCard label="Pending Requests" value={pending} color={Colors.warning} icon="hourglass-half" onPress={() => router.push('/(lawyer)/consultations')} />
        <StatCard label="Upcoming Sessions" value={upcoming} color={Colors.upcoming} icon="calendar-alt" onPress={() => router.push('/(lawyer)/consultations')} />
        <StatCard label="Total Clients" value={clients} color={Colors.primary} icon="user-friends" onPress={() => router.push('/(lawyer)/consultations')} />
        <StatCard label="Total Earned" value={`₱${Number(totalEarned).toLocaleString('en-PH', { minimumFractionDigits: 0 })}`} color={Colors.success} icon="money-bill-wave" />
        </ScrollView>
      </Animated.View>

      <AnimatedBorderCard style={styles.graphShell} contentStyle={styles.graphCard} borderRadius={16} borderWidth={1.1}>
        <View style={styles.graphHeader}>
          <View style={styles.graphTitleRow}>
            <Ionicons name="analytics-outline" size={18} color={Colors.primaryDark} />
            <Text style={styles.graphTitle}>Monthly Earnings</Text>
          </View>
          <Text style={styles.graphHint}>Last 12 months</Text>
        </View>

        <View style={styles.graphCanvasWrap} onLayout={(event) => setChartWidth(event.nativeEvent.layout.width)}>
          {chartWidth > 0 ? (
            <Animated.View style={[styles.graphAnimatedLayer, chartPulseStyle]}>
              {yTicks.map((tick, idx) => (
                <View
                  key={`grid-${idx}`}
                  style={[
                    styles.graphGridLine,
                    {
                      left: chartLeft,
                      width: chartWidth - chartLeft - chartRight,
                      top: tick.y,
                    },
                  ]}
                />
              ))}
              {yTicks.map((tick, idx) => (
                <Text
                  key={`y-label-${idx}`}
                  style={[
                    styles.graphYLabel,
                    {
                      top: tick.y - 8,
                      left: 0,
                      width: chartLeft - 8,
                    },
                  ]}
                >
                  {tick.label}
                </Text>
              ))}
              {lineSegments.map((segmentItem) => (
                <View
                  key={segmentItem.key}
                  style={[
                    styles.graphSegment,
                    {
                      left: segmentItem.x,
                      top: segmentItem.y,
                      width: segmentItem.length,
                      transform: [{ rotateZ: `${segmentItem.angle}rad` }],
                    },
                  ]}
                />
              ))}
              {points.map((point, idx) => {
                const isPeak = idx === peakIndex;
                return (
                  <View
                    key={`point-${monthlyEarnings[idx]?.key ?? idx}`}
                    style={[
                      styles.graphPoint,
                      isPeak && styles.graphPointPeak,
                      {
                        left: point.x - (isPeak ? 5.5 : 4),
                        top: point.y - (isPeak ? 5.5 : 4),
                      },
                    ]}
                  />
                );
              })}
              {peakPoint && peakLabel ? (
                <View
                  style={[
                    styles.peakLabelBubble,
                    {
                      left: peakLabelX,
                      top: peakLabelY,
                      width: peakLabelWidth,
                      height: peakLabelHeight,
                    },
                  ]}
                >
                  <Text style={styles.peakLabelText}>
                    {peakLabel}
                  </Text>
                </View>
              ) : null}

              {peakPoint ? (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.peakPulseRing,
                    { left: peakPoint.x - 9, top: peakPoint.y - 9 },
                    peakPulseStyle,
                  ]}
                />
              ) : null}
            </Animated.View>
          ) : null}
        </View>

        <View style={styles.graphFooterRow}>
          {monthlyEarnings.map((item, idx) => (
            <View key={item.key} style={styles.graphMonthCell}>
              <Text style={[styles.graphMonthLabel, idx % 2 !== 0 && styles.graphMonthMuted]}>{item.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.graphSummaryRow}>
          <Text style={styles.graphSummaryLabel}>Peak month</Text>
          <Text style={styles.graphSummaryValue}>{peakItem ? `${peakItem.label} • ${formatPhp(peakItem.value)}` : formatPhp(0)}</Text>
        </View>
      </AnimatedBorderCard>

      {/* Consultations per Month chart */}
      <AnimatedBorderCard style={styles.graphShell} contentStyle={styles.graphCard} borderRadius={16} borderWidth={1.1}>
        <View style={styles.graphHeaderStacked}>
          <View style={styles.graphTitleRow}>
            <Ionicons name="calendar-outline" size={18} color={Colors.primaryDark} />
            <Text style={styles.graphTitle}>Consultations per Month</Text>
          </View>
          <Text style={styles.graphHint}>Completed · Last 12 months</Text>
        </View>

        <View style={styles.graphCanvasWrap} onLayout={(event) => setConsultChartWidth(event.nativeEvent.layout.width)}>
          {consultChartWidth > 0 ? (
            <View style={[styles.graphAnimatedLayer]}>
              {consultYTicks.map((tick, idx) => (
                <View key={`cg-${idx}`} style={[styles.graphGridLine, { left: chartLeft, width: consultChartWidth - chartLeft - chartRight, top: tick.y }]} />
              ))}
              {consultYTicks.map((tick, idx) => (
                <Text key={`cy-${idx}`} style={[styles.graphYLabel, { top: tick.y - 8, left: 0, width: chartLeft - 8 }]}>{tick.label}</Text>
              ))}
              {/* Area fill */}
              {consultFillStrips.map((strip, idx) => (
                <View key={`cf-${idx}`} style={{ position: 'absolute', left: strip.x, top: strip.y, width: FILL_STEP + 1, height: Math.max(0, consultChartBottom - strip.y), backgroundColor: 'rgba(59,130,246,0.10)' }} />
              ))}
              {consultLineSegments.map((seg) => (
                <View key={seg.key} style={[styles.graphSegment, styles.consultSegment, { left: seg.x, top: seg.y, width: seg.length, transform: [{ rotateZ: `${seg.angle}rad` }] }]} />
              ))}
              {consultPoints.map((pt, idx) => {
                const isPeak = idx === consultPeakIndex;
                return (
                  <View key={`cp-${consultationsPerMonth[idx]?.key ?? idx}`} style={[styles.graphPoint, styles.consultPoint, isPeak && styles.consultPointPeak, { left: pt.x - (isPeak ? 5.5 : 4), top: pt.y - (isPeak ? 5.5 : 4) }]} />
                );
              })}
              {consultPeakPoint && consultPeakItem ? (
                <View style={[styles.peakLabelBubble, styles.consultPeakBubble, { left: consultPeakLabelX, top: consultPeakLabelY, width: peakLabelWidth, height: peakLabelHeight }]}>
                  <Text style={styles.peakLabelText}>{consultPeakItem.label} · {consultPeakItem.value}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        <View style={styles.graphFooterRow}>
          {consultationsPerMonth.map((item, idx) => (
            <View key={item.key} style={styles.graphMonthCell}>
              <Text style={[styles.graphMonthLabel, idx % 2 !== 0 && styles.graphMonthMuted]}>{item.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.graphSummaryRow}>
          <Text style={styles.graphSummaryLabel}>Peak month</Text>
          <Text style={styles.graphSummaryValue}>
            {consultPeakItem && consultPeakItem.value > 0 ? `${consultPeakItem.label} · ${consultPeakItem.value} consultations` : 'No data yet'}
          </Text>
        </View>
      </AnimatedBorderCard>

      {(data?.unread_messages ?? 0) > 0 ? (
        <TouchableOpacity style={styles.alertCard} onPress={() => router.push('/(lawyer)/messages')}>
          <Ionicons name="chatbubbles" size={20} color="#fff" />
          <Text style={styles.alertText}>You have {data.unread_messages} unread message{data.unread_messages > 1 ? 's' : ''}</Text>
          <Ionicons name="chevron-forward" size={18} color="#fff" />
        </TouchableOpacity>
      ) : null}

      <AnimatedBorderCard style={styles.panelShell} contentStyle={styles.panelCard} borderRadius={14} borderWidth={1.1}>
        <View style={styles.panelHead}>
          <Text style={styles.panelTitle}>Pending Requests</Text>
          <TouchableOpacity onPress={() => router.push('/(lawyer)/consultations')}>
            <Text style={styles.panelAction}>View All</Text>
          </TouchableOpacity>
        </View>

        {!data?.pending_consultations?.length ? (
          <Text style={styles.panelEmpty}>No pending requests</Text>
        ) : (
          data.pending_consultations.map((c: any) => (
            <View key={c.id} style={styles.pendingCard}>
              <View style={styles.pendingTop}>
                <Text style={styles.codeText}>{c.code}</Text>
                <Text style={styles.priceText}>P{Number(c.price ?? 0).toLocaleString()}</Text>
              </View>
              <Text style={styles.clientName}>{c.client?.name ?? 'Client'}</Text>
              <Text style={styles.metaText}>{new Date(c.scheduled_at).toLocaleString()} · {c.type}</Text>
              <View style={styles.pendingActions}>
                <TouchableOpacity style={styles.declineBtn} onPress={() => handleDecline(c.id)}>
                  <Ionicons name="close-outline" size={16} color="#E53935" />
                  <Text style={styles.declineBtnText}>Decline</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.acceptBtn} onPress={() => handleAccept(c.id)}>
                  <Ionicons name="checkmark-outline" size={16} color="#fff" />
                  <Text style={styles.acceptBtnText}>Accept</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </AnimatedBorderCard>

      <LawyerBlockedDatesCard />

      <AnimatedBorderCard style={styles.tipsShell} contentStyle={styles.tipsCard} borderRadius={18} borderWidth={1.1}>
        <Text style={styles.tipsTitle}>At a Glance</Text>
        <View style={styles.tipRow}>
          <Ionicons name="people-outline" size={15} color={Colors.primary} />
          <Text style={styles.tipText}>Total clients handled: {clients}</Text>
        </View>
        <View style={styles.tipRow}>
          <Ionicons name="cash-outline" size={15} color={Colors.primary} />
          <Text style={styles.tipText}>Total earned: {formatPhp(Number(data?.total_earned ?? 0))}</Text>
        </View>
      </AnimatedBorderCard>
    </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { paddingHorizontal: 18, paddingBottom: 120 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: Colors.primaryLight,
    marginRight: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#D9E4FF',
  },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 20 },
  welcomeText: { color: Colors.textMuted, fontSize: 14 },
  username: { color: Colors.text, fontWeight: '800', fontSize: 24 },
  bellButton: {
    marginLeft: 'auto',
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  bellBadge: {
    position: 'absolute',
    top: 7,
    right: 7,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#E74C3C',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  bellBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  bannerShell: {
    marginBottom: 18,
  },
  banner: {
    backgroundColor: Colors.primaryDark,
    borderRadius: 24,
    padding: 20,
  },
  bannerBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 8,
  },
  bannerBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  quickActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 18,
  },
  quickActionTile: {
    width: '48.5%',
    minHeight: 106,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E7ECF3',
    padding: 14,
    shadowColor: '#102042',
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
    color: Colors.primaryDark,
    fontSize: 14,
    fontWeight: '900',
  },
  quickActionDesc: {
    color: Colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  workModeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E6ECF5',
    padding: 16,
    gap: 12,
    shadowColor: Colors.primaryDark,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  workModeHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  workModeEyebrow: {
    color: '#7B879C',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 4,
  },
  workModeTitle: { color: Colors.text, fontSize: 16, fontWeight: '800' },
  workModeDesc: { color: Colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  workModeBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  workModeBadgeActive: { backgroundColor: '#DCFCE7' },
  workModeBadgeBusy: { backgroundColor: '#FEF3C7' },
  workModeBadgeOffline: { backgroundColor: '#E5E7EB' },
  workModeBadgeText: { fontSize: 11, fontWeight: '800', color: Colors.text },
  workModeChips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  workModeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#F7FAFF',
    borderWidth: 1,
    borderColor: '#E4EAF4',
  },
  workModeChipActive: {
    backgroundColor: Colors.primaryDark,
    borderColor: Colors.primaryDark,
  },
  workModeChipText: { color: Colors.textMuted, fontSize: 12, fontWeight: '700' },
  workModeChipTextActive: { color: '#fff' },
  workModeFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  workModeFooterText: { color: Colors.textMuted, fontSize: 12, flex: 1 },
  workModeFooterLink: { color: Colors.primaryDark, fontSize: 12, fontWeight: '800' },
  priorityCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E6ECF5',
    padding: 16,
    gap: 12,
    shadowColor: Colors.primaryDark,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  priorityHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  priorityEyebrow: { color: '#7B879C', fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 4 },
  priorityTitle: { color: Colors.text, fontSize: 16, fontWeight: '800' },
  priorityDesc: { color: Colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  priorityBadge: {
    backgroundColor: '#EEF4FF',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  priorityBadgeText: { color: Colors.primaryDark, fontSize: 11, fontWeight: '800' },
  priorityRow: { flexDirection: 'row', gap: 8 },
  priorityItem: {
    flex: 1,
    backgroundColor: '#F7FAFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E4EAF4',
    alignItems: 'center',
    paddingVertical: 12,
  },
  priorityValue: { color: Colors.primaryDark, fontSize: 18, fontWeight: '900' },
  priorityLabel: { color: Colors.textMuted, fontSize: 11, fontWeight: '700', marginTop: 2 },
  priorityActions: { flexDirection: 'row', gap: 10 },
  priorityPrimaryBtn: {
    flex: 1,
    backgroundColor: Colors.primaryDark,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
  },
  priorityPrimaryText: { color: '#fff', fontWeight: '900', fontSize: 13 },
  priorityGhostBtn: {
    flex: 1,
    backgroundColor: '#F8FAFD',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D9E2F2',
    paddingVertical: 11,
    alignItems: 'center',
  },
  priorityGhostText: { color: Colors.primaryDark, fontWeight: '900', fontSize: 13 },
  pinnedCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E6ECF5',
    padding: 16,
    gap: 12,
    shadowColor: Colors.primaryDark,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  pinnedHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  pinnedEyebrow: { color: '#7B879C', fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 4 },
  pinnedTitle: { color: Colors.text, fontSize: 16, fontWeight: '800' },
  pinnedDesc: { color: Colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  pinnedBadge: {
    backgroundColor: '#EEF4FF',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  pinnedBadgeText: { color: Colors.primaryDark, fontSize: 11, fontWeight: '800' },
  pinnedEmpty: { color: Colors.textMuted, fontSize: 12 },
  pinnedList: { gap: 8 },
  pinnedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F8FAFD',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5ECF5',
    padding: 12,
  },
  pinnedAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryDark,
  },
  pinnedAvatarText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  pinnedName: { color: Colors.text, fontSize: 13, fontWeight: '800' },
  pinnedMeta: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  pinnedStatus: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pinnedStatusUpcoming: { backgroundColor: '#DCFCE7' },
  pinnedStatusPending: { backgroundColor: '#FEF3C7' },
  pinnedStatusText: { fontSize: 10, fontWeight: '800' },
  pinnedStatusTextUpcoming: { color: '#16A34A' },
  pinnedStatusTextPending: { color: '#D97706' },
  todayCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E8EDF5',
    padding: 16,
    shadowColor: '#1E2D4D',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    marginBottom: 18,
  },
  todayHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  todayEyebrow: {
    color: Colors.warning,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  todayTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 2,
  },
  todayDesc: {
    color: Colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  todayBadge: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryDark,
  },
  todayStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
  },
  todayStat: {
    flex: 1,
    alignItems: 'center',
  },
  todayStatValue: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  todayStatLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  todayDivider: {
    width: 1,
    height: 36,
    backgroundColor: '#E8EDF5',
  },
  todayInfoPill: {
    marginTop: 14,
    backgroundColor: '#F8FAFD',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8EDF5',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  todayInfoText: {
    flex: 1,
    color: Colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  todayActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  todayPrimaryBtn: {
    flex: 1,
    backgroundColor: Colors.primaryDark,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
  },
  todayPrimaryText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 13,
  },
  todayGhostBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D9E2F2',
    paddingVertical: 11,
    alignItems: 'center',
    backgroundColor: '#F8FAFD',
  },
  todayGhostText: {
    color: Colors.primaryDark,
    fontWeight: '900',
    fontSize: 13,
  },
  statScroller: { flexGrow: 0, marginHorizontal: -18, marginBottom: 20 },
  statCardsRow: { paddingHorizontal: 18, gap: 12, paddingBottom: 3 },
  statCard: {
    width: 250,
    minHeight: 104,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7ECF3',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#102042',
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
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
  statValue: { color: Colors.primaryDark, fontWeight: '900', fontSize: 24, marginBottom: 3 },
  statLabel: { color: Colors.textMuted, fontSize: 13, fontWeight: '800', lineHeight: 17 },
  graphShell: { marginBottom: 14 },
  graphCard: { backgroundColor: '#fff', borderRadius: 16, padding: 14 },
  graphHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  graphHeaderStacked: { flexDirection: 'column', marginBottom: 8 },
  graphTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  graphTitle: { fontSize: 18, fontWeight: '800', color: Colors.primaryDark },
  graphHint: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
  graphCanvasWrap: { width: '100%', minHeight: 190 },
  graphAnimatedLayer: { width: '100%', height: 190, position: 'relative' },
  graphGridLine: {
    position: 'absolute',
    height: 1,
    backgroundColor: '#E8EDF4',
  },
  graphYLabel: {
    position: 'absolute',
    textAlign: 'right',
    fontSize: 11,
    color: '#7C889A',
    fontWeight: '700',
  },
  graphSegment: {
    position: 'absolute',
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.primaryDark,
    transformOrigin: 'left center',
  },
  graphPoint: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#C99511',
    borderWidth: 2,
    borderColor: '#fff',
  },
  graphPointPeak: {
    width: 11,
    height: 11,
    borderRadius: 5.5,
    backgroundColor: '#B8870A',
  },
  peakLabelBubble: {
    position: 'absolute',
    borderRadius: 11,
    backgroundColor: '#1A305C',
    opacity: 0.95,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  peakLabelText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
  },
  peakPulseRing: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#C99511',
    backgroundColor: 'rgba(201, 149, 17, 0.12)',
  },
  graphFooterRow: { flexDirection: 'row', marginTop: 2 },
  graphMonthCell: { flex: 1, alignItems: 'center' },
  graphMonthLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: '700' },
  graphMonthMuted: { opacity: 0.45 },
  graphSummaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#EDF2F8' },
  graphSummaryLabel: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
  graphSummaryValue: { fontSize: 15, color: Colors.primaryDark, fontWeight: '800' },
  consultSegment: { backgroundColor: '#2563EB' },
  consultPoint: { backgroundColor: '#1e2d4d', borderColor: '#fff' },
  consultPointPeak: { width: 11, height: 11, borderRadius: 5.5, backgroundColor: '#1e2d4d' },
  consultPeakBubble: { backgroundColor: '#1e3a8a' },
  liveAlertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  liveAlertMessage: { backgroundColor: '#1B3A6B' },
  liveAlertConsultation: { backgroundColor: '#B45309' },
  liveAlertText: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '700' },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.info,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  alertText: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '700' },
  panelShell: {
    marginBottom: 12,
  },
  panelCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
  },
  panelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10 },
  panelTitle: { color: Colors.primaryDark, fontWeight: '800', fontSize: 24 },
  panelAction: { color: Colors.primary, fontWeight: '700', fontSize: 13 },
  panelEmpty: { color: Colors.textMuted, fontSize: 14 },
  pendingCard: {
    backgroundColor: '#F8FAFD',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E3EAF3',
    padding: 12,
    marginBottom: 10,
  },
  pendingTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  codeText: { fontSize: 12, fontWeight: '800', color: Colors.primary },
  priceText: { fontSize: 14, fontWeight: '800', color: Colors.success },
  clientName: { fontSize: 15, fontWeight: '800', color: Colors.text, marginTop: 6 },
  metaText: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },
  pendingActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  declineBtn: {
    flex: 1,
    borderWidth: 1.4,
    borderColor: '#FF8A80',
    backgroundColor: '#FFF4F3',
    borderRadius: 11,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  declineBtnText: { color: '#D84343', fontWeight: '800', fontSize: 13 },
  acceptBtn: {
    flex: 1.3,
    backgroundColor: Colors.primary,
    borderRadius: 11,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
    shadowColor: Colors.primary,
    shadowOpacity: 0.24,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  acceptBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  tipsShell: {
    marginTop: 8,
  },
  tipsCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 17,
  },
  tipsTitle: { color: Colors.text, fontWeight: '800', fontSize: 15, marginBottom: 10 },
  tipRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  tipText: { color: Colors.textMuted, fontSize: 13, marginLeft: 8, flex: 1 },
});
