import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  FlatList,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
  AppState,
  Linking,
  Platform,
  BackHandler,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons as IoniconsBase } from '@expo/vector-icons';
const Ionicons = IoniconsBase as any;
import { Colors } from '@/constants/theme';
import { formatPhp } from '@/constants/currency';
import { clientApi } from '@/services/api';
import { paymongoService } from '@/services/paymongo';
import { LARAVEL_API_BASE } from '@/services/endpoints';
import EmptyState from '@/components/EmptyState';
import { PaymentProcessingModal } from '@/components/PaymentProcessingModal';
import FeedbackModal from '@/components/FeedbackModal';
import {
  CLIENT_DOUBLE_BOOKING_MESSAGE,
  extractConsultationList,
  hasClientBookingConflict,
} from '@/utils/clientBookingConflicts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/context/auth';
import {
  createReverbEcho,
  isReverbConfigured,
  subscribeUserConsultationEvents,
  subscribeUserPaymentEvents,
} from '@/services/realtime';
import Constants from 'expo-constants';
import * as ExpoLinking from 'expo-linking';
import { openAuthSessionAsync } from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
  

type ConsultationStatus = 'pending' | 'upcoming' | 'completed' | 'cancelled' | 'refunds' | 'all';

const STATUS_TABS: ConsultationStatus[] = ['all', 'pending', 'upcoming', 'completed', 'cancelled', 'refunds'];

const API_HOST_LABEL = (() => {
  try {
    return new URL(LARAVEL_API_BASE).host;
  } catch {
    return LARAVEL_API_BASE;
  }
})();
const WEB_APP_BASE_URL = LARAVEL_API_BASE.replace(/\/api\/?$/, '');
const KNOWN_WEB_BOOKING_ONLY_HOST = API_HOST_LABEL;
const isExpoGo = Constants.appOwnership === 'expo';
const Notifications = !isExpoGo
  ? (require('expo-notifications') as typeof import('expo-notifications'))
  : null;
const REMINDER_OFFSET_MINUTES = 5;
const CALL_JOIN_LEAD_MINUTES = 5;
const JOIN_ALARM_PREFIX = 'consultation_join_alarm_';

function getMobileCallbackUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (Constants.appOwnership === 'expo') {
    const owner = Constants.expoConfig?.owner || process.env.EXPO_PUBLIC_EXPO_OWNER;
    const slug = Constants.expoConfig?.slug || process.env.EXPO_PUBLIC_EXPO_SLUG;
    if (owner && slug) {
      return `https://auth.expo.io/@${owner}/${slug}`;
    }

    const target = ExpoLinking.createURL(normalizedPath);
    return `${WEB_APP_BASE_URL}/mobile-return?target=${encodeURIComponent(target)}`;
  }

  return ExpoLinking.createURL(normalizedPath, {
    scheme: 'lexconnectmobile',
    isTripleSlashed: true,
  });
}

function isMissingPaymentResumeRoute(error: any) {
  const status = error?.response?.status;
  const message = String(error?.response?.data?.message || error?.response?.data?.error || error?.message || '').toLowerCase();
  return status === 404 && (message.includes('resume') || message.includes('route') || message.includes('not found'));
}


interface Consultation {
  id: number;
  code?: string;
  scheduled_at: string;
  type?: string;
  status: string;
  duration_minutes?: number;
  price?: number;
  has_review?: boolean;
  lawyer?: { id: number; name: string; phone?: string; email?: string; location?: string };
  location?: string;
  meeting_location?: string;
  address?: string;
  phone?: string;
  lawyer_phone?: string;
  paid?: boolean;
  payment_id?: number;
  payment_status?: string;
  balance_payment_id?: number;
  balance_payment_status?: string;
  balance_amount?: number;
  termsAccepted?: boolean;
  can_join_video?: boolean;
  lawyer_in_video_call?: boolean;
}

interface BookingAvailabilitySlot {
  time: string;
  label?: string;
}

interface BookingAvailability {
  selected_date?: string | null;
  slots?: BookingAvailabilitySlot[];
}

function padDatePart(value: number) {
  return String(value).padStart(2, '0');
}

function formatLocalDateTime(value: Date) {
  return `${value.getFullYear()}-${padDatePart(value.getMonth() + 1)}-${padDatePart(value.getDate())} ${padDatePart(value.getHours())}:${padDatePart(value.getMinutes())}:${padDatePart(value.getSeconds())}`;
}

function formatDateValue(value: Date) {
  return `${value.getFullYear()}-${padDatePart(value.getMonth() + 1)}-${padDatePart(value.getDate())}`;
}

const BOOKING_PAYMENT_METHODS = ['card', 'gcash', 'dob'];

type FeedbackState = {
  visible: boolean;
  title: string;
  message: string;
  tone?: 'success' | 'warning' | 'danger' | 'info';
  primaryLabel?: string;
};

export default function ClientConsultations() {
  const { user, token } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ openBook?: string; lawyerId?: string; consultationId?: string; fromNotification?: string }>();
  const consumedBookParamRef = useRef<string | null>(null);
  const bookingCallbackUrl = useMemo(() => getMobileCallbackUrl('/consultations'), []);
  const openedFromNotification = params?.fromNotification === '1';
  const targetConsultationId = Number(params?.consultationId || 0) || null;
  // Booking modal state
  const [showBooking, setShowBooking] = useState(false);
  const [bookingLawyerId, setBookingLawyerId] = useState<number | null>(null);
  const [bookingDate, setBookingDate] = useState<Date>(new Date());
  const [showBookingDatePicker, setShowBookingDatePicker] = useState(false);
  const [bookingType, setBookingType] = useState('Consultation');
  const [bookingDuration, setBookingDuration] = useState(30);
  const [bookingPrice, setBookingPrice] = useState(0);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingAvailability, setBookingAvailability] = useState<BookingAvailability | null>(null);
  const [bookingAvailabilityLoading, setBookingAvailabilityLoading] = useState(false);
  const [bookingAvailabilityError, setBookingAvailabilityError] = useState('');

  // Payment modal state
  const [showPaymentProcessing, setShowPaymentProcessing] = useState(false);
  const [currentPaymentId, setCurrentPaymentId] = useState<number | null>(null);
  const [currentConsultationCode, setCurrentConsultationCode] = useState<string>('');
  const [feedback, setFeedback] = useState<FeedbackState>({
    visible: false,
    title: '',
    message: '',
    tone: 'success',
  });

  const showFeedback = useCallback((next: Omit<FeedbackState, 'visible'>) => {
    setFeedback({ visible: true, ...next });
  }, []);

  const closeFeedback = useCallback(() => {
    setFeedback((current) => ({ ...current, visible: false }));
  }, []);

  // Example: open booking modal for a lawyer (replace with your lawyer selection logic)
  function openBooking(lawyerId: number) {
    setBookingLawyerId(lawyerId);
    setShowBooking(true);
  }

  function closeBookingModal() {
    setShowBooking(false);
    setShowBookingDatePicker(false);
    setBookingLawyerId(null);
    setBookingDate(new Date());
    setBookingType('Consultation');
    setBookingDuration(30);
    setBookingPrice(0);
    setBookingAvailability(null);
    setBookingAvailabilityLoading(false);
    setBookingAvailabilityError('');
  }

  async function handleBookConsultation() {
    if (!bookingLawyerId) return;
    if (bookingAvailabilityConflict) {
      Alert.alert('Time unavailable', 'This lawyer is already booked for another client around that time. Please choose another slot.');
      return;
    }
    setBookingLoading(true);
    try {
      const existingConsultationsResponse = await clientApi.consultations();
      const existingConsultations = extractConsultationList(existingConsultationsResponse?.data);
      if (hasClientBookingConflict(existingConsultations, bookingDate, bookingDuration)) {
        Alert.alert('Schedule Conflict', CLIENT_DOUBLE_BOOKING_MESSAGE);
        return;
      }

      console.log('📱 Booking consultation...');
      const { data } = await clientApi.bookConsultation({
        lawyer_id: bookingLawyerId,
        scheduled_at: formatLocalDateTime(bookingDate),
        type: bookingType.toLowerCase() === 'consultation' ? 'video' : bookingType,
        duration_minutes: bookingDuration,
        notes: null,
        paymentMethodTypes: BOOKING_PAYMENT_METHODS,
        successUrl: bookingCallbackUrl,
        cancelUrl: bookingCallbackUrl,
      });

      console.log('✅ Booking response:', data);

      const consultationCode = String(data?.consultation?.code ?? '').trim();
      const paymentId = Number(data?.payment?.id || 0);
      let checkoutUrl = data?.checkout_url;

      console.log('📋 Consultation Code:', consultationCode);
      console.log('💳 Payment ID:', paymentId);
      console.log('🔗 Checkout URL:', checkoutUrl);

      if (!checkoutUrl && paymentId > 0) {
        console.log('⏳ Checkout URL not in booking response, trying to resume...');
        try {
          const resumeResponse = await clientApi.resumePayment(paymentId, {
            paymentMethodTypes: BOOKING_PAYMENT_METHODS,
            successUrl: bookingCallbackUrl,
            cancelUrl: bookingCallbackUrl,
          });
          checkoutUrl = resumeResponse?.data?.checkout_url;
          console.log('✅ Resume response checkout URL:', checkoutUrl);
        } catch (error: any) {
          console.warn('❌ Resume payment failed:', error);

          if (isMissingPaymentResumeRoute(error)) {
            const paymentsUrl = `${WEB_APP_BASE_URL}/payments`;
            Alert.alert(
              'Payment Not Started',
              `Booking was created, but backend ${API_HOST_LABEL} cannot resume payment yet.`,
              [
                {
                  text: 'Open Payments Page',
                  onPress: async () => {
                    try {
                      await openAuthSessionAsync(paymentsUrl, bookingCallbackUrl);
                    } catch {
                      Alert.alert('Open Failed', 'Could not open web payments page. Please try again.');
                    }
                  },
                },
                { text: 'OK' },
              ]
            );
            closeBookingModal();
            await load();
            return;
          }
        }
      }

      if (checkoutUrl && paymentId > 0) {
        console.log('🌐 Opening PayMongo checkout...');
        setShowPaymentProcessing(true);
        setCurrentPaymentId(paymentId);
        setCurrentConsultationCode(consultationCode);

        // Open the PayMongo checkout in browser/webview
        const result = await openAuthSessionAsync(checkoutUrl, bookingCallbackUrl);
        
        console.log('📲 AuthSession result:', result.type);

        if (result.type === 'success') {
          setShowPaymentProcessing(false);
          setCurrentPaymentId(null);
          setCurrentConsultationCode('');
          closeBookingModal();
          await load();
          showFeedback({
            title: 'Payment submitted',
            message: 'We received the payment return and are confirming it in the background.',
            tone: 'info',
            primaryLabel: 'Okay',
          });

          void (async () => {
            try {
              const payment = await paymongoService.pollPaymentStatus(paymentId, 24, 2000);
              if (paymongoService.isPaymentSuccessful(payment?.status)) {
                await load();
              }
            } catch {
              // Silent background retry handling
            }
          })();
          return;
        }

        if (result.type === 'cancel') {
          console.log('⚠️ User cancelled payment');
          setShowPaymentProcessing(false);
          setCurrentPaymentId(null);
          setCurrentConsultationCode('');
          showFeedback({
            title: 'Checkout cancelled',
            message: 'Your booking was created, but payment was not completed. You can resume payment from your payment history.',
            tone: 'warning',
            primaryLabel: 'Got it',
          });
          await load();
          return;
        }
      } else {
        console.warn('⚠️ No checkout URL available');
        closeBookingModal();
        showFeedback({
          title: 'Booking created',
          message: `Your consultation request ${consultationCode} has been created. Payment will be available shortly.`,
          tone: 'info',
          primaryLabel: 'Okay',
        });
        await load();
        return;
      }
    } catch (err: any) {
      console.error('❌ Booking error:', err);
      Alert.alert(
        'Error',
        err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Failed to book consultation.'
      );
    } finally {
      setBookingLoading(false);
    }
  }
  const [activeTab, setActiveTab] = useState<ConsultationStatus>('all');
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [reviewTarget, setReviewTarget] = useState<Consultation | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [resumingPaymentId, setResumingPaymentId] = useState<number | null>(null);
  const [payingBalanceId, setPayingBalanceId] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasRequestedJoinAlarmPermissionRef = useRef(false);
  const screenEntrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!showBooking || !bookingLawyerId) {
      setBookingAvailability(null);
      setBookingAvailabilityLoading(false);
      setBookingAvailabilityError('');
      return;
    }

    let active = true;

    const loadBookingAvailability = async () => {
      try {
        setBookingAvailabilityLoading(true);
        setBookingAvailabilityError('');
        const { data } = await clientApi.lawyerAvailability(bookingLawyerId, {
          date: formatDateValue(bookingDate),
          duration_minutes: bookingDuration,
        });

        if (!active) return;

        setBookingAvailability({
          selected_date: data?.selected_date ?? null,
          slots: Array.isArray(data?.slots) ? data.slots : [],
        });
      } catch (error: any) {
        if (!active) return;
        setBookingAvailability(null);
        setBookingAvailabilityError(
          String(error?.response?.data?.message || 'Unable to check this lawyer\'s availability right now.')
        );
      } finally {
        if (active) setBookingAvailabilityLoading(false);
      }
    };

    loadBookingAvailability();

    return () => {
      active = false;
    };
  }, [bookingDate, bookingDuration, bookingLawyerId, showBooking]);

  const bookingAvailabilityConflict = useMemo(() => {
    if (!bookingAvailability?.slots?.length) return false;
    const selectedTime = `${padDatePart(bookingDate.getHours())}:${padDatePart(bookingDate.getMinutes())}`;
    return !bookingAvailability.slots.some((slot) => String(slot.time || '').trim() === selectedTime);
  }, [bookingAvailability, bookingDate]);

  useEffect(() => {
    Animated.timing(screenEntrance, {
      toValue: 1,
      duration: 360,
      useNativeDriver: true,
    }).start();
  }, [screenEntrance]);

  const filtered = useMemo(() => {
    let nextItems = consultations;

    if (activeTab === 'refunds') {
      nextItems = consultations.filter((item) => {
        const paymentStatus = String(item.payment_status || '').toLowerCase();
        const isRefundStatus = paymentStatus.includes('refund');
        const isCancelledPaid =
          item.status === 'cancelled'
          && (paymentStatus === 'paid' || paymentStatus === 'downpayment_paid');
        return isRefundStatus || isCancelledPaid;
      });
    } else if (activeTab !== 'all') {
      nextItems = consultations.filter((item) => item.status === activeTab);
    }

    // Prioritize pending consultations at the top in all-tabs view.
    if (activeTab === 'all') {
      nextItems = [...nextItems]
        .map((item, index) => ({ item, index }))
        .sort((left, right) => {
          const rankForStatus = (status: string) => {
            if (status === 'pending') return 0;
            if (status === 'upcoming') return 1;
            return 2;
          };

          const leftRank = rankForStatus(left.item.status);
          const rightRank = rankForStatus(right.item.status);

          if (leftRank !== rightRank) {
            return leftRank - rightRank;
          }

          // For pending/upcoming groups, show nearer schedules first.
          if (leftRank <= 1 && rightRank <= 1) {
            const leftTime = new Date(left.item.scheduled_at).getTime();
            const rightTime = new Date(right.item.scheduled_at).getTime();
            if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
              return leftTime - rightTime;
            }
          }

          return left.index - right.index;
        })
        .map((entry) => entry.item);
    }

    if (!targetConsultationId) return nextItems;

    const targetIndex = nextItems.findIndex((item) => Number(item.id) === targetConsultationId);
    if (targetIndex <= 0) return nextItems;

    const targetItem = nextItems[targetIndex];
    return [targetItem, ...nextItems.slice(0, targetIndex), ...nextItems.slice(targetIndex + 1)];
  }, [consultations, activeTab, targetConsultationId]);

  const ensureJoinAlarmPermission = useCallback(async () => {
    if (isExpoGo || !Notifications) return false;

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    if (existingStatus === 'granted') return true;

    if (hasRequestedJoinAlarmPermissionRef.current) return false;
    hasRequestedJoinAlarmPermissionRef.current = true;

    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  }, []);

  const scheduleJoinTimeAlarms = useCallback(async () => {
    if (!user?.id) return;
    if (isExpoGo || !Notifications) return;

    const upcomingItems = consultations.filter((item) => item.status === 'upcoming');
    const upcomingIds = new Set(upcomingItems.map((item) => Number(item.id)).filter((id) => Number.isFinite(id) && id > 0));

    // Cancel stale alarms once a consultation is no longer upcoming (e.g., cancelled/completed).
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const alarmKeys = allKeys.filter((key) => key.startsWith(JOIN_ALARM_PREFIX));

      for (const alarmKey of alarmKeys) {
        const idPart = Number(alarmKey.replace(JOIN_ALARM_PREFIX, ''));
        if (!upcomingIds.has(idPart)) {
          const storedValue = await AsyncStorage.getItem(alarmKey);
          if (storedValue) {
            const parsed = JSON.parse(storedValue) as { notificationId?: string };
            if (parsed?.notificationId) {
              try {
                await Notifications.cancelScheduledNotificationAsync(parsed.notificationId);
              } catch {
                // Ignore cancellation failures and continue cleanup.
              }
            }
          }
          await AsyncStorage.removeItem(alarmKey);
        }
      }
    } catch {
      // Ignore cleanup issues; scheduling below will still run.
    }

    if (upcomingItems.length === 0) return;

    const hasPermission = await ensureJoinAlarmPermission();
    if (!hasPermission) return;

    for (const item of upcomingItems) {
      const scheduledTime = new Date(item.scheduled_at).getTime();
      if (!Number.isFinite(scheduledTime) || scheduledTime <= Date.now()) continue;

      const alarmKey = `${JOIN_ALARM_PREFIX}${item.id}`;
      const stamp = item.scheduled_at;

      try {
        const storedValue = await AsyncStorage.getItem(alarmKey);
        if (storedValue) {
          const parsed = JSON.parse(storedValue) as { stamp?: string; notificationId?: string };
          if (parsed?.stamp === stamp) continue;

          if (parsed?.notificationId) {
            await Notifications.cancelScheduledNotificationAsync(parsed.notificationId);
          }
        }

        const notificationId = await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Time to Join Your Call',
            body: `Your consultation with ${item.lawyer?.name || 'your lawyer'} is starting now.`,
            sound: 'default',
            priority: Notifications.AndroidNotificationPriority.MAX,
            data: {
              type: 'consultation',
              consultationId: String(item.id),
              consultationCode: item.code,
              action: 'join-call',
            },
          },
          trigger: new Date(scheduledTime),
        });

        await AsyncStorage.setItem(alarmKey, JSON.stringify({ stamp, notificationId }));
      } catch {
        // Best effort: consultation list should still load even if alarm scheduling fails.
      }
    }
  }, [consultations, ensureJoinAlarmPermission, user?.id]);

  const refundSummary = useMemo(() => {
    const refundItems = consultations.filter((item) => {
      const paymentStatus = String(item.payment_status || '').toLowerCase();
      const isRefundStatus = paymentStatus.includes('refund');
      const isCancelledPaid =
        item.status === 'cancelled'
        && (paymentStatus === 'paid' || paymentStatus === 'downpayment_paid');
      return isRefundStatus || isCancelledPaid;
    });

    let processing = 0;
    let completed = 0;

    refundItems.forEach((item) => {
      const paymentStatus = String(item.payment_status || '').toLowerCase();
      if (paymentStatus === 'refunded' || paymentStatus === 'refund_completed') {
        completed += 1;
        return;
      }
      processing += 1;
    });

    return {
      total: refundItems.length,
      processing,
      completed,
    };
  }, [consultations]);

  const consultationOverview = useMemo(() => {
    const total = consultations.length;
    const upcoming = consultations.filter((item) => item.status === 'upcoming').length;
    const pending = consultations.filter((item) => item.status === 'pending').length;
    const completed = consultations.filter((item) => item.status === 'completed').length;
    return { total, upcoming, pending, completed };
  }, [consultations]);

  const load = useCallback(async () => {
    try {
      const { data } = await clientApi.consultations(activeTab === 'all' ? undefined : activeTab);
      const payload = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      setConsultations(payload);
    } catch {
      Alert.alert('Error', 'Unable to load consultations right now.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    void scheduleJoinTimeAlarms();
  }, [scheduleJoinTimeAlarms]);

  useEffect(() => {
    if (!openedFromNotification) return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      router.back();
      return true;
    });

    return () => subscription.remove();
  }, [openedFromNotification, router]);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      load();
    }, 10000);

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') load();
    });

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      sub.remove();
    };
  }, [load]);

  useEffect(() => {
    if (!user?.id || !token || !isReverbConfigured()) return;

    const echo = createReverbEcho(token);
    const unsubscribeConsultations = subscribeUserConsultationEvents(echo, user.id, {
      onCreated: () => {
        load();
      },
      onUpdated: () => {
        load();
      },
    });

    const unsubscribePayments = subscribeUserPaymentEvents(echo, user.id, () => {
      load();
    });

    return () => {
      unsubscribeConsultations();
      unsubscribePayments();
      echo.disconnect();
    };
  }, [load, token, user?.id]);

  useEffect(() => {
    if (params.openBook !== '1') return;

    const incomingLawyerId = Number(params.lawyerId || 0);
    const bookingKey = `${params.openBook}:${params.lawyerId}`;
    if (!Number.isFinite(incomingLawyerId) || incomingLawyerId <= 0) {
      if (consumedBookParamRef.current !== bookingKey) {
        consumedBookParamRef.current = bookingKey;
        Alert.alert('Unavailable', 'Could not start booking because no lawyer was selected.');
      }
      router.setParams({ openBook: undefined, lawyerId: undefined } as any);
      return;
    }

    if (consumedBookParamRef.current === bookingKey) return;
    consumedBookParamRef.current = bookingKey;

    setBookingLawyerId(incomingLawyerId);
    setBookingDate(new Date());
    setBookingType('Consultation');
    setBookingDuration(30);
    setBookingPrice(0);
    setShowBookingDatePicker(false);
    setShowBooking(true);
    router.setParams({ openBook: undefined, lawyerId: undefined } as any);
  }, [params.lawyerId, params.openBook, router]);

  useEffect(() => {
    if (!targetConsultationId || !consultations.length) return;

    const target = consultations.find((item) => Number(item.id) === targetConsultationId);
    if (!target) return;

    const paymentStatus = String(target.payment_status || '').toLowerCase();
    const nextTab: ConsultationStatus = (
      target.status === 'cancelled' && (paymentStatus.includes('refund') || paymentStatus === 'paid' || paymentStatus === 'downpayment_paid')
        ? 'refunds'
        : STATUS_TABS.includes(target.status as ConsultationStatus)
        ? target.status as ConsultationStatus
        : 'all'
    );

    if (activeTab !== nextTab) {
      setActiveTab(nextTab);
    }
  }, [activeTab, consultations, targetConsultationId]);

  async function handleCancel(id: number) {
    Alert.alert('Cancel Consultation', 'Are you sure you want to cancel this consultation?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, Cancel',
        style: 'destructive',
        onPress: async () => {
          try {
            await clientApi.cancelConsultation(id);
            await load();
            Alert.alert('Consultation Cancelled', 'Your consultation was cancelled. If a payment was captured, a refund has been initiated and may take time to reflect depending on your payment provider.');
          } catch (err: any) {
            Alert.alert('Error', err?.response?.data?.message || 'Failed to cancel consultation.');
          }
        },
      },
    ]);
  }

  async function submitReview() {
    if (!reviewTarget) return;
    setSubmittingReview(true);
    try {
      await clientApi.submitReview({
        consultation_id: reviewTarget.id,
        rating,
        comment: comment.trim() || null,
      });
      setReviewTarget(null);
      setComment('');
      setRating(5);
      await load();
      Alert.alert('Success', 'Review submitted. Thank you!');
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'Failed to submit review.');
    } finally {
      setSubmittingReview(false);
    }
  }

  async function waitForPaymentResult(paymentId: number) {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const statusResponse = await clientApi.paymentStatus(paymentId);
      const payment = statusResponse.data?.payment;
      if (payment?.status === 'paid' || payment?.status === 'downpayment_paid' || payment?.status === 'failed') {
        return payment;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    return null;
  }

  async function handleResumePayment(item: Consultation) {
    if (!item.payment_id) {
      Alert.alert('Unavailable', 'No pending payment was found for this consultation.');
      return;
    }

    setResumingPaymentId(item.payment_id);
    try {
      const { data } = await clientApi.resumePayment(item.payment_id, {
        paymentMethodTypes: BOOKING_PAYMENT_METHODS,
        successUrl: bookingCallbackUrl,
        cancelUrl: bookingCallbackUrl,
      });

      const checkoutUrl = data?.checkout_url;
      if (!checkoutUrl) {
        throw new Error('No checkout URL was returned for this payment.');
      }

      const result = await openAuthSessionAsync(checkoutUrl, bookingCallbackUrl);
      if (result.type === 'success') {
        const payment = await waitForPaymentResult(item.payment_id);
        await load();

        if (payment?.status === 'paid' || payment?.status === 'downpayment_paid') {
          showFeedback({
            title: 'Payment confirmed',
            message: 'Your consultation downpayment is confirmed and your booking is ready.',
            tone: 'success',
            primaryLabel: 'View booking',
          });
          return;
        }

        if (payment?.status === 'failed') {
          showFeedback({
            title: 'Payment failed',
            message: 'The downpayment did not complete successfully. Please try again when you are ready.',
            tone: 'danger',
            primaryLabel: 'Okay',
          });
          return;
        }

        showFeedback({
          title: 'Still confirming',
          message: 'The payment is still being confirmed. Please refresh again shortly.',
          tone: 'info',
          primaryLabel: 'Okay',
        });
        return;
      }

      if (result.type === 'cancel') {
        showFeedback({
          title: 'Checkout cancelled',
          message: 'The downpayment remains pending for this consultation.',
          tone: 'warning',
          primaryLabel: 'Got it',
        });
      }
    } catch (err: any) {
      if (isMissingPaymentResumeRoute(err)) {
        const paymentsUrl = `${WEB_APP_BASE_URL}/payments`;
        Alert.alert(
          'Payment Not Started',
          `Backend ${API_HOST_LABEL} cannot resume payment yet. You can continue from the payments page.`,
          [
            {
              text: 'Open Payments Page',
              onPress: async () => {
                try {
                  await openAuthSessionAsync(paymentsUrl, bookingCallbackUrl);
                } catch {
                  Alert.alert('Open Failed', 'Could not open web payments page. Please try again.');
                }
              },
            },
            { text: 'OK' },
          ]
        );
      } else {
        Alert.alert('Payment Error', err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Failed to resume payment.');
      }
    } finally {
      setResumingPaymentId(null);
    }
  }

  async function handlePayBalance(item: Consultation) {
    if (!item.balance_payment_id) {
      Alert.alert('Unavailable', 'No remaining balance payment was found for this consultation.');
      return;
    }

    setPayingBalanceId(item.balance_payment_id);
    try {
      const { data } = await clientApi.resumePayment(item.balance_payment_id, {
        paymentMethodTypes: BOOKING_PAYMENT_METHODS,
        successUrl: bookingCallbackUrl,
        cancelUrl: bookingCallbackUrl,
      });

      const checkoutUrl = data?.checkout_url;
      if (!checkoutUrl) {
        throw new Error('No checkout URL was returned for this payment.');
      }

      const result = await openAuthSessionAsync(checkoutUrl, bookingCallbackUrl);

      if (result.type === 'success') {
        // Poll for confirmation
        let confirmed = false;
        for (let i = 0; i < 6; i++) {
          const statusResponse = await clientApi.paymentStatus(item.balance_payment_id);
          const payment = statusResponse.data?.payment;
          if (payment?.status === 'paid') {
            confirmed = true;
            break;
          }
          if (payment?.status === 'failed') break;
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
        await load();
        if (confirmed) {
          showFeedback({
            title: 'Payment complete',
            message: 'Your remaining balance has been paid. Thank you.',
            tone: 'success',
            primaryLabel: 'Done',
          });
        } else {
          showFeedback({
            title: 'Still confirming',
            message: 'Payment is still being confirmed. Please refresh shortly.',
            tone: 'info',
            primaryLabel: 'Okay',
          });
        }
        return;
      }

      if (result.type === 'cancel') {
        showFeedback({
          title: 'Payment cancelled',
          message: 'Balance payment was cancelled. You can pay the remaining balance anytime from this screen.',
          tone: 'warning',
          primaryLabel: 'Got it',
        });
      }
    } catch (err: any) {
      Alert.alert('Payment Error', err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Failed to initiate balance payment.');
    } finally {
      setPayingBalanceId(null);
      await load();
    }
  }

  async function handleSetJoinReminder(item: Consultation) {
    const scheduledTime = new Date(item.scheduled_at).getTime();
    if (!scheduledTime || Number.isNaN(scheduledTime)) {
      Alert.alert('Reminder Failed', 'Consultation schedule is invalid.');
      return;
    }

    const reminderAt = new Date(scheduledTime - REMINDER_OFFSET_MINUTES * 60 * 1000);
    if (reminderAt.getTime() <= Date.now()) {
      Alert.alert('Too Late', `Reminders can only be set at least ${REMINDER_OFFSET_MINUTES} minutes before the call.`);
      return;
    }

    if (isExpoGo || !Notifications) {
      Alert.alert('Not Supported', 'Local reminders are unavailable in Expo Go. Use a development build to enable reminders.');
      return;
    }

    const reminderKey = `consultation_reminder_${item.id}`;
    const reminderStamp = `${item.scheduled_at}|${REMINDER_OFFSET_MINUTES}`;

    try {
      const existing = await AsyncStorage.getItem(reminderKey);
      if (existing === reminderStamp) {
        Alert.alert('Reminder Exists', 'A join reminder is already set for this consultation.');
        return;
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        Alert.alert('Permission Needed', 'Please enable notification permission to use reminders.');
        return;
      }

      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Join Call Reminder',
          body: `${item.lawyer?.name || 'Your lawyer'} consultation starts in ${REMINDER_OFFSET_MINUTES} minutes.`,
          data: {
            type: 'consultation',
            consultationId: String(item.id),
            consultationCode: item.code,
          },
        },
        trigger: reminderAt,
      });

      await AsyncStorage.setItem(reminderKey, reminderStamp);
      Alert.alert('Reminder Set', `We will remind you ${REMINDER_OFFSET_MINUTES} minutes before the call.`);
    } catch {
      Alert.alert('Reminder Failed', 'Could not schedule the reminder right now.');
    }
  }

  async function confirmAndJoinCall(item: Consultation) {
    if (normalizeConsultationType(item.type) !== 'video') {
      Alert.alert('Video Unavailable', 'This consultation is not a video session.');
      return;
    }

    const scheduledTime = new Date(item.scheduled_at).getTime();
    const now = Date.now();
    const durationMinutes = Number(item.duration_minutes || 60);
    const callEndTime = scheduledTime + durationMinutes * 60 * 1000;
    const joinAvailability = getJoinAvailability(item, now);
    if (!scheduledTime || Number.isNaN(scheduledTime)) {
      Alert.alert('Invalid Schedule', 'This consultation schedule is invalid.');
      return;
    }
    // Custom logic: Only allow joining if user has paid (item.paid === true)
    if (item.paid === false) {
      Alert.alert('Payment Required', 'You must complete payment before joining the call.');
      return;
    }
    // Custom logic: Only allow joining if user has accepted terms (item.termsAccepted === true)
    if (item.termsAccepted === false) {
      Alert.alert('Terms Not Accepted', 'You must accept the terms and conditions before joining the call.');
      return;
    }
    if (now > callEndTime) {
      Alert.alert(
        'Too Late',
        'This consultation call window has already ended.'
      );
      return;
    }
    if (item.status !== 'upcoming') {
      Alert.alert('Not Ready', 'You can only join calls for upcoming consultations.');
      return;
    }
    if (!item.lawyer || !item.lawyer.id) {
      Alert.alert('Not Assigned', 'A lawyer has not yet been assigned to this consultation.');
      return;
    }

    if (now < joinAvailability.availableAt && !item.can_join_video && !item.lawyer_in_video_call) {
      try {
        const response = await clientApi.consultationStatus(item.id);
        const lawyerInCall = Boolean(response?.data?.lawyer_in_video_call);
        if (!lawyerInCall) {
          Alert.alert(
            'Call Not Started',
            `You can join at ${formatTimeShort(joinAvailability.availableAt)}, or earlier once your lawyer opens the session.`
          );
          return;
        }
      } catch {
        Alert.alert(
          'Call Not Started',
          `You can join at ${formatTimeShort(joinAvailability.availableAt)}, or earlier once your lawyer opens the session.`
        );
        return;
      }
    }

    router.push({
      pathname: '/(client)/video-call',
      params: {
        mode: 'consultation',
        consultationId: item.id.toString(),
        consultationCode: String(item.code || ''),
        scheduledAt: String(item.scheduled_at || ''),
        durationMinutes: String(item.duration_minutes || ''),
        conversationId: item.id.toString(),
        title: item.type || 'Consultation',
      },
    });
  }

  function openPhoneSession(item: Consultation) {
    const phoneNumber = String(item.lawyer?.phone || item.lawyer_phone || item.phone || '').trim();
    if (!phoneNumber) {
      Alert.alert('Phone Number Unavailable', 'No lawyer phone number is attached to this consultation yet.');
      return;
    }

    void Linking.openURL(`tel:${phoneNumber}`).catch(() => {
      Alert.alert('Call Failed', 'Could not open the phone dialer on this device.');
    });
  }

  function showInPersonSession(item: Consultation) {
    const location = String(item.meeting_location || item.location || item.address || item.lawyer?.location || '').trim();
    Alert.alert(
      'In-person Session',
      location
        ? `Please meet your lawyer at:\n\n${location}`
        : 'This is an in-person consultation. The meeting location is not attached yet. Please check your messages or contact your lawyer.',
    );
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
      {/* Payment Processing Modal */}
      <PaymentProcessingModal
        visible={showPaymentProcessing}
        paymentId={currentPaymentId || 0}
        consultationCode={currentConsultationCode}
        onCancel={() => {
          setShowPaymentProcessing(false);
          setCurrentPaymentId(null);
          setCurrentConsultationCode('');
        }}
        onSuccess={() => {
          setShowPaymentProcessing(false);
          setCurrentPaymentId(null);
          setCurrentConsultationCode('');
          showFeedback({
            title: 'Payment confirmed',
            message: 'Your consultation is booked and the downpayment is confirmed.',
            tone: 'success',
            primaryLabel: 'View booking',
          });
          load();
        }}
        onError={(error) => {
          setShowPaymentProcessing(false);
          setCurrentPaymentId(null);
          setCurrentConsultationCode('');
          showFeedback({
            title: 'Payment error',
            message: error,
            tone: 'danger',
            primaryLabel: 'Okay',
          });
          load();
        }}
      />

      <FeedbackModal
        visible={feedback.visible}
        title={feedback.title}
        message={feedback.message}
        tone={feedback.tone}
        primaryLabel={feedback.primaryLabel}
        onPrimary={closeFeedback}
        onClose={closeFeedback}
      />

      {/* Booking Modal (outside SafeAreaView for correct JSX structure) */}
      <Modal visible={showBooking} transparent animationType="slide" onRequestClose={closeBookingModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Book Consultation</Text>
            <Text style={styles.modalSub}>Select date and details</Text>
            {bookingAvailabilityLoading ? (
              <View style={[styles.availabilityBanner, styles.availabilityBannerNeutral]}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.availabilityBannerText}>Checking the lawyer&apos;s schedule...</Text>
              </View>
            ) : bookingAvailabilityConflict ? (
              <View style={[styles.availabilityBanner, styles.availabilityBannerBusy]}>
                <Ionicons name="time-outline" size={16} color={Colors.warning} />
                <Text style={styles.availabilityBannerText}>
                  This time is already booked for another client. Please choose another slot.
                </Text>
              </View>
            ) : bookingAvailabilityError ? (
              <View style={[styles.availabilityBanner, styles.availabilityBannerNeutral]}>
                <Ionicons name="alert-circle-outline" size={16} color={Colors.textMuted} />
                <Text style={styles.availabilityBannerText}>{bookingAvailabilityError}</Text>
              </View>
            ) : null}
            <TouchableOpacity
              style={[styles.commentInput, styles.dateInput]}
              onPress={() => setShowBookingDatePicker(true)}
              accessibilityRole="button"
              accessibilityLabel="Select booking date and time"
            >
              <Text style={styles.dateInputText}>{bookingDate.toLocaleString()}</Text>
            </TouchableOpacity>
            {(Platform.OS === 'ios' || showBookingDatePicker) && (
              <DateTimePicker
                value={bookingDate}
                mode="datetime"
                display="default"
                onChange={(event: any, date: Date | undefined) => {
                  if (Platform.OS === 'android') {
                    setShowBookingDatePicker(false);
                    if (event?.type === 'dismissed') return;
                  }
                  if (date) setBookingDate(date);
                }}
              />
            )}
            <TextInput
              style={styles.commentInput}
              placeholder="Type (e.g. Consultation, Advice)"
              value={bookingType}
              onChangeText={setBookingType}
            />
            <TextInput
              style={styles.commentInput}
              placeholder="Duration (minutes)"
              keyboardType="numeric"
              value={bookingDuration.toString()}
              onChangeText={v => setBookingDuration(Number(v))}
            />
            <TextInput
              style={styles.commentInput}
              placeholder="Price (PHP)"
              keyboardType="numeric"
              value={bookingPrice.toString()}
              onChangeText={v => setBookingPrice(Number(v))}
            />
            <TouchableOpacity
              style={[
                styles.submitBtn,
                bookingAvailabilityConflict && styles.submitBtnDisabled,
              ]}
              onPress={handleBookConsultation}
              disabled={bookingLoading || bookingAvailabilityConflict}
            >
              {bookingLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Book</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.submitBtn, {backgroundColor: Colors.error, marginTop: 8}]} onPress={closeBookingModal}>
              <Text style={styles.submitBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <SafeAreaView style={styles.container}>
        <Animated.View
          style={{
            opacity: screenEntrance,
            transform: [
              {
                translateY: screenEntrance.interpolate({
                  inputRange: [0, 1],
                  outputRange: [10, 0],
                }),
              },
            ],
          }}
        >
          <LinearGradient
            colors={['#061B3A', '#0C2D5F', '#0A2550']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerCard}
          >
            <Text style={styles.headerEyebrow}>CLIENT SPACE</Text>
            <Text style={styles.headerTitle}>Consultations</Text>
            <Text style={styles.headerSub}>Track your schedules, payments, and follow-ups in one place.</Text>
            <View style={styles.overviewRow}>
              <View style={styles.overviewChip}>
                <Text style={styles.overviewValue}>{consultationOverview.total}</Text>
                <Text style={styles.overviewLabel}>Total</Text>
              </View>
              <View style={styles.overviewChip}>
                <Text style={styles.overviewValue}>{consultationOverview.upcoming}</Text>
                <Text style={styles.overviewLabel}>Upcoming</Text>
              </View>
              <View style={styles.overviewChip}>
                <Text style={styles.overviewValue}>{consultationOverview.pending}</Text>
                <Text style={styles.overviewLabel}>Pending</Text>
              </View>
              <View style={styles.overviewChip}>
                <Text style={styles.overviewValue}>{consultationOverview.completed}</Text>
                <Text style={styles.overviewLabel}>Done</Text>
              </View>
            </View>
            {__DEV__ ? <Text style={styles.apiHostText}>API: {LARAVEL_API_BASE}</Text> : null}
            <View style={styles.headerActionRow}>
              <TouchableOpacity
                style={styles.headerActionBtn}
                onPress={() => router.push('/(client)/lawyers')}
              >
                <Text style={styles.headerActionText}>Find Lawyer</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.headerActionBtn, styles.headerActionBtnAlt]}
                onPress={() => router.push('/(client)/messages')}
              >
                <Text style={styles.headerActionText}>Messages</Text>
              </TouchableOpacity>
              {openedFromNotification ? (
                <TouchableOpacity
                  style={styles.headerActionBtn}
                  onPress={() => router.back()}
                >
                  <Text style={styles.headerActionText}>Back</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.headerActionBtn}
                  onPress={() => router.push({ pathname: '/(client)/payments', params: { backTo: 'consultations' } } as any)}
                >
                  <Text style={styles.headerActionText}>Payments</Text>
                </TouchableOpacity>
              )}
            </View>
          </LinearGradient>
        </Animated.View>
        <Animated.View
          style={{
            opacity: screenEntrance,
            transform: [
              {
                translateY: screenEntrance.interpolate({
                  inputRange: [0, 1],
                  outputRange: [10, 0],
                }),
              },
            ],
          }}
        >
          <View style={styles.tabsContainer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabs}
              style={styles.tabsScroller}
            >
              {STATUS_TABS.map((item: ConsultationStatus) => (
                <TouchableOpacity
                  key={item}
                  style={[styles.tab, activeTab === item && styles.tabActive]}
                  onPress={() => setActiveTab(item)}
                >
                  <Text style={[styles.tabText, activeTab === item && styles.tabTextActive]}>
                    {item.charAt(0).toUpperCase() + item.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </Animated.View>
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id.toString()}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          contentContainerStyle={[
            filtered.length ? styles.list : styles.emptyWrap,
            { paddingBottom: insets.bottom + 72 },
          ]}
          ListHeaderComponent={
            activeTab === 'refunds' ? (
              <View style={styles.refundSummaryCard}>
                <View style={styles.refundSummaryTop}>
                  <Text style={styles.refundSummaryTitle}>Refund Summary</Text>
                  <Text style={styles.refundSummaryTotal}>Total: {refundSummary.total}</Text>
                </View>
                <View style={styles.refundSummaryRow}>
                  <View style={[styles.refundPill, styles.refundPillProcessing]}>
                    <Ionicons name="time-outline" size={14} color={Colors.warning} />
                    <Text style={styles.refundPillText}>Processing: {refundSummary.processing}</Text>
                  </View>
                  <View style={[styles.refundPill, styles.refundPillCompleted]}>
                    <Ionicons name="checkmark-circle-outline" size={14} color={Colors.success} />
                    <Text style={styles.refundPillText}>Completed: {refundSummary.completed}</Text>
                  </View>
                </View>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyStateWrap}>
              <EmptyState message="No consultations yet. Your bookings will appear here once scheduled." />
              {activeTab !== 'all' && (
                <TouchableOpacity style={styles.resetTabBtn} onPress={() => setActiveTab('all')}>
                  <Text style={styles.resetTabBtnText}>Show All Consultations</Text>
                </TouchableOpacity>
              )}
            </View>
          }
          renderItem={({ item }) => {
            const statusColor = getStatusColor(item.status);
            const lawyerName = item.lawyer?.name || 'Assigned Lawyer';
            const paymentLabel = getPaymentStatusLabel(item.payment_status);
            const paymentColor = getPaymentStatusColor(item.payment_status);
            const showRefundBadge = item.status === 'cancelled' && (item.payment_status === 'paid' || item.payment_status === 'downpayment_paid');
            const canResumePayment = !!item.payment_id && (item.payment_status === 'pending' || item.payment_status === 'failed') && item.status !== 'cancelled';
            const hasUnpaidBalance = item.status === 'completed'
              && !!item.balance_payment_id
              && item.balance_payment_status !== 'paid';
            const joinAvailability = getJoinAvailability(item);
            const typeMeta = getConsultationTypeMeta(item.type);
            return (
              <View style={[styles.card, Number(item.id) === targetConsultationId && styles.cardHighlighted]}>
                <View style={styles.cardTop}>
                  <Text style={styles.code}>#{item.code || item.id}</Text>
                  <View style={[styles.badge, { backgroundColor: `${statusColor}20` }]}> 
                    <Text style={[styles.badgeText, { color: statusColor }]}>{item.status}</Text>
                  </View>
                </View>
                <Text style={styles.lawyerName}>{lawyerName}</Text>
                <Text style={styles.meta}>{formatDate(item.scheduled_at)}</Text>
                <Text style={styles.meta}>{typeMeta.label.toUpperCase()} • {item.duration_minutes || 0} min</Text>
                {/* Payment badge moved to cardBottom */}
                {showRefundBadge ? (
                  <View style={[styles.paymentBadge, { backgroundColor: `${Colors.warning}16`, borderColor: `${Colors.warning}40`, marginTop: 8 }]}>
                    <Ionicons name="swap-horizontal-outline" size={14} color={Colors.warning} />
                    <Text style={[styles.paymentBadgeText, { color: Colors.warning }]}>Refund processing</Text>
                  </View>
                ) : null}
                <View style={styles.cardBottom}>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {paymentLabel ? (
                      <View style={[styles.paymentBadge, { backgroundColor: `${paymentColor}18`, borderColor: `${paymentColor}40`, marginRight: 8 }]}> 
                        <Ionicons
                          name={item.payment_status === 'pending' ? 'time-outline' : item.payment_status === 'failed' ? 'alert-circle-outline' : 'checkmark-circle-outline'}
                          size={14}
                          color={paymentColor}
                        />
                        <Text style={[styles.paymentBadgeText, { color: paymentColor }]}>{paymentLabel}</Text>
                      </View>
                    ) : null}
                    {canResumePayment ? (
                      <TouchableOpacity
                        style={styles.resumeBtn}
                        onPress={() => handleResumePayment(item)}
                        disabled={resumingPaymentId === item.payment_id}
                      >
                        {resumingPaymentId === item.payment_id ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <>
                            <Ionicons name="wallet-outline" size={15} color="#fff" />
                            <Text style={styles.resumeBtnText}>Resume Payment</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    ) : item.status === 'pending' ? (
                      <TouchableOpacity style={styles.cancelBtn} onPress={() => handleCancel(item.id)}>
                        <Text style={styles.cancelBtnText}>Cancel</Text>
                      </TouchableOpacity>
                    ) : null}
                    {item.status === 'upcoming' && (
                      <TouchableOpacity
                        style={styles.reminderBtn}
                        onPress={() => handleSetJoinReminder(item)}
                      >
                        <Ionicons name="notifications-outline" size={15} color={Colors.primary} />
                        <Text style={styles.reminderBtnText}>Remind Me</Text>
                      </TouchableOpacity>
                    )}
                    {item.status === 'upcoming' && typeMeta.type === 'video' && joinAvailability.canJoin && (
                      <TouchableOpacity
                        style={[styles.reviewBtn, { backgroundColor: Colors.info, borderColor: Colors.info }]}
                        onPress={() => confirmAndJoinCall(item)}
                      >
                        <Ionicons name="videocam-outline" size={15} color="#fff" />
                        <Text style={[styles.reviewBtnText, { color: '#fff' }]}>Join Call</Text>
                      </TouchableOpacity>
                    )}
                    {item.status === 'upcoming' && typeMeta.type === 'phone' && (
                      <TouchableOpacity
                        style={[styles.reviewBtn, { backgroundColor: Colors.info, borderColor: Colors.info }]}
                        onPress={() => openPhoneSession(item)}
                      >
                        <Ionicons name="call-outline" size={15} color="#fff" />
                        <Text style={[styles.reviewBtnText, { color: '#fff' }]}>Call Lawyer</Text>
                      </TouchableOpacity>
                    )}
                    {item.status === 'upcoming' && typeMeta.type === 'in-person' && (
                      <TouchableOpacity
                        style={[styles.reviewBtn, { backgroundColor: Colors.primary, borderColor: Colors.primary }]}
                        onPress={() => showInPersonSession(item)}
                      >
                        <Ionicons name="business-outline" size={15} color="#fff" />
                        <Text style={[styles.reviewBtnText, { color: '#fff' }]}>Session Details</Text>
                      </TouchableOpacity>
                    )}
                    {item.status === 'upcoming' && typeMeta.type === 'video' && !joinAvailability.canJoin && joinAvailability.tooEarly && (
                      <View style={styles.joinUnavailableBanner}>
                        <Ionicons name="time-outline" size={15} color="#96A0AE" />
                        <Text style={styles.joinUnavailableText}>Available {formatTimeShort(joinAvailability.availableAt)}</Text>
                      </View>
                    )}
                    {hasUnpaidBalance && (
                      <TouchableOpacity
                        style={[styles.resumeBtn, { backgroundColor: '#C0392B' }]}
                        onPress={() => handlePayBalance(item)}
                        disabled={payingBalanceId === item.balance_payment_id}
                      >
                        {payingBalanceId === item.balance_payment_id ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <>
                            <Ionicons name="card-outline" size={15} color="#fff" />
                            <Text style={styles.resumeBtnText}>
                              Pay Balance{item.balance_amount ? ` (₱${Number(item.balance_amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : ''}
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}
                    {item.status === 'completed' && !item.has_review && (
                      <TouchableOpacity style={styles.reviewBtn} onPress={() => setReviewTarget(item)}>
                        <Ionicons name="star-outline" size={15} color={Colors.secondary} />
                        <Text style={styles.reviewBtnText}>Review</Text>
                      </TouchableOpacity>
                    )}
                    {item.status === 'completed' && item.has_review && (
                      <View style={styles.reviewedBadge}>
                        <Ionicons name="checkmark-circle" size={15} color={Colors.success} />
                        <Text style={styles.reviewedText}>Reviewed</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.price}>{formatPhp(Number(item.price || 0))}</Text>
                </View>
              </View>
            );
          }}
        />
        <Modal visible={!!reviewTarget} transparent animationType="slide" onRequestClose={() => setReviewTarget(null)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Rate Consultation</Text>
                <TouchableOpacity onPress={() => setReviewTarget(null)}>
                  <Ionicons name="close" size={22} color={Colors.text} />
                </TouchableOpacity>
              </View>
              <Text style={styles.modalSub}>How was your consultation with {reviewTarget?.lawyer?.name || 'your lawyer'}?</Text>
              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity key={star} onPress={() => setRating(star)}>
                    <Ionicons name={star <= rating ? 'star' : 'star-outline'} size={30} color={Colors.secondary} />
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={styles.commentInput}
                multiline
                placeholder="Write your feedback (optional)"
                value={comment}
                onChangeText={setComment}
              />
              <TouchableOpacity style={styles.submitBtn} onPress={submitReview} disabled={submittingReview}>
                {submittingReview ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Submit Review</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </>
  );
}

function getStatusColor(status: string) {
  if (status === 'pending') return Colors.warning;
  if (status === 'upcoming') return Colors.info;
  if (status === 'completed') return Colors.success;
  if (status === 'cancelled') return Colors.error;
  return Colors.textMuted;
}

function getPaymentStatusColor(status?: string) {
  if (status === 'refunded' || status === 'refund_completed') return Colors.success;
  if (status === 'refund_pending' || status === 'refunding') return Colors.warning;
  if (status === 'paid' || status === 'downpayment_paid') return Colors.success;
  if (status === 'pending') return Colors.warning;
  if (status === 'failed') return Colors.error;
  return Colors.textMuted;
}

function getPaymentStatusLabel(status?: string) {
  if (status === 'refunded' || status === 'refund_completed') return 'Refund completed';
  if (status === 'refund_pending' || status === 'refunding') return 'Refund processing';
  if (status === 'paid') return 'Fully paid';
  if (status === 'downpayment_paid') return 'Downpayment paid';
  if (status === 'pending') return 'Payment pending';
  if (status === 'failed') return 'Payment failed';
  return null;
}

function formatDate(date: string) {
  if (!date) return 'No schedule set';
  const d = new Date(date);
  return d.toLocaleString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).replace(' AM', ' am').replace(' PM', ' pm');
}

function formatTimeShort(date: string | number | Date) {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';

  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const suffix = hours >= 12 ? 'pm' : 'am';
  hours %= 12;
  if (hours === 0) hours = 12;

  return `${hours}:${minutes}${suffix}`;
}

function normalizeConsultationType(type?: string) {
  return String(type || 'video').trim().toLowerCase().replace(/[_\s]+/g, '-');
}

function getConsultationTypeMeta(type?: string) {
  const normalized = normalizeConsultationType(type);
  if (normalized === 'phone') return { type: normalized, icon: 'call-outline', label: 'Phone' };
  if (normalized === 'in-person') return { type: normalized, icon: 'business-outline', label: 'In-person' };
  return { type: 'video', icon: 'videocam-outline', label: 'Video' };
}

function getJoinAvailability(item: Consultation, now = Date.now()) {
  if (normalizeConsultationType(item.type) !== 'video') {
    return { canJoin: false, availableAt: 0, tooEarly: false };
  }

  const scheduledTime = new Date(item.scheduled_at).getTime();
  if (!scheduledTime || Number.isNaN(scheduledTime)) {
    return { canJoin: false, availableAt: 0, tooEarly: false };
  }

  const durationMinutes = Number(item.duration_minutes || 60);
  const callEndTime = scheduledTime + durationMinutes * 60 * 1000;
  const availableAt = scheduledTime - CALL_JOIN_LEAD_MINUTES * 60 * 1000;
  const sessionOpened = Boolean(item.can_join_video || item.lawyer_in_video_call);
  const canJoin = item.status === 'upcoming' && now <= callEndTime && (now >= availableAt || sessionOpened);
  const tooEarly = item.status === 'upcoming' && now < availableAt && !sessionOpened;

  return { canJoin, availableAt, tooEarly };
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
  headerCard: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 10,
    padding: 18,
    borderRadius: 22,
    shadowColor: '#091B39',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 14,
    elevation: 7,
  },
  headerEyebrow: { color: '#C6D9FF', fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  headerTitle: { color: '#F8FBFF', fontSize: 40, fontWeight: '900', marginTop: 4, lineHeight: 42 },
  headerSub: { color: '#C6D9FF', fontSize: 14, marginTop: 6, lineHeight: 19 },
  apiHostText: { color: '#9EB0D1', fontSize: 11, marginTop: 10 },
  headerActionRow: { marginTop: 12, alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' },
  headerActionBtn: { backgroundColor: '#17437F', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14 },
  headerActionBtnAlt: { backgroundColor: '#2D6CE8' },
  headerActionText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  overviewRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  overviewChip: {
    minWidth: 74,
    flexGrow: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  overviewValue: { color: '#fff', fontSize: 18, fontWeight: '900' },
  overviewLabel: { color: '#D7E1F4', fontSize: 11, fontWeight: '700', marginTop: 2 },
  tabsContainer: { height: 54, justifyContent: 'center' },
  tabsScroller: { flexGrow: 0 },
  tabs: { paddingHorizontal: 16, paddingBottom: 10, gap: 10, alignItems: 'center' },
  tab: {
    backgroundColor: '#E5EAF4',
    borderRadius: 100,
    paddingVertical: 9,
    paddingHorizontal: 16,
  },
  tabActive: {
    backgroundColor: '#0F3872',
    shadowColor: '#0A2A58',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  tabText: { color: Colors.textMuted, fontWeight: '700', fontSize: 12 },
  tabTextActive: { color: '#fff' },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  refundSummaryCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8EDF5',
    padding: 12,
    marginBottom: 10,
  },
  refundSummaryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  refundSummaryTitle: { color: Colors.text, fontWeight: '800', fontSize: 14 },
  refundSummaryTotal: { color: Colors.textMuted, fontWeight: '700', fontSize: 12 },
  refundSummaryRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  refundPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
  },
  refundPillProcessing: { backgroundColor: `${Colors.warning}14`, borderColor: `${Colors.warning}40` },
  refundPillCompleted: { backgroundColor: `${Colors.success}14`, borderColor: `${Colors.success}40` },
  refundPillText: { color: Colors.text, fontSize: 12, fontWeight: '800' },
  emptyWrap: { flexGrow: 1, justifyContent: 'center' },
  emptyStateWrap: { alignItems: 'center' },
  resetTabBtn: {
    marginTop: 10,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  resetTabBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#DFE7F4',
    padding: 16,
    marginBottom: 14,
    shadowColor: '#0D1E3A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 3,
  },
  cardHighlighted: {
    borderWidth: 2,
    borderColor: Colors.info,
    backgroundColor: '#F7FBFF',
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  code: { color: Colors.primary, fontSize: 12, fontWeight: '800' },
  badge: { borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  badgeText: { textTransform: 'capitalize', fontWeight: '800', fontSize: 11 },
  lawyerName: { color: '#0D2445', fontSize: 18, fontWeight: '900', marginTop: 10, lineHeight: 22 },
  meta: { color: '#4E617F', fontSize: 13, marginTop: 4, fontWeight: '600' },
  paymentBadge: {
    marginTop: 10,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  paymentBadgeText: { fontSize: 11, fontWeight: '800' },
  cardBottom: { marginTop: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  price: { color: '#00A35C', fontWeight: '900', fontSize: 20, letterSpacing: 0.2 },
  cancelBtn: {
    borderWidth: 1.5,
    borderColor: Colors.error,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  cancelBtnText: { color: Colors.error, fontWeight: '700', fontSize: 12 },
  resumeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 132,
    justifyContent: 'center',
  },
  resumeBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  reviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.secondary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: `${Colors.secondary}18`,
  },
  reminderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: `${Colors.primary}55`,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#fff',
  },
  reminderBtnText: { color: Colors.primary, fontWeight: '700', fontSize: 12 },
  reviewBtnText: { color: Colors.secondary, fontWeight: '700', fontSize: 12 },
  joinUnavailableBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#D1D5DB',
    minWidth: 148,
  },
  joinUnavailableText: { color: '#96A0AE', fontWeight: '800', fontSize: 12 },
  reviewedBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reviewedText: { color: Colors.success, fontWeight: '700', fontSize: 12 },
  modalOverlay: { flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 18,
    paddingBottom: 26,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { color: Colors.text, fontSize: 18, fontWeight: '800' },
  modalSub: { color: Colors.textMuted, marginTop: 10, marginBottom: 14 },
  availabilityBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: 1,
  },
  availabilityBannerBusy: {
    backgroundColor: '#FEF3F2',
    borderColor: '#FECACA',
  },
  availabilityBannerNeutral: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  availabilityBannerText: {
    flex: 1,
    color: Colors.text,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  starsRow: { flexDirection: 'row', gap: 8, justifyContent: 'center', marginBottom: 16 },
  commentInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    minHeight: 90,
    padding: 12,
    color: Colors.text,
    backgroundColor: '#fff',
    textAlignVertical: 'top',
  },
  dateInput: {
    minHeight: 52,
    justifyContent: 'center',
    marginBottom: 8,
  },
  dateInputText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  submitBtn: {
    marginTop: 14,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    backgroundColor: '#94A3B8',
  },
  submitBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
