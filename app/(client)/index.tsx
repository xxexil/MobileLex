import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import Animated, {
  FadeInDown,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Colors, RoleColors } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useNotifications } from '@/context/notifications';
import { clientApi } from '@/services/api';
import { resolveStorageUrl } from '@/services/endpoints';
import DashboardPopupBanner from '@/components/DashboardPopupBanner';

const NOTIF_SEEN_KEY = 'client_notifications_seen_at';
const SAVED_LAWYERS_KEY = 'client_saved_lawyers_v1';

type ConsultationStatus = 'upcoming' | 'completed' | 'cancelled' | 'expired';

type ConsultationItem = {
  id: number;
  code?: string;
  scheduled_at?: string;
  status?: string;
  type?: string;
  lawyer?: { id?: number; name?: string };
};

type PaymentItem = {
  id: number;
  amount?: number;
  status?: string;
  created_at?: string;
  paid_at?: string;
  type?: string;
  consultation?: {
    code?: string;
    service_type?: string;
    consultation_type?: string;
    lawyer?: { name?: string };
  };
  lawyer?: { name?: string };
};

type LawyerItem = {
  id: number;
  name?: string;
  hourly_rate?: number;
  specialty?: string;
  location?: string;
};

type DashboardPayload = {
  stats?: {
    total?: number;
    upcoming?: number;
    completed?: number;
    cancelled?: number;
  };
  total_spent?: number;
  unread_messages?: number;
  upcoming_consultations?: ConsultationItem[];
};

type StatCardProps = {
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
  value: number;
  label: string;
  sublabel: string;
  onPress?: () => void;
};

function formatMoney(value: number) {
  return `P${Number.isFinite(value) ? value.toLocaleString('en-PH') : '0'}`;
}

function formatShortDate(value?: string) {
  if (!value) return 'No date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No date';
  return date.toLocaleDateString('en-PH', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });
}

function formatShortTime(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function normalizePaymentStatus(status?: string) {
  const value = String(status ?? '').toLowerCase();
  if (value.includes('refund')) return 'Refunded';
  if (value.includes('pending') || value.includes('processing')) return 'Pending';
  if (value.includes('paid') || value.includes('downpayment')) return 'Paid';
  if (value.includes('fail')) return 'Failed';
  return 'Payment';
}

function getActivityLines(consultations: ConsultationItem[], unreadMessages: number, paymentCount: number) {
  const activity: Array<{ id: string; title: string; meta: string }> = [];

  if (consultations.length > 0) {
    const next = consultations[0];
    activity.push({
      id: `consult-${next.id}`,
      title: next.lawyer?.name ? `Upcoming with ${next.lawyer.name}` : 'Upcoming consultation',
      meta: `${formatShortDate(next.scheduled_at)} ${formatShortTime(next.scheduled_at)}`.trim(),
    });
  }

  if (unreadMessages > 0) {
    activity.push({
      id: 'messages',
      title: `${unreadMessages} unread message${unreadMessages === 1 ? '' : 's'}`,
      meta: 'Open your inbox to reply',
    });
  }

  if (paymentCount > 0) {
    activity.push({
      id: 'payments',
      title: `${paymentCount} recent payment${paymentCount === 1 ? '' : 's'}`,
      meta: 'Review your payment history',
    });
  }

  return activity.slice(0, 3);
}

function StatCard({ icon, iconBg, iconColor, value, label, sublabel, onPress }: StatCardProps) {
  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={styles.statCard}>
      <View style={[styles.statIconWrap, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={24} color={iconColor} />
      </View>
      <View style={styles.statTextWrap}>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={styles.statSublabel}>{sublabel}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function ClientDashboardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { unreadActivityCount, activities, markAllActivitiesRead } = useNotifications();
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [consultations, setConsultations] = useState<ConsultationItem[]>([]);
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [lawyers, setLawyers] = useState<LawyerItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [appointmentTab, setAppointmentTab] = useState<ConsultationStatus>('upcoming');
  const [isSlidingRate, setIsSlidingRate] = useState(false);
  const [slidingMaxRate, setSlidingMaxRate] = useState<number | null>(null);
  const [selectedSpecialty, setSelectedSpecialty] = useState('All');
  const [selectedLocation, setSelectedLocation] = useState('All');
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [minRateInput, setMinRateInput] = useState('0');
  const [maxRateInput, setMaxRateInput] = useState('1000');
  const [minExperience, setMinExperience] = useState(0);
  const [minRating, setMinRating] = useState(0);
  const [availabilityFilter, setAvailabilityFilter] = useState('Any');
  const [savedLawyerCount, setSavedLawyerCount] = useState(0);
  const sliderWidthRef = useRef(0);
  const maxRateRef = useRef<number | null>(null);
  const isSlidingRateRef = useRef(false);

  const rateBounds = useMemo(() => {
    const values = lawyers
      .map((item) => Number(item.hourly_rate ?? 0))
      .filter((value) => Number.isFinite(value) && value > 0)
      .sort((a, b) => a - b);

    if (values.length === 0) {
      return { min: 500, max: 10000 };
    }

    return { min: values[0], max: values[values.length - 1] };
  }, [lawyers]);

  const [maxRate, setMaxRate] = useState<number | null>(null);

  const specialtyOptions = useMemo(() => {
    const values = lawyers
      .map((item) => String(item.specialty ?? '').trim())
      .filter((value) => value.length > 0);
    return ['All', ...Array.from(new Set(values)).sort((a, b) => a.localeCompare(b))];
  }, [lawyers]);

  const locationOptions = useMemo(() => {
    const values = lawyers
      .map((item) => String(item.location ?? '').trim())
      .filter((value) => value.length > 0);
    return ['All', ...Array.from(new Set(values)).sort((a, b) => a.localeCompare(b))];
  }, [lawyers]);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(SAVED_LAWYERS_KEY)
      .then((value) => {
        if (!mounted || !value) return;
        try {
          const parsed = JSON.parse(value);
          if (Array.isArray(parsed)) {
            const ids = parsed.map((item) => Number(item)).filter((item) => Number.isFinite(item));
            setSavedLawyerCount(new Set(ids).size);
          }
        } catch {
          setSavedLawyerCount(0);
        }
      })
      .catch(() => {
        setSavedLawyerCount(0);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const loadDashboard = useCallback(async () => {
    try {
      const tasks = await Promise.allSettled([
        clientApi.dashboard(),
        clientApi.consultations(),
        clientApi.payments(),
        clientApi.lawyers({ sort: 'rate_asc', max_rate: 999999 }),
      ]);

      const dashboardTask = tasks[0];
      const consultationsTask = tasks[1];
      const paymentsTask = tasks[2];
      const lawyersTask = tasks[3];

      if (dashboardTask.status === 'fulfilled') {
        setDashboard((dashboardTask.value?.data ?? null) as DashboardPayload | null);
      } else {
        setDashboard(null);
      }

      if (consultationsTask.status === 'fulfilled') {
        const payload = consultationsTask.value?.data;
        const items = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
        setConsultations(items as ConsultationItem[]);
      } else {
        setConsultations([]);
      }

      if (paymentsTask.status === 'fulfilled') {
        const payload = paymentsTask.value?.data;
        const items = Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload?.payments?.data)
            ? payload.payments.data
            : Array.isArray(payload)
              ? payload
              : [];
        setPayments(items as PaymentItem[]);
      } else {
        setPayments([]);
      }

      if (lawyersTask.status === 'fulfilled') {
        const payload = lawyersTask.value?.data;
        const items = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
        setLawyers(items as LawyerItem[]);
      } else {
        setLawyers([]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadDashboard();
    }, [loadDashboard])
  );

  const displayName = useMemo(() => {
    const raw = user?.name?.trim();
    return raw && raw.length > 0 ? raw : 'Alex Johnson';
  }, [user?.name]);

  const avatarLetter = useMemo(() => (displayName.charAt(0) || 'A').toUpperCase(), [displayName]);
  const avatarUri = useMemo(() => {
    const raw = (user as any)?.avatar_url || (user as any)?.avatar || (user as any)?.profile_photo_url;
    return typeof raw === 'string' && raw.trim() ? resolveStorageUrl(raw.trim()) : '';
  }, [user]);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);

  const totalSpent = Number(dashboard?.total_spent ?? 0);
  const totalConsultations = Number(dashboard?.stats?.total ?? consultations.length);
  const upcomingCount = Number(
    dashboard?.stats?.upcoming
      ?? consultations.filter((item) => String(item.status ?? '').toLowerCase() === 'upcoming').length
  );
  const completedCount = consultations.filter((item) => String(item.status ?? '').toLowerCase() === 'completed').length;
  const unreadMessages = Number(dashboard?.unread_messages ?? 0);
  const bellCount = Math.min(99, Math.max(unreadMessages, unreadActivityCount, 0));
  const sliderMin = rateBounds.min;
  const sliderMax = Math.max(rateBounds.max, rateBounds.min + 1);
  const effectiveMaxRate = maxRate ?? sliderMax;
  const displayedMaxRate = slidingMaxRate ?? effectiveMaxRate;
  const sliderRatio = Math.min(1, Math.max(0, (effectiveMaxRate - sliderMin) / (sliderMax - sliderMin)));
  const sliderThumbSize = 34;
  const sliderThumbRadius = sliderThumbSize / 2;
  const sliderPosition = useSharedValue(0);
  const sliderWidthShared = useSharedValue(0);

  useEffect(() => {
    maxRateRef.current = maxRate;
  }, [maxRate]);

  const setSlidingRateState = useCallback((next: boolean) => {
    if (isSlidingRateRef.current === next) return;
    isSlidingRateRef.current = next;
    setIsSlidingRate(next);
  }, []);

  const commitRateFromPosition = useCallback((positionX: number) => {
    const width = sliderWidthRef.current;
    if (!width) return;

    const clampedX = Math.max(0, Math.min(positionX, width));
    const ratio = clampedX / width;
    const next = Math.round(sliderMin + (sliderMax - sliderMin) * ratio);
    if (maxRateRef.current === next) return;
    maxRateRef.current = next;
    setMaxRate(next);
    setSlidingMaxRate(null);
  }, [sliderMin, sliderMax]);

  const previewRateFromPosition = useCallback((positionX: number) => {
    const width = sliderWidthRef.current;
    if (!width) return;

    const clampedX = Math.max(0, Math.min(positionX, width));
    const ratio = clampedX / width;
    const next = Math.round(sliderMin + (sliderMax - sliderMin) * ratio);
    setSlidingMaxRate((current) => (current === next ? current : next));
  }, [sliderMin, sliderMax]);

  const sliderGesture = useMemo(() => Gesture.Pan()
    .minDistance(1)
    .activeOffsetX([-1, 1])
    .shouldCancelWhenOutside(false)
    .onBegin((event) => {
      const width = sliderWidthShared.value;
      if (width <= 0) return;
      const nextX = Math.max(0, Math.min(event.x, width));
      sliderPosition.value = nextX;
      runOnJS(setSlidingRateState)(true);
      runOnJS(previewRateFromPosition)(nextX);
    })
    .onUpdate((event) => {
      const width = sliderWidthShared.value;
      if (width <= 0) return;
      const nextX = Math.max(0, Math.min(event.x, width));
      sliderPosition.value = nextX;
      runOnJS(previewRateFromPosition)(nextX);
    })
    .onFinalize(() => {
      runOnJS(commitRateFromPosition)(sliderPosition.value);
      runOnJS(setSlidingRateState)(false);
    }), [commitRateFromPosition, previewRateFromPosition, setSlidingRateState, sliderPosition, sliderWidthShared]);

  const onSliderLayout = useCallback((event: { nativeEvent: { layout: { width: number } } }) => {
    const nextWidth = event.nativeEvent.layout.width;
    sliderWidthRef.current = nextWidth;
    sliderWidthShared.value = nextWidth;
    sliderPosition.value = nextWidth * sliderRatio;
  }, [sliderPosition, sliderRatio, sliderWidthShared]);

  useEffect(() => {
    sliderPosition.value = sliderWidthRef.current * sliderRatio;
  }, [sliderPosition, sliderRatio]);

  const sliderFillAnimatedStyle = useAnimatedStyle(() => ({
    width: sliderPosition.value,
  }));

  const sliderThumbAnimatedStyle = useAnimatedStyle(() => ({
    left: Math.min(
      Math.max(sliderPosition.value - sliderThumbRadius, -2),
      Math.max(-2, sliderWidthShared.value - sliderThumbSize + 2)
    ),
  }));

  React.useEffect(() => {
    setMaxRate((current) => {
      if (current == null) return sliderMax;
      const next = Math.min(sliderMax, Math.max(sliderMin, current));
      maxRateRef.current = next;
      return current === next ? current : next;
    });
  }, [sliderMax, sliderMin]);

  React.useEffect(() => {
    const next = String(effectiveMaxRate);
    setMaxRateInput((current) => (current === next ? current : next));
  }, [effectiveMaxRate]);

  const filteredAppointments = useMemo(() => {
    return consultations.filter((item) => {
      const status = String(item.status ?? '').toLowerCase();
      if (appointmentTab === 'expired') return status === 'expired';
      return status === appointmentTab;
    });
  }, [appointmentTab, consultations]);

  const paymentPreview = useMemo(() => {
    return payments
      .map((payment) => ({
        id: payment.id,
        lawyerName: payment.consultation?.lawyer?.name || payment.lawyer?.name || 'Legal Consultation',
        serviceLabel: payment.consultation?.service_type || payment.consultation?.consultation_type || 'Video Consultation',
        amount: Number(payment.amount ?? 0),
        date: formatShortDate(payment.paid_at || payment.created_at),
        statusLabel: normalizePaymentStatus(payment.status),
      }))
      .slice(0, 4);
  }, [payments]);

  const recentActivity = useMemo(() => {
    const appActivity = getActivityLines(
      dashboard?.upcoming_consultations ?? consultations,
      unreadMessages,
      paymentPreview.length
    );

    const feedActivity = activities.slice(0, 2).map((item) => ({
      id: item.id,
      title: item.title,
      meta: item.body,
    }));

    return [...feedActivity, ...appActivity].slice(0, 3);
  }, [activities, consultations, dashboard?.upcoming_consultations, paymentPreview.length, unreadMessages]);

  async function openNotifications() {
    await AsyncStorage.setItem(NOTIF_SEEN_KEY, String(Date.now()));
    markAllActivitiesRead();
    router.push('/notifications' as any);
  }

  function openSearch() {
    const parsedMinRate = Number(minRateInput);
    const parsedMaxRate = Number(maxRateInput);
    router.push({
      pathname: '/(client)/lawyers',
      params: {
        specialty: selectedSpecialty,
        location: selectedLocation,
        min_rate: Number.isFinite(parsedMinRate) && parsedMinRate > 0 ? String(parsedMinRate) : '',
        max_rate: Number.isFinite(parsedMaxRate) && parsedMaxRate > 0 ? String(parsedMaxRate) : String(effectiveMaxRate),
        min_experience: minExperience > 0 ? String(minExperience) : '',
        min_rating: minRating > 0 ? String(minRating) : '',
        availability: availabilityFilter === 'Any' ? '' : availabilityFilter,
      },
    } as any);
  }

  function clearQuickSearch() {
    setSelectedSpecialty('All');
    setSelectedLocation('All');
    setMaxRate(sliderMax);
    setSlidingMaxRate(null);
    setMinRateInput('0');
    setMaxRateInput(String(sliderMax));
    setMinExperience(0);
    setMinRating(0);
    setAvailabilityFilter('Any');
  }

  const hasQuickSearchFilters = selectedSpecialty !== 'All'
    || selectedLocation !== 'All'
    || effectiveMaxRate < sliderMax
    || Number(minRateInput) > 0
    || minExperience > 0
    || minRating > 0
    || availabilityFilter !== 'Any';
  const quickSearchSelectionLabel = useMemo(() => {
    const labels: string[] = [];
    if (selectedSpecialty !== 'All') labels.push(selectedSpecialty);
    if (selectedLocation !== 'All') labels.push(selectedLocation);
    if (Number(minRateInput) > 0) labels.push(`from ${formatMoney(Number(minRateInput))}/hr`);
    if (Number(maxRateInput) > 0 && Number(maxRateInput) < sliderMax) labels.push(`up to ${formatMoney(Number(maxRateInput))}/hr`);
    if (minExperience > 0) labels.push(`${minExperience}+ yrs`);
    if (minRating > 0) labels.push(`${minRating}+ stars`);
    if (availabilityFilter !== 'Any') labels.push(availabilityFilter);
    return labels.join(' | ');
  }, [availabilityFilter, maxRateInput, minExperience, minRating, minRateInput, selectedLocation, selectedSpecialty, sliderMax]);
  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <DashboardPopupBanner
        role="client"
        storageKey={`client-dashboard-popup-${user?.id ?? 'guest'}`}
        visible={upcomingCount === 0}
        title="Need legal help today?"
        message="Find available lawyers, compare rates, and book a consultation in minutes."
        primaryLabel="Find Lawyers"
        onPrimaryPress={() => router.push('/(client)/lawyers' as any)}
      />
      <ScrollView
        scrollEnabled={!isSlidingRate}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 168 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {
          setRefreshing(true);
          loadDashboard();
        }} />}
      >
        <View style={styles.headerRow}>
          <View style={styles.avatarWrap}>
            {avatarUri && !avatarLoadFailed ? (
              <Image
                source={{ uri: avatarUri }}
                style={styles.avatarImage}
                onError={() => setAvatarLoadFailed(true)}
              />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarFallbackText}>{avatarLetter}</Text>
              </View>
            )}
          </View>

          <View style={styles.heroTextWrap}>
            <Text style={styles.heroWelcome}>Welcome back,</Text>
            <Text style={styles.heroName}>{displayName}</Text>
          </View>

          <TouchableOpacity activeOpacity={0.9} style={styles.bellButton} onPress={openNotifications}>
            <Ionicons name="notifications-outline" size={21} color={RoleColors.client.shell} />
            {bellCount > 0 ? (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>{bellCount}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>

        <Animated.View entering={FadeInDown.duration(320).delay(40)} style={styles.heroCard}>
          <View>
            <Text style={styles.heroSubtext}>Here's your legal services overview for today</Text>
            <Text style={styles.heroCardTitle}>Account spending</Text>
          </View>
          <View style={styles.spentCard}>
            <Text style={styles.spentAmount}>{formatMoney(totalSpent)}</Text>
            <Text style={styles.spentLabel}>Total Spent</Text>
            <Text style={styles.spentSubtext}>synced from payments</Text>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(320).delay(130)} style={styles.savedMatchesCard}>
          <View style={styles.savedMatchesHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.savedMatchesEyebrow}>SHORTLIST</Text>
              <Text style={styles.savedMatchesTitle}>Saved Lawyers</Text>
              <Text style={styles.savedMatchesDesc}>
                {savedLawyerCount > 0
                  ? `You have ${savedLawyerCount} saved lawyer${savedLawyerCount === 1 ? '' : 's'} ready to review.`
                  : 'Save your favorite lawyers while you browse so you can compare them later.'}
              </Text>
            </View>
            <View style={styles.savedMatchesPill}>
              <Ionicons name="heart" size={16} color="#fff" />
              <Text style={styles.savedMatchesPillText}>{savedLawyerCount}</Text>
            </View>
          </View>
          <View style={styles.savedMatchesActions}>
            <TouchableOpacity style={styles.savedMatchesPrimaryBtn} onPress={() => router.push('/(client)/lawyers' as any)}>
              <Text style={styles.savedMatchesPrimaryText}>Review shortlist</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.savedMatchesGhostBtn} onPress={() => router.push('/(client)/lawyers?availability=available' as any)}>
              <Text style={styles.savedMatchesGhostText}>Browse available now</Text>
            </TouchableOpacity>
          </View>
          {savedLawyerCount > 0 ? (
            <TouchableOpacity style={styles.savedMatchesCompareBtn} onPress={() => router.push('/(client)/lawyers' as any)}>
              <Ionicons name="layers-outline" size={14} color={RoleColors.client.shell} />
              <Text style={styles.savedMatchesCompareText}>Compare saved lawyers</Text>
            </TouchableOpacity>
          ) : null}
          {savedLawyerCount > 0 ? (
            <View style={styles.savedMatchesMiniRow}>
              <View style={styles.savedMatchesMiniItem}>
                <View style={styles.savedMatchesMiniIcon}>
                  <Ionicons name="heart" size={14} color="#fff" />
                </View>
                <Text style={styles.savedMatchesMiniValue}>{savedLawyerCount}</Text>
                <Text style={styles.savedMatchesMiniLabel}>Pinned</Text>
              </View>
              <View style={styles.savedMatchesMiniItem}>
                <View style={styles.savedMatchesMiniIconAlt}>
                  <Ionicons name="layers-outline" size={14} color={RoleColors.client.shell} />
                </View>
                <Text style={styles.savedMatchesMiniValue}>Compare</Text>
                <Text style={styles.savedMatchesMiniLabel}>Side by side</Text>
              </View>
              <View style={styles.savedMatchesMiniItem}>
                <View style={styles.savedMatchesMiniIconSoft}>
                  <Ionicons name="pulse-outline" size={14} color="#16A34A" />
                </View>
                <Text style={styles.savedMatchesMiniValue}>Now</Text>
                <Text style={styles.savedMatchesMiniLabel}>Browse active</Text>
              </View>
            </View>
          ) : null}
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(320).delay(150)}>
          <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.statsScroller}
          contentContainerStyle={styles.statsGrid}
        >
          <StatCard
            icon="videocam"
            iconBg="#EEF4FF"
            iconColor="#3164E0"
            value={totalConsultations}
            label="Total Consultations"
            sublabel={`${completedCount} completed`}
            onPress={() => router.push('/(client)/consultations' as any)}
          />
          <StatCard
            icon="calendar"
            iconBg="#FFF4E8"
            iconColor="#F59E0B"
            value={upcomingCount}
            label="Upcoming Sessions"
            sublabel="Scheduled ahead"
            onPress={() => {
              setAppointmentTab('upcoming');
              router.push('/(client)/consultations' as any);
            }}
          />
          <StatCard
            icon="chatbubble-ellipses"
            iconBg="#E9F7EF"
            iconColor="#099268"
            value={unreadMessages}
            label="Unread Messages"
            sublabel="Reply from inbox"
            onPress={() => router.push('/(client)/messages' as any)}
          />
        </ScrollView>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(320).delay(190)} style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>My Appointments</Text>
            <TouchableOpacity onPress={() => router.push('/(client)/consultations?openBook=1' as any)}>
              <Text style={styles.sectionLink}>Book New +</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.tabsRow}>
            {(['upcoming', 'completed', 'cancelled', 'expired'] as ConsultationStatus[]).map((tab) => {
              const active = appointmentTab === tab;
              return (
                <TouchableOpacity
                  key={tab}
                  activeOpacity={0.88}
                  style={[styles.tabButton, active && styles.tabButtonActive]}
                  onPress={() => setAppointmentTab(tab)}
                >
                  <Text style={[styles.tabText, active && styles.tabTextActive]}>
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {filteredAppointments.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={34} color="#D1D5DB" />
              <Text style={styles.emptyTitle}>No {appointmentTab} consultations.</Text>
              <TouchableOpacity onPress={() => router.push('/(client)/consultations?openBook=1' as any)}>
                <Text style={styles.emptyLink}>Book one now</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.appointmentList}>
              {filteredAppointments.slice(0, 3).map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.appointmentItem}
                  activeOpacity={0.9}
                  onPress={() => router.push('/(client)/consultations' as any)}
                >
                  <View style={styles.appointmentIcon}>
                    <Ionicons name="calendar-clear-outline" size={18} color={Colors.primary} />
                  </View>
                  <View style={styles.appointmentBody}>
                    <Text style={styles.appointmentName}>{item.lawyer?.name || item.code || 'Consultation'}</Text>
                    <Text style={styles.appointmentMeta}>
                      {formatShortDate(item.scheduled_at)} {formatShortTime(item.scheduled_at)}
                    </Text>
                  </View>
                  <Text style={styles.appointmentStatus}>{String(item.status ?? '').toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(320).delay(230)} style={styles.dualStack}>
          <View style={[styles.sideCard, styles.readableSideCard]}>
            <View style={styles.sideHeaderRow}>
              <View>
                <Text style={styles.sideCardTitle}>Recent Activity</Text>
                <Text style={styles.sideCardSub}>Latest updates from your account</Text>
              </View>
              <View style={styles.sideHeaderIcon}>
                <Ionicons name="notifications-outline" size={18} color={RoleColors.client.accent} />
              </View>
            </View>
            {recentActivity.length === 0 ? (
              <View style={styles.sideEmpty}>
                <Ionicons name="sparkles-outline" size={22} color="#B0B7C6" />
                <Text style={styles.sideEmptyText}>No recent activity yet.</Text>
              </View>
            ) : (
              recentActivity.map((item) => (
                <View key={item.id} style={styles.activityItem}>
                  <View style={styles.activityIconWrap}>
                    <Ionicons name="flash-outline" size={16} color={RoleColors.client.accent} />
                  </View>
                  <View style={styles.activityBody}>
                    <Text style={styles.activityTitle} numberOfLines={2}>{item.title}</Text>
                    <Text style={styles.activityMeta} numberOfLines={2}>{item.meta}</Text>
                  </View>
                </View>
              ))
            )}
          </View>

          <View style={[styles.sideCard, styles.readableSideCard]}>
            <View style={styles.sideHeaderRow}>
              <View>
                <Text style={styles.sideCardTitle}>Payment History</Text>
                <Text style={styles.sideCardSub}>Recent legal service payments</Text>
              </View>
              <TouchableOpacity style={styles.viewAllPill} onPress={() => router.push('/(client)/payments' as any)}>
                <Text style={styles.sectionLink}>{'View All ->'}</Text>
              </TouchableOpacity>
            </View>

            {paymentPreview.length === 0 ? (
              <View style={styles.sideEmpty}>
                <Ionicons name="receipt-outline" size={22} color="#B0B7C6" />
                <Text style={styles.sideEmptyText}>No payments yet.</Text>
              </View>
            ) : (
              paymentPreview.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.paymentItem}
                  activeOpacity={0.9}
                  onPress={() => router.push('/(client)/payments' as any)}
                >
                  <View style={styles.paymentIcon}>
                    <Ionicons name="card-outline" size={18} color="#315BDB" />
                  </View>
                  <View style={styles.paymentBody}>
                    <Text style={styles.paymentName}>{item.lawyerName}</Text>
                    <Text style={styles.paymentMeta}>{item.serviceLabel} - {item.date}</Text>
                  </View>
                  <View style={styles.paymentRight}>
                    <Text style={styles.paymentAmount}>{formatMoney(item.amount)}</Text>
                    <Text
                      style={[
                        styles.paymentStatus,
                        item.statusLabel === 'Refunded' && styles.paymentStatusRefunded,
                        item.statusLabel === 'Pending' && styles.paymentStatusPending,
                      ]}
                    >
                      {item.statusLabel}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(320).delay(270)} style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Quick Lawyer Search</Text>
            <View style={styles.sectionActionsRow}>
              {hasQuickSearchFilters ? (
                <TouchableOpacity style={styles.clearSearchLink} onPress={clearQuickSearch} activeOpacity={0.85}>
                  <Ionicons name="close-circle-outline" size={15} color="#64748B" />
                  <Text style={styles.clearSearchLinkText}>Clear</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity onPress={() => setShowAdvancedSearch((value) => !value)}>
                <Text style={styles.sectionLink}>
                  {showAdvancedSearch ? 'Hide Advanced' : 'Advanced Search ->'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {showAdvancedSearch ? (
            <View style={styles.quickFilterPanel}>
              <View style={styles.quickFilterHeader}>
                <View style={styles.quickFilterTitleRow}>
                  <Ionicons name="options-outline" size={14} color={RoleColors.client.shell} />
                  <Text style={styles.quickFilterTitle}>Filters</Text>
                </View>
                <View style={styles.quickFilterBadge}>
                  <Text style={styles.quickFilterBadgeText}>{lawyers.length} results</Text>
                </View>
              </View>

              {hasQuickSearchFilters ? (
                <View style={styles.quickSelectedRow}>
                  <View style={styles.quickSelectedPill}>
                    <Ionicons name="funnel-outline" size={13} color={RoleColors.client.accent} />
                    <Text style={styles.quickSelectedText} numberOfLines={2}>
                      {quickSearchSelectionLabel || 'Filtered'}
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.quickClearBtn} onPress={clearQuickSearch} activeOpacity={0.85}>
                    <Ionicons name="close-circle-outline" size={15} color={RoleColors.client.shell} />
                    <Text style={styles.quickClearBtnText}>Clear</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.quickSelectedEmpty}>
                  <Text style={styles.quickSelectedEmptyText}>Selections appear here as you choose filters.</Text>
                </View>
              )}

              <View style={styles.quickFilterSection}>
                <View style={styles.quickFilterSectionHead}>
                  <Text style={styles.quickFilterSectionTitle}>Practice Area</Text>
                  <Ionicons name="chevron-up" size={14} color={Colors.textMuted} />
                </View>
                <ScrollView nestedScrollEnabled style={styles.quickPracticeScroll} showsVerticalScrollIndicator>
                  {specialtyOptions.map((item) => {
                    const active = selectedSpecialty === item;
                    return (
                      <TouchableOpacity
                        key={`adv-specialty-${item}`}
                        style={styles.quickRadioRow}
                        onPress={() => setSelectedSpecialty(item)}
                        activeOpacity={0.85}
                      >
                        <View style={[styles.quickRadioOuter, active && styles.quickRadioOuterSelected]}>
                          {active ? <View style={styles.quickRadioInner} /> : null}
                        </View>
                        <Text style={[styles.quickRadioLabel, active && styles.quickRadioLabelSelected]} numberOfLines={1}>
                          {item === 'All' ? 'All Areas' : item}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              <View style={styles.quickFilterSection}>
                <View style={styles.quickFilterSectionHead}>
                  <Text style={styles.quickFilterSectionTitle}>Hourly Rate</Text>
                  <Ionicons name="chevron-up" size={14} color={Colors.textMuted} />
                </View>
                <View style={styles.quickRateInputsRow}>
                  <View style={styles.quickRateInputGroup}>
                    <Text style={styles.quickInputMiniLabel}>Min (P)</Text>
                    <TextInput value={minRateInput} onChangeText={setMinRateInput} keyboardType="numeric" style={styles.quickRateInput} />
                  </View>
                  <View style={styles.quickRateInputGroup}>
                    <Text style={styles.quickInputMiniLabel}>Max (P)</Text>
                    <TextInput value={maxRateInput} onChangeText={setMaxRateInput} keyboardType="numeric" style={styles.quickRateInput} />
                  </View>
                </View>
              </View>

              <View style={styles.quickFilterSection}>
                <View style={styles.quickFilterSectionHead}>
                  <Text style={styles.quickFilterSectionTitle}>Location</Text>
                  <Ionicons name="chevron-up" size={14} color={Colors.textMuted} />
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickPillOptionsRow}>
                  {locationOptions.map((item) => {
                    const active = selectedLocation === item;
                    return (
                      <TouchableOpacity
                        key={`adv-location-${item}`}
                        style={[styles.optionChip, active && styles.optionChipActive]}
                        onPress={() => setSelectedLocation(item)}
                        activeOpacity={0.88}
                      >
                        <Text style={[styles.optionChipText, active && styles.optionChipTextActive]} numberOfLines={1}>
                          {item === 'All' ? 'All Locations' : item}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              <View style={styles.quickFilterSection}>
                <View style={styles.quickFilterSectionHead}>
                  <Text style={styles.quickFilterSectionTitle}>Experience</Text>
                  <Ionicons name="chevron-up" size={14} color={Colors.textMuted} />
                </View>
                <View style={styles.quickPillOptionsRow}>
                  {[0, 3, 5, 10, 20].map((value) => {
                    const active = minExperience === value;
                    return (
                      <TouchableOpacity key={`adv-exp-${value}`} style={[styles.optionChip, active && styles.optionChipActive]} onPress={() => setMinExperience(value)}>
                        <Text style={[styles.optionChipText, active && styles.optionChipTextActive]}>
                          {value === 0 ? 'Any' : `${value}+ yrs`}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.quickFilterSection}>
                <View style={styles.quickFilterSectionHead}>
                  <Text style={styles.quickFilterSectionTitle}>Minimum Rating</Text>
                  <Ionicons name="chevron-up" size={14} color={Colors.textMuted} />
                </View>
                <View style={styles.quickPillOptionsRow}>
                  {[0, 3, 3.5, 4, 4.5].map((value) => {
                    const active = minRating === value;
                    return (
                      <TouchableOpacity key={`adv-rating-${value}`} style={[styles.optionChip, active && styles.optionChipActive]} onPress={() => setMinRating(value)}>
                        <Text style={[styles.optionChipText, active && styles.optionChipTextActive]}>
                          {value === 0 ? 'Any' : `${value}+`}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.quickFilterSection}>
                <View style={styles.quickFilterSectionHead}>
                  <Text style={styles.quickFilterSectionTitle}>Availability</Text>
                  <Ionicons name="chevron-up" size={14} color={Colors.textMuted} />
                </View>
                <View style={styles.quickPillOptionsRow}>
                  {['Any', 'available', 'busy'].map((item) => {
                    const active = availabilityFilter === item;
                    return (
                      <TouchableOpacity key={`adv-availability-${item}`} style={[styles.optionChip, active && styles.optionChipActive]} onPress={() => setAvailabilityFilter(item)}>
                        <Text style={[styles.optionChipText, active && styles.optionChipTextActive]}>
                          {item === 'Any' ? 'Any' : item.charAt(0).toUpperCase() + item.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <TouchableOpacity style={styles.quickApplyBtn} activeOpacity={0.92} onPress={openSearch}>
                <Text style={styles.quickApplyBtnText}>Apply Filters</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickClearAllLink} onPress={clearQuickSearch} activeOpacity={0.85}>
                <Text style={styles.quickClearAllText}>Clear all</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.searchFieldsRow}>
            <View style={styles.searchField}>
              <Text style={styles.searchLabel}>Specialty</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.optionRow}
              >
                {specialtyOptions.map((item) => {
                  const active = selectedSpecialty === item;
                  return (
                    <TouchableOpacity
                      key={`specialty-${item}`}
                      style={[styles.optionChip, active && styles.optionChipActive]}
                      activeOpacity={0.88}
                      onPress={() => setSelectedSpecialty(item)}
                    >
                      <Text style={[styles.optionChipText, active && styles.optionChipTextActive]}>{item}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.searchField}>
              <Text style={styles.searchLabel}>Location</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.optionRow}
              >
                {locationOptions.map((item) => {
                  const active = selectedLocation === item;
                  return (
                    <TouchableOpacity
                      key={`location-${item}`}
                      style={[styles.optionChip, active && styles.optionChipActive]}
                      activeOpacity={0.88}
                      onPress={() => setSelectedLocation(item)}
                    >
                      <Text style={[styles.optionChipText, active && styles.optionChipTextActive]}>{item}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>

          <Text style={styles.rateText}>Max Rate: {formatMoney(displayedMaxRate)}/hr</Text>

          <GestureDetector gesture={sliderGesture}>
            <View
              style={styles.sliderTouchArea}
              accessibilityRole="adjustable"
              accessibilityLabel="Maximum hourly rate"
            >
              <View
                style={styles.sliderTrack}
                onLayout={onSliderLayout}
                collapsable={false}
              >
                <Animated.View style={[styles.sliderFill, sliderFillAnimatedStyle]} />
                <Animated.View
                  style={[
                    styles.sliderThumb,
                    sliderThumbAnimatedStyle,
                  ]}
                />
              </View>
            </View>
          </GestureDetector>

          <View style={styles.sliderLabels}>
            <Text style={styles.sliderLabel}>{formatMoney(sliderMin)}</Text>
            <Text style={styles.sliderLabel}>{formatMoney(sliderMax)}</Text>
          </View>

          <TouchableOpacity style={styles.searchButton} activeOpacity={0.92} onPress={openSearch}>
            <Ionicons name="search" size={16} color="#FFFFFF" />
            <Text style={styles.searchButtonText}>Search Lawyers</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F6FB',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F6FB',
  },
  content: {
    padding: 16,
    paddingBottom: 120,
  },
  heroCard: {
    backgroundColor: RoleColors.client.shell,
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    flexDirection: 'column',
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    gap: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarWrap: {
    width: 56,
    height: 56,
  },
  avatarImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  avatarFallback: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: RoleColors.client.shell,
    borderWidth: 1,
    borderColor: '#DDE6F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  heroTextWrap: {
    flex: 1,
    paddingRight: 10,
    paddingLeft: 12,
  },
  heroWelcome: {
    color: Colors.textMuted,
    fontSize: 13,
    marginBottom: 6,
  },
  heroName: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  heroSubtext: {
    color: '#D7E0F3',
    fontSize: 13,
    lineHeight: 19,
  },
  heroCardTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 5,
  },
  bellButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E3EAF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBadge: {
    position: 'absolute',
    right: -2,
    top: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FF5B4D',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  bellBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  spentCard: {
    width: '100%',
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignSelf: 'stretch',
  },
  spentAmount: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4,
    textAlign: 'left',
  },
  spentLabel: {
    color: '#E6EDFA',
    fontSize: 12,
    textAlign: 'left',
  },
  spentSubtext: {
    color: '#7CE1A8',
    fontSize: 10,
    textAlign: 'left',
    marginTop: 3,
  },
  statsScroller: {
    flexGrow: 0,
    marginHorizontal: -16,
    marginTop: 2,
    marginBottom: 20,
  },
  statsGrid: {
    paddingHorizontal: 16,
    paddingBottom: 2,
    gap: 12,
  },
  statCard: {
    width: 270,
    minHeight: 112,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E7ECF3',
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#102042',
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  statIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  statTextWrap: {
    flex: 1,
  },
  statValue: {
    color: '#16203A',
    fontSize: 29,
    fontWeight: '900',
    lineHeight: 33,
  },
  statLabel: {
    color: '#354055',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 2,
  },
  statSublabel: {
    color: '#12A36D',
    fontSize: 13,
    marginTop: 7,
    fontWeight: '900',
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E7ECF3',
    padding: 14,
    marginBottom: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionTitle: {
    color: '#15213D',
    fontSize: 16,
    fontWeight: '800',
  },
  sectionLink: {
    color: RoleColors.client.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  sectionActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  clearSearchLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  clearSearchLinkText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
  tabsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  tabButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#F3F6FB',
  },
  tabButtonActive: {
    backgroundColor: '#E8EEFF',
  },
  tabText: {
    color: '#5C6474',
    fontSize: 12,
    fontWeight: '700',
  },
  tabTextActive: {
    color: Colors.primary,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 26,
  },
  emptyTitle: {
    color: '#9CA3AF',
    fontSize: 13,
    marginTop: 10,
    marginBottom: 6,
  },
  emptyLink: {
    color: RoleColors.client.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  appointmentList: {
    gap: 10,
  },
  appointmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFD',
    borderRadius: 14,
    padding: 12,
  },
  appointmentIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EAF0FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  appointmentBody: {
    flex: 1,
  },
  appointmentName: {
    color: '#16203A',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 3,
  },
  appointmentMeta: {
    color: '#7B8394',
    fontSize: 12,
  },
  appointmentStatus: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '800',
  },
  dualStack: {
    gap: 16,
    marginBottom: 16,
  },
  sideCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E7ECF3',
    padding: 16,
  },
  readableSideCard: {
    shadowColor: '#102042',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  sideHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  sideCardSub: {
    color: '#7B8394',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 3,
  },
  sideHeaderIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#EEF3FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewAllPill: {
    borderRadius: 999,
    backgroundColor: '#EEF3FF',
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  sideCardTitle: {
    color: '#15213D',
    fontSize: 17,
    fontWeight: '900',
  },
  sideEmpty: {
    paddingVertical: 24,
    alignItems: 'center',
    gap: 6,
  },
  sideEmptyText: {
    color: '#B0B7C6',
    fontSize: 14,
    fontWeight: '700',
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 14,
    backgroundColor: '#F8FAFD',
    borderWidth: 1,
    borderColor: '#EEF2F7',
    padding: 12,
    marginBottom: 10,
  },
  activityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#315BDB',
    marginTop: 6,
    marginRight: 10,
  },
  activityIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: '#EEF3FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  activityBody: {
    flex: 1,
  },
  activityTitle: {
    color: '#1C243E',
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 4,
    lineHeight: 19,
  },
  activityMeta: {
    color: '#6B7280',
    fontSize: 13,
    lineHeight: 18,
  },
  paymentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 15,
    backgroundColor: '#F8FAFD',
    borderWidth: 1,
    borderColor: '#EEF2F7',
    padding: 12,
    marginBottom: 10,
  },
  paymentIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#EEF3FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  paymentBody: {
    flex: 1,
    paddingRight: 10,
  },
  paymentName: {
    color: '#1A2442',
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 4,
    lineHeight: 18,
  },
  paymentMeta: {
    color: '#6B7280',
    fontSize: 12,
    lineHeight: 16,
  },
  paymentRight: {
    alignItems: 'flex-end',
  },
  paymentAmount: {
    color: '#18213C',
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 6,
  },
  paymentStatus: {
    color: '#315BDB',
    fontSize: 11,
    fontWeight: '900',
    backgroundColor: '#EEF3FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  paymentStatusRefunded: {
    color: '#6B7280',
    backgroundColor: '#F3F4F6',
  },
  paymentStatusPending: {
    color: '#B45309',
    backgroundColor: '#FEF3C7',
  },
  quickFilterPanel: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5EAF2',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    marginBottom: 14,
  },
  quickFilterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFD',
    borderBottomWidth: 1,
    borderBottomColor: '#E5EAF2',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  quickFilterTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  quickFilterTitle: {
    color: RoleColors.client.shell,
    fontSize: 13,
    fontWeight: '900',
  },
  quickFilterBadge: {
    borderRadius: 999,
    backgroundColor: '#E8EDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  quickFilterBadgeText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '800',
  },
  quickSelectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F7',
  },
  quickSelectedPill: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: '#FFF8E7',
    paddingHorizontal: 9,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  quickSelectedText: {
    color: '#7A5B0B',
    fontSize: 11,
    fontWeight: '800',
    flex: 1,
  },
  quickSelectedEmpty: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F7',
  },
  quickSelectedEmptyText: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  quickClearBtn: {
    borderWidth: 1,
    borderColor: '#D9E2F2',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
  },
  quickClearBtnText: {
    color: RoleColors.client.shell,
    fontSize: 12,
    fontWeight: '800',
  },
  quickFilterSection: {
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F7',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  quickFilterSectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  quickFilterSectionTitle: {
    color: RoleColors.client.shell,
    fontSize: 12,
    fontWeight: '900',
  },
  quickPracticeScroll: {
    maxHeight: 140,
  },
  quickRadioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 5,
  },
  quickRadioOuter: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickRadioOuterSelected: {
    borderColor: RoleColors.client.shell,
  },
  quickRadioInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: RoleColors.client.shell,
  },
  quickRadioLabel: {
    flex: 1,
    color: '#475569',
    fontSize: 12,
    fontWeight: '600',
  },
  quickRadioLabelSelected: {
    color: RoleColors.client.shell,
    fontWeight: '900',
  },
  quickRateInputsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  quickRateInputGroup: {
    flex: 1,
  },
  quickInputMiniLabel: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    marginBottom: 5,
  },
  quickRateInput: {
    minHeight: 38,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    color: Colors.text,
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 10,
    backgroundColor: '#FFFFFF',
  },
  quickPillOptionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickApplyBtn: {
    marginHorizontal: 14,
    marginTop: 14,
    minHeight: 42,
    borderRadius: 7,
    backgroundColor: RoleColors.client.shell,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickApplyBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  quickClearAllLink: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  quickClearAllText: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  savedMatchesCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginTop: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E8EDF5',
    shadowColor: '#1E2D4D',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  savedMatchesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  savedMatchesEyebrow: {
    color: RoleColors.client.accent,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  savedMatchesTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 2,
  },
  savedMatchesDesc: {
    color: Colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  savedMatchesPill: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E11D48',
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedMatchesPillText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
    marginTop: 1,
  },
  savedMatchesActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  savedMatchesPrimaryBtn: {
    flex: 1,
    backgroundColor: RoleColors.client.shell,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
  },
  savedMatchesPrimaryText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 13,
  },
  savedMatchesGhostBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D9E2F2',
    paddingVertical: 11,
    alignItems: 'center',
    backgroundColor: '#F8FAFD',
  },
  savedMatchesGhostText: {
    color: RoleColors.client.shell,
    fontWeight: '900',
    fontSize: 13,
    textAlign: 'center',
  },
  savedMatchesCompareBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 2,
    paddingTop: 2,
  },
  savedMatchesCompareText: {
    color: RoleColors.client.shell,
    fontWeight: '800',
    fontSize: 12,
  },
  savedMatchesMiniRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  savedMatchesMiniItem: {
    flex: 1,
    backgroundColor: '#F7FAFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E3EAF4',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  savedMatchesMiniIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E11D48',
    marginBottom: 6,
  },
  savedMatchesMiniIconAlt: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF4FF',
    marginBottom: 6,
  },
  savedMatchesMiniIconSoft: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E9F7EF',
    marginBottom: 6,
  },
  savedMatchesMiniValue: { color: RoleColors.client.shell, fontSize: 13, fontWeight: '900' },
  savedMatchesMiniLabel: { color: Colors.textMuted, fontSize: 11, fontWeight: '700', marginTop: 2 },
  searchFieldsRow: {
    gap: 12,
  },
  searchField: {
    flex: 1,
  },
  searchLabel: {
    color: '#5E6778',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  selectField: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DCE3EE',
    backgroundColor: '#FBFCFE',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectFieldText: {
    color: '#111827',
    fontSize: 14,
  },
  optionRow: {
    gap: 8,
    paddingBottom: 4,
  },
  optionChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#DCE3EE',
    backgroundColor: '#FBFCFE',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  optionChipActive: {
    backgroundColor: '#E8EEFF',
    borderColor: '#BFD0FF',
  },
  optionChipText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '700',
  },
  optionChipTextActive: {
    color: RoleColors.client.shell,
  },
  rateText: {
    color: '#3E4A61',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 14,
    marginBottom: 6,
  },
  sliderTouchArea: {
    minHeight: 60,
    justifyContent: 'center',
    marginBottom: 4,
  },
  sliderTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: '#D9DEE8',
    justifyContent: 'center',
    position: 'relative',
  },
  sliderFill: {
    height: 10,
    borderRadius: 999,
    backgroundColor: RoleColors.client.shell,
  },
  sliderThumb: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: RoleColors.client.shell,
    top: -12,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#102042',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sliderLabel: {
    color: '#96A0B1',
    fontSize: 11,
  },
  searchButton: {
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: RoleColors.client.shell,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  searchButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
