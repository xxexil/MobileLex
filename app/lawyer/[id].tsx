import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  TextInput,
  BackHandler,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { clientApi } from '@/services/api';
import { useAuth } from '@/context/auth';
import { Colors } from '@/constants/theme';
import { LARAVEL_API_BASE } from '@/services/endpoints';
import {
  CLIENT_DOUBLE_BOOKING_MESSAGE,
  extractConsultationList,
  hasClientBookingConflict,
} from '@/utils/clientBookingConflicts';
import Constants from 'expo-constants';
import * as ExpoLinking from 'expo-linking';
import { openAuthSessionAsync } from 'expo-web-browser';

const DURATIONS = [30, 60, 90, 120];
const TYPES = ['video', 'phone', 'in-person'];
const BOOKING_PAYMENT_METHODS = ['card', 'gcash', 'dob'];
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TIME_PICKER_HOURS = Array.from({ length: 12 }, (_, index) => index + 1);
const TIME_PICKER_MINUTES = Array.from({ length: 60 }, (_, index) => index);
const TIME_PICKER_MERIDIEMS = ['AM', 'PM'] as const;
const MIN_BOOKING_LEAD_MINUTES = 5;
const CASE_DOCUMENT_EXTENSIONS = ['jpg', 'jpeg', 'png', 'pdf', 'doc', 'docx'];
const CASE_DOCUMENT_MIME_TYPES = ['image/*', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const MAX_CASE_DOCUMENT_BYTES = 10 * 1024 * 1024;

type AvailabilitySlot = {
  time: string;
  label: string;
};

type LawyerAvailability = {
  month: string;
  selected_date: string | null;
  blocked_dates: string[];
  unavailable_dates: string[];
  available_dates: string[];
  slots: AvailabilitySlot[];
};

type CaseDocumentAsset = {
  uri: string;
  name: string;
  mimeType?: string | null;
  size?: number | null;
};

type TimeBookedPromptState = {
  visible: boolean;
  selectedTimeLabel: string;
  recommendations: AvailabilitySlot[];
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

function getTodayStart() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function formatLocalDateTime(value: Date) {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}

function formatBookingDateTime(dateKey: string, timeKey: string) {
  if (!dateKey || !timeKey) return 'Choose an available date and time';
  const value = new Date(`${dateKey}T${timeKey}:00`);
  if (Number.isNaN(value.getTime())) return 'Choose an available date and time';
  return value.toLocaleString('en-PH', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function buildTimeValue(hour12: number, minute: number, meridiem: 'AM' | 'PM') {
  const normalizedHour = hour12 === 12 ? 0 : hour12;
  const hour24 = meridiem === 'PM' ? normalizedHour + 12 : normalizedHour;
  return `${pad(hour24)}:${pad(minute)}`;
}

function normalizeTimeValue(value: string) {
  const [hourRaw, minuteRaw] = String(value || '').split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return '';
  return `${pad(Math.max(0, Math.min(23, hour)))}:${pad(Math.max(0, Math.min(59, minute)))}`;
}

function hasSlotTime(slots: AvailabilitySlot[], timeKey: string) {
  const normalized = normalizeTimeValue(timeKey);
  return Boolean(normalized) && slots.some((slot) => normalizeTimeValue(slot.time) === normalized);
}

function firstSlotTime(slots: AvailabilitySlot[]) {
  for (const slot of slots) {
    const normalized = normalizeTimeValue(slot.time);
    if (normalized) return normalized;
  }
  return '';
}

function formatSlotTimeLabel(timeKey: string) {
  const normalized = normalizeTimeValue(timeKey);
  if (!normalized) return 'that time';

  return new Date(`2000-01-01T${normalized}:00`).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
}

function getRecommendedSlots(slots: AvailabilitySlot[], selectedTime: string, limit = 3) {
  const selected = normalizeTimeValue(selectedTime);
  const selectedMinutes = (() => {
    const [hour, minute] = selected.split(':').map(Number);
    return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : -1;
  })();

  const normalizedSlots = slots
    .map((slot) => {
      const time = normalizeTimeValue(slot.time);
      const [hour, minute] = time.split(':').map(Number);
      return {
        ...slot,
        time,
        minutes: Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : -1,
      };
    })
    .filter((slot) => slot.time && slot.minutes >= 0)
    .sort((a, b) => a.minutes - b.minutes);

  const uniqueSlots = [...normalizedSlots]
    .filter((slot, index, source) => source.findIndex((candidate) => candidate.time === slot.time) === index);
  const afterSelected = uniqueSlots.filter((slot) => slot.minutes > selectedMinutes);
  return [...afterSelected, ...uniqueSlots]
    .filter((slot, index, source) => source.findIndex((candidate) => candidate.time === slot.time) === index)
    .slice(0, limit);
}

function getTimeParts(timeKey: string) {
  const [hourRaw, minuteRaw] = timeKey.split(':');
  const hour24 = Number(hourRaw);
  const minute = Number(minuteRaw);
  const safeHour = Number.isFinite(hour24) ? hour24 : 9;
  const safeMinute = Number.isFinite(minute) ? minute : 0;
  return {
    hour12: safeHour % 12 || 12,
    minute: Math.max(0, Math.min(59, safeMinute)),
    meridiem: safeHour >= 12 ? 'PM' as const : 'AM' as const,
  };
}

function getMonthStart(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function changeMonth(value: Date, amount: number) {
  return new Date(value.getFullYear(), value.getMonth() + amount, 1);
}

function clampBookingMonth(value: Date) {
  const currentMonth = getMonthStart(getTodayStart());
  return formatMonthValue(value) < formatMonthValue(currentMonth) ? currentMonth : getMonthStart(value);
}

function getMinimumBookableTime(base = new Date()) {
  const minimum = new Date(base.getTime() + MIN_BOOKING_LEAD_MINUTES * 60 * 1000);
  minimum.setSeconds(0, 0);
  return minimum;
}

function getNextBookableTime() {
  const next = getMinimumBookableTime();
  return next;
}

function getDefaultBookTimeForDate(dateKey: string, currentTime = '') {
  if (dateKey === formatDateValue(getTodayStart())) {
    const next = getNextBookableTime();
    return `${pad(next.getHours())}:${pad(next.getMinutes())}`;
  }

  return normalizeTimeValue(currentTime) || '09:00';
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

function getFileExtension(filename: string) {
  const value = filename.trim().toLowerCase();
  const lastDot = value.lastIndexOf('.');
  return lastDot >= 0 ? value.slice(lastDot + 1) : '';
}

function isAllowedCaseDocument(asset: CaseDocumentAsset) {
  return CASE_DOCUMENT_EXTENSIONS.includes(getFileExtension(asset.name));
}

const API_HOST_LABEL = (() => {
  try {
    return new URL(LARAVEL_API_BASE).host;
  } catch {
    return LARAVEL_API_BASE;
  }
})();
const WEB_APP_BASE_URL = LARAVEL_API_BASE.replace(/\/api\/?$/, '');

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

function isMissingAvailabilityRoute(error: any) {
  const status = error?.response?.status;
  const message = String(error?.response?.data?.message || error?.response?.data?.error || error?.message || '').toLowerCase();
  return status === 404 && message.includes('availability');
}

function confirmClientBookingConflict() {
  return new Promise<boolean>((resolve) => {
    Alert.alert(
      'Schedule Conflict',
      `${CLIENT_DOUBLE_BOOKING_MESSAGE}\n\nDo you want to continue booking this consultation anyway?`,
      [
        { text: 'Not Now', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Continue', style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}

function extractCheckoutUrl(source: any): string | undefined {
  if (!source) return undefined;

  if (typeof source === 'string') {
    const value = source.trim();
    return /^https?:\/\//i.test(value) ? value : undefined;
  }

  const directCandidates = [
    source?.checkout_url,
    source?.paymongo_checkout_url,
    source?.checkoutUrl,
    source?.payment_url,
    source?.paymentUrl,
    source?.url,
    source?.attributes?.checkout_url,
    source?.attributes?.url,
    source?.payment?.checkout_url,
    source?.payment?.paymongo_checkout_url,
    source?.payment?.attributes?.checkout_url,
    source?.data?.checkout_url,
    source?.data?.paymongo_checkout_url,
    source?.data?.attributes?.checkout_url,
  ];

  for (const candidate of directCandidates) {
    if (typeof candidate === 'string' && /^https?:\/\//i.test(candidate.trim())) {
      return candidate.trim();
    }
  }

  const sessionCandidates = [
    source?.paymongo_session_id,
    source?.session_id,
    source?.paymongoSessionId,
    source?.payment?.paymongo_session_id,
    source?.payment?.session_id,
    source?.data?.paymongo_session_id,
    source?.data?.session_id,
  ];

  for (const sessionId of sessionCandidates) {
    if (typeof sessionId === 'string' && /^cs_[a-z0-9]+$/i.test(sessionId.trim())) {
      return `https://checkout.paymongo.com/${sessionId.trim()}`;
    }
  }

  if (Array.isArray(source)) {
    for (const item of source) {
      const nested = extractCheckoutUrl(item);
      if (nested) return nested;
    }
    return undefined;
  }

  if (typeof source === 'object') {
    for (const value of Object.values(source)) {
      const nested = extractCheckoutUrl(value);
      if (nested) return nested;
    }
  }

  return undefined;
}

function buildFallbackSlots(): AvailabilitySlot[] {
  const slots: AvailabilitySlot[] = [];
  const startHour = 9;
  const endHour = 17;

  for (let hour = startHour; hour <= endHour; hour += 1) {
    const time = `${pad(hour)}:00`;
    const label = new Date(`2000-01-01T${time}:00`).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
    slots.push({ time, label });
  }

  return slots;
}

function buildFallbackAvailability(month: Date, requestedDate: string): LawyerAvailability {
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const todayKey = formatDateValue(new Date());
  const availableDates: string[] = [];
  const unavailableDates: string[] = [];

  for (let day = new Date(monthStart); day <= monthEnd; day.setDate(day.getDate() + 1)) {
    const dateKey = formatDateValue(day);
    const isPast = dateKey < todayKey;
    if (!isPast) {
      availableDates.push(dateKey);
    } else {
      unavailableDates.push(dateKey);
    }
  }

  const safeSelected = availableDates.includes(requestedDate)
    ? requestedDate
    : (availableDates[0] ?? null);

  return {
    month: formatMonthValue(month),
    selected_date: safeSelected,
    blocked_dates: [],
    unavailable_dates: unavailableDates,
    available_dates: availableDates,
    slots: safeSelected ? buildFallbackSlots() : [],
  };
}

async function waitForPaymentResult(paymentId: number) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const statusResponse = await clientApi.paymentStatus(paymentId);
    const payment = statusResponse?.data?.payment;

    if (payment?.status === 'paid' || payment?.status === 'downpayment_paid' || payment?.status === 'failed' || payment?.status === 'cancelled') {
      return payment;
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  return null;
}

export default function LawyerDetailScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { id, openBook, returnTo } = useLocalSearchParams<{ id: string; openBook?: string; returnTo?: string }>();
  const { user } = useAuth();
  const launchedFromBookNow = openBook === '1';
  const backHandledRef = useRef(false);
  const resolvedReturnTarget = useMemo(() => {
    const raw = typeof returnTo === 'string' ? returnTo.trim() : '';
    if (!raw) return '/(client)/lawyers';
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }, [returnTo]);

  const [lawyer, setLawyer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [messaging, setMessaging] = useState(false);

  const [bookingModal, setBookingModal] = useState(launchedFromBookNow);
  const [booking, setBooking] = useState(false);
  const [dateTimePickerVisible, setDateTimePickerVisible] = useState(false);
  const [bookDate, setBookDate] = useState('');
  const [bookTime, setBookTime] = useState('');
  const [duration, setDuration] = useState(60);
  const [type, setType] = useState('video');
  const [notes, setNotes] = useState('');
  const [caseDocument, setCaseDocument] = useState<CaseDocumentAsset | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => getMonthStart(getTodayStart()));
  const [availability, setAvailability] = useState<LawyerAvailability | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState('');
  const [nowTick, setNowTick] = useState(Date.now());
  const [timeBookedPrompt, setTimeBookedPrompt] = useState<TimeBookedPromptState>({
    visible: false,
    selectedTimeLabel: '',
    recommendations: [],
  });

  const bookingReturnPath = useMemo(() => {
    const target = `/lawyer/${id}?openBook=1&returnTo=${encodeURIComponent(resolvedReturnTarget)}`;
    return target;
  }, [id, resolvedReturnTarget]);
  const bookingCallbackUrl = useMemo(() => getMobileCallbackUrl(bookingReturnPath), [bookingReturnPath]);

  useEffect(() => {
    const onBackPress = () => {
      router.replace(resolvedReturnTarget as any);
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [resolvedReturnTarget, router]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (backHandledRef.current) return;
      const actionType = event.data.action.type;
      if (actionType !== 'GO_BACK' && actionType !== 'POP' && actionType !== 'POP_TO_TOP') return;

      event.preventDefault();
      backHandledRef.current = true;
      router.replace(resolvedReturnTarget as any);
    });

    return unsubscribe;
  }, [navigation, resolvedReturnTarget, router]);

  useEffect(() => {
    if (!launchedFromBookNow) return;
    setBookingModal(true);
  }, [launchedFromBookNow]);

  function closeBookingSheet() {
    setDateTimePickerVisible(false);
    if (launchedFromBookNow) {
      router.replace(resolvedReturnTarget as any);
      return;
    }
    setBookingModal(false);
  }

  useEffect(() => {
    let active = true;
    clientApi
      .lawyerDetail(Number(id))
      .then(({ data }: any) => {
        if (active) {
          setLawyer(data);
        }
      })
      .catch(() => {
        if (active) {
          setLawyer(null);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    if (!bookingModal) return;

    let active = true;

    const loadAvailability = async () => {
      setAvailabilityLoading(true);
      const params = {
        month: formatMonthValue(calendarMonth),
        duration_minutes: duration,
        ...(bookDate ? { date: bookDate } : {}),
      };

      try {
        const { data } = await clientApi.lawyerAvailability(Number(id), params);
        if (!active) return;
        const nextAvailability = data as LawyerAvailability;
        setAvailability(nextAvailability);
        setAvailabilityError('');

        if (nextAvailability.selected_date && nextAvailability.selected_date !== bookDate) {
          setBookDate(nextAvailability.selected_date);
        }

        const nextTime = hasSlotTime(nextAvailability.slots, bookTime)
          ? bookTime
          : firstSlotTime(nextAvailability.slots);

        if (nextTime !== bookTime) {
          setBookTime(nextTime);
        }
      } catch (err: any) {
        if (!active) return;
        if (isMissingAvailabilityRoute(err)) {
          const fallbackDate = bookDate || formatDateValue(new Date());
          const fallback = buildFallbackAvailability(calendarMonth, fallbackDate);
          setAvailability(fallback);
          setAvailabilityError('');

          if (fallback.selected_date && fallback.selected_date !== bookDate) {
            setBookDate(fallback.selected_date);
          }

          const nextTime = hasSlotTime(fallback.slots, bookTime)
            ? bookTime
            : firstSlotTime(fallback.slots);
          if (nextTime !== bookTime) {
            setBookTime(nextTime);
          }
          return;
        }

        setAvailability(null);
        setBookTime('');
        setAvailabilityError(String(err?.response?.data?.message || 'Failed to load available dates and time slots.'));
      } finally {
        if (active) {
          setAvailabilityLoading(false);
        }
      }
    };

    loadAvailability();

    return () => {
      active = false;
    };
  }, [bookingModal, calendarMonth, duration, bookDate, id]);

  useEffect(() => {
    if (!bookingModal) return;
    const timer = setInterval(() => setNowTick(Date.now()), 60000);
    return () => clearInterval(timer);
  }, [bookingModal]);

  useEffect(() => {
    if (!bookingModal) return;
    setCalendarMonth((value) => clampBookingMonth(value));
    if (bookDate && bookDate < formatDateValue(getTodayStart())) {
      const next = getNextBookableTime();
      setBookDate(formatDateValue(next));
      setBookTime(`${pad(next.getHours())}:${pad(next.getMinutes())}`);
      setCalendarMonth(getMonthStart(next));
    }
  }, [bookingModal, bookDate]);

  const todayKey = formatDateValue(new Date());
  const currentNow = new Date(nowTick);
  const isTodaySelected = bookDate === todayKey;
  const filteredSlots = (availability?.slots ?? []).filter((slot) => {
    const slotTime = normalizeTimeValue(slot.time);
    if (!slotTime) return false;
    if (!isTodaySelected) return true;
    const slotDate = new Date(`${bookDate}T${slotTime}:00`);
    return slotDate.getTime() >= getMinimumBookableTime(currentNow).getTime();
  });
  const groupedSlots = {
    morning: filteredSlots.filter((slot) => Number(normalizeTimeValue(slot.time).split(':')[0]) < 12),
    afternoon: filteredSlots.filter((slot) => Number(normalizeTimeValue(slot.time).split(':')[0]) >= 12),
  };

  useEffect(() => {
    if (!bookingModal) return;
    if (bookTime) return;

    setBookTime(firstSlotTime(filteredSlots));
  }, [bookingModal, bookTime, filteredSlots]);

  function openDateTimePicker() {
    const todayKey = formatDateValue(getTodayStart());
    const fallbackDate = !bookDate || bookDate < todayKey ? todayKey : bookDate;
    if (!bookDate || bookDate < todayKey) {
      setBookDate(fallbackDate);
      setCalendarMonth(clampBookingMonth(new Date(`${fallbackDate}T00:00:00`)));
    }
    const currentTime = normalizeTimeValue(bookTime);
    const pickedDateTime = currentTime ? new Date(`${fallbackDate}T${currentTime}:00`) : null;
    if (!currentTime || (fallbackDate === todayKey && pickedDateTime && pickedDateTime < getMinimumBookableTime())) {
      setBookTime(getDefaultBookTimeForDate(fallbackDate, currentTime));
    }
    setDateTimePickerVisible(true);
  }

  function setPickedTime(next: Partial<{ hour12: number; minute: number; meridiem: 'AM' | 'PM' }>) {
    const current = getTimeParts(bookTime || '09:00');
    const nextTime = buildTimeValue(
      next.hour12 ?? current.hour12,
      next.minute ?? current.minute,
      next.meridiem ?? current.meridiem,
    );
    const pickedDateTime = new Date(`${bookDate || formatDateValue(getTodayStart())}T${nextTime}:00`);
    if (bookDate === formatDateValue(getTodayStart()) && pickedDateTime < getMinimumBookableTime()) {
      Alert.alert('Invalid Time', `Please choose a time at least ${MIN_BOOKING_LEAD_MINUTES} minutes from now.`);
      return;
    }
    setBookTime(nextTime);
  }

  function closeDateTimePickerIfValid() {
    const todayKey = formatDateValue(getTodayStart());
    if (!bookDate || bookDate < todayKey) {
      Alert.alert('Invalid Date', 'Please choose today or a future date for the consultation.');
      return;
    }

    const scheduled = new Date(`${bookDate}T${bookTime || '00:00'}:00`);
    if (!bookTime || Number.isNaN(scheduled.getTime()) || scheduled < getMinimumBookableTime()) {
      Alert.alert('Invalid Time', `Please choose a time at least ${MIN_BOOKING_LEAD_MINUTES} minutes from now.`);
      return;
    }

    if (filteredSlots.length > 0 && !hasSlotTime(filteredSlots, bookTime)) {
      showLawyerTimeBookedAlert(filteredSlots);
      return;
    }

    setDateTimePickerVisible(false);
  }

  function showLawyerTimeBookedAlert(availableSlots: AvailabilitySlot[]) {
    const recommendations = getRecommendedSlots(availableSlots, bookTime);
    setTimeBookedPrompt({
      visible: true,
      selectedTimeLabel: formatSlotTimeLabel(bookTime),
      recommendations,
    });
  }

  function closeTimeBookedPrompt() {
    setTimeBookedPrompt((current) => ({ ...current, visible: false }));
  }

  function useRecommendedBookedTime(slot: AvailabilitySlot) {
    setBookTime(normalizeTimeValue(slot.time));
    closeTimeBookedPrompt();
  }

  async function startConversation() {
    setMessaging(true);
    try {
      await clientApi.startConversation(Number(id));
      router.push('/(client)/messages');
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'Failed to start conversation.');
    } finally {
      setMessaging(false);
    }
  }

  async function askViaMessageFromBooking() {
    setMessaging(true);
    try {
      await clientApi.startConversation(Number(id));
      const { data } = await clientApi.conversations();
      const list = Array.isArray(data) ? data : [];
      const target = list.find((entry: any) => Number(entry?.other_user?.id) === Number(id));
      const draftMessage = notes.trim();

      const openChat = (sendNow: boolean) => {
        setBookingModal(false);
        router.push({
          pathname: '/(client)/messages',
          params: {
            ...(target?.id ? { conversationId: String(target.id) } : {}),
            ...(draftMessage ? { draftMessage } : {}),
            ...(sendNow && draftMessage
              ? {
                  draftSendNow: '1',
                  draftSendToken: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                }
              : {}),
          },
        } as any);
      };

      if (!draftMessage) {
        openChat(false);
        return;
      }

      Alert.alert(
        'Send question now?',
        'Do you want to send your notes to the lawyer immediately, or open chat with the notes as draft?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open as Draft', onPress: () => openChat(false) },
          { text: 'Send Now', onPress: () => openChat(true) },
        ]
      );
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'Failed to open chat.');
    } finally {
      setMessaging(false);
    }
  }

  async function pickCaseDocument() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: false,
        copyToCacheDirectory: true,
        type: CASE_DOCUMENT_MIME_TYPES,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      const asset = result.assets[0];
      const nextDocument: CaseDocumentAsset = {
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType,
        size: asset.size,
      };

      if (!isAllowedCaseDocument(nextDocument)) {
        Alert.alert('Unsupported File', 'Please attach a JPG, PNG, PDF, DOC, or DOCX file.');
        return;
      }

      if ((nextDocument.size ?? 0) > MAX_CASE_DOCUMENT_BYTES) {
        Alert.alert('File Too Large', 'Supporting documents must be 10 MB or smaller.');
        return;
      }

      setCaseDocument(nextDocument);
    } catch (error: any) {
      Alert.alert('Attachment Failed', error?.message || 'Could not attach the document. Please try again.');
    }
  }

  async function handleBook() {

    const dateStr = bookDate.trim();
    const timeStr = bookTime.trim();

    if (!dateStr || !timeStr) {
      Alert.alert('Missing Schedule', 'Please pick an available date and time.');
      return;
    }

    const scheduled = new Date(`${dateStr}T${timeStr}:00`);
    if (Number.isNaN(scheduled.getTime()) || scheduled < getMinimumBookableTime()) {
      Alert.alert('Invalid Date', `Please choose a valid date and time at least ${MIN_BOOKING_LEAD_MINUTES} minutes from now.`);
      return;
    }

    if (blockedDates.has(dateStr) || unavailableDates.has(dateStr)) {
      Alert.alert('Schedule Unavailable', 'This lawyer is unavailable during the selected date. Please choose a different schedule.');
      return;
    }

    setBooking(true);
    const debugTrace: string[] = [];
    let missingResumeRoute = false;
    let submittedConsultationCode = '';

    try {
      let latestAvailableSlots = filteredSlots;
      try {
        const { data: latestAvailabilityData } = await clientApi.lawyerAvailability(Number(id), {
          month: formatMonthValue(scheduled),
          duration_minutes: duration,
          date: dateStr,
        });
        const latestSlots: AvailabilitySlot[] = Array.isArray(latestAvailabilityData?.slots) ? latestAvailabilityData.slots : [];
        latestAvailableSlots = latestSlots.filter((slot) => {
          const slotTime = normalizeTimeValue(slot.time);
          if (!slotTime) return false;
          if (dateStr !== todayKey) return true;
          return new Date(`${dateStr}T${slotTime}:00`).getTime() >= getMinimumBookableTime().getTime();
        });
      } catch {
        latestAvailableSlots = filteredSlots;
      }

      if (!hasSlotTime(latestAvailableSlots, timeStr)) {
        showLawyerTimeBookedAlert(latestAvailableSlots);
        return;
      }

      const existingConsultationsResponse = await clientApi.consultations();
      const existingConsultations = extractConsultationList(existingConsultationsResponse?.data);
      if (hasClientBookingConflict(existingConsultations, scheduled, duration)) {
        const shouldContinue = await confirmClientBookingConflict();
        if (!shouldContinue) return;
      }

      const bookingPayload = {
        lawyer_id: Number(id),
        scheduled_at: formatLocalDateTime(scheduled),
        duration_minutes: duration,
        type,
        notes: notes.trim() || null,
        paymentMethodTypes: BOOKING_PAYMENT_METHODS,
        successUrl: bookingCallbackUrl,
        cancelUrl: bookingCallbackUrl,
      };

      const requestPayload = (() => {
        if (!caseDocument) {
          return bookingPayload;
        }

        // --- Logging and validation for caseDocument ---
        console.log('Uploading caseDocument:', caseDocument);
        if (!caseDocument.uri || !caseDocument.name) {
          Alert.alert('Attachment Error', 'The selected document is missing required fields.');
          throw new Error('Invalid caseDocument object');
        }
        if ((caseDocument.size ?? 0) > MAX_CASE_DOCUMENT_BYTES) {
          Alert.alert('File Too Large', 'Supporting documents must be 10 MB or smaller.');
          throw new Error('File too large');
        }
        // --- End logging and validation ---

        const form = new FormData();
        form.append('lawyer_id', String(bookingPayload.lawyer_id));
        form.append('scheduled_at', bookingPayload.scheduled_at);
        form.append('duration_minutes', String(bookingPayload.duration_minutes));
        form.append('type', bookingPayload.type);
        if (bookingPayload.notes) {
          form.append('notes', bookingPayload.notes);
        }
        BOOKING_PAYMENT_METHODS.forEach((method) => form.append('paymentMethodTypes[]', method));
        form.append('successUrl', bookingPayload.successUrl);
        form.append('cancelUrl', bookingPayload.cancelUrl);
        form.append('case_document', {
          uri: caseDocument.uri,
          name: caseDocument.name,
          type: caseDocument.mimeType || 'application/octet-stream',
        } as any);
        return form;
      })();

      const { data } = await clientApi.bookConsultation(requestPayload);

      const payload = data?.data ?? data;
      submittedConsultationCode = String(payload?.consultation?.code ?? data?.consultation?.code ?? '').trim();
      let paymentId = Number(payload?.payment?.id || data?.payment?.id || payload?.payment_id || data?.payment_id || 0);
      let effectiveCheckoutUrl = extractCheckoutUrl(payload) || extractCheckoutUrl(data);

      debugTrace.push(`book checkout=${Boolean(effectiveCheckoutUrl)} paymentId=${paymentId} code=${submittedConsultationCode}`);

      if (!effectiveCheckoutUrl && paymentId > 0) {
        try {
          const resumed = await clientApi.resumePayment(paymentId, {
            paymentMethodTypes: BOOKING_PAYMENT_METHODS,
            successUrl: bookingCallbackUrl,
            cancelUrl: bookingCallbackUrl,
          });
          effectiveCheckoutUrl = extractCheckoutUrl(resumed);
          debugTrace.push(`resume-by-id checkout=${Boolean(effectiveCheckoutUrl)} paymentId=${paymentId}`);
        } catch (resumeErr: any) {
          missingResumeRoute = missingResumeRoute || isMissingPaymentResumeRoute(resumeErr);
          debugTrace.push(`resume-by-id failed status=${resumeErr?.response?.status ?? 'n/a'}`);
        }
      }

      if ((!effectiveCheckoutUrl || paymentId <= 0) && submittedConsultationCode) {
        try {
          const latest = await clientApi.consultations('all');
          const items = Array.isArray(latest?.data?.data) ? latest.data.data : [];
          const created = items.find((item: any) => item?.code === submittedConsultationCode);
          paymentId = Number(created?.payment_id || 0);

          if (paymentId <= 0) {
            const paymentsResponse = await clientApi.payments();
            const payload = paymentsResponse?.data;
            const paymentItems = Array.isArray(payload?.data)
              ? payload.data
              : (Array.isArray(payload?.payments?.data) ? payload.payments.data : []);

            const downpayment = paymentItems.find((payment: any) =>
              payment?.consultation?.code === submittedConsultationCode
              && String(payment?.type || '').toLowerCase() === 'downpayment'
            );

            paymentId = Number(downpayment?.id || 0);
            effectiveCheckoutUrl = effectiveCheckoutUrl || extractCheckoutUrl(downpayment);
            debugTrace.push(`lookup-payments-by-code paymentId=${paymentId}`);
          }

          if (!effectiveCheckoutUrl && paymentId > 0) {
            try {
              const statusResponse = await clientApi.paymentStatus(paymentId);
              effectiveCheckoutUrl = extractCheckoutUrl(statusResponse);
              debugTrace.push(`status-by-code checkout=${Boolean(effectiveCheckoutUrl)} paymentId=${paymentId}`);
            } catch (statusErr: any) {
              debugTrace.push(`status-by-code failed status=${statusErr?.response?.status ?? 'n/a'}`);
            }
          }

          if (!effectiveCheckoutUrl && paymentId > 0) {
            const resumed = await clientApi.resumePayment(paymentId, {
              paymentMethodTypes: BOOKING_PAYMENT_METHODS,
              successUrl: bookingCallbackUrl,
              cancelUrl: bookingCallbackUrl,
            });
            effectiveCheckoutUrl = extractCheckoutUrl(resumed);
            debugTrace.push(`resume-by-code checkout=${Boolean(effectiveCheckoutUrl)} paymentId=${paymentId}`);
          }
        } catch (fallbackErr: any) {
          missingResumeRoute = missingResumeRoute || isMissingPaymentResumeRoute(fallbackErr);
          debugTrace.push(`resume-by-code failed status=${fallbackErr?.response?.status ?? 'n/a'}`);
        }
      }

      if (!effectiveCheckoutUrl || paymentId <= 0) {
        try {
          const paymentsResponse = await clientApi.payments();
          const paymentsPayload = paymentsResponse?.data;
          const paymentItems = Array.isArray(paymentsPayload?.data)
            ? paymentsPayload.data
            : (Array.isArray(paymentsPayload?.payments?.data) ? paymentsPayload.payments.data : []);

          const latestRetryableDownpayment = paymentItems.find((payment: any) =>
            String(payment?.type || '').toLowerCase() === 'downpayment'
            && !['paid', 'downpayment_paid', 'refunded'].includes(String(payment?.status || '').toLowerCase())
          );

          const fallbackPaymentId = Number(latestRetryableDownpayment?.id || 0);
          effectiveCheckoutUrl = effectiveCheckoutUrl || extractCheckoutUrl(latestRetryableDownpayment);
          debugTrace.push(`latest-retryable-downpayment id=${fallbackPaymentId}`);

          if (!effectiveCheckoutUrl && fallbackPaymentId > 0) {
            try {
              const statusResponse = await clientApi.paymentStatus(fallbackPaymentId);
              effectiveCheckoutUrl = extractCheckoutUrl(statusResponse);
              debugTrace.push(`status-by-latest checkout=${Boolean(effectiveCheckoutUrl)} paymentId=${fallbackPaymentId}`);
            } catch (statusErr: any) {
              debugTrace.push(`status-by-latest failed status=${statusErr?.response?.status ?? 'n/a'}`);
            }
          }

          if (!effectiveCheckoutUrl && fallbackPaymentId > 0) {
            paymentId = fallbackPaymentId;
            const resumed = await clientApi.resumePayment(paymentId, {
              paymentMethodTypes: BOOKING_PAYMENT_METHODS,
              successUrl: bookingCallbackUrl,
              cancelUrl: bookingCallbackUrl,
            });
            effectiveCheckoutUrl = extractCheckoutUrl(resumed);
            debugTrace.push(`resume-by-latest checkout=${Boolean(effectiveCheckoutUrl)} paymentId=${paymentId}`);
          }
        } catch (latestErr: any) {
          missingResumeRoute = missingResumeRoute || isMissingPaymentResumeRoute(latestErr);
          debugTrace.push(`resume-by-latest failed status=${latestErr?.response?.status ?? 'n/a'}`);
        }
      }

      if (!effectiveCheckoutUrl) {
        try {
          const paymentsResponse = await clientApi.payments();
          const paymentsPayload = paymentsResponse?.data;
          const paymentItems = Array.isArray(paymentsPayload?.data)
            ? paymentsPayload.data
            : (Array.isArray(paymentsPayload?.payments?.data) ? paymentsPayload.payments.data : []);

          const byCodeWithCheckout = submittedConsultationCode
            ? paymentItems.find((payment: any) =>
                payment?.consultation?.code === submittedConsultationCode
                && String(payment?.type || '').toLowerCase() === 'downpayment'
                && Boolean(payment?.checkout_url || payment?.paymongo_checkout_url || payment?.payment?.checkout_url)
              )
            : null;

          const latestWithCheckout = paymentItems.find((payment: any) =>
            String(payment?.type || '').toLowerCase() === 'downpayment'
            && !['paid', 'downpayment_paid', 'refunded'].includes(String(payment?.status || '').toLowerCase())
            && Boolean(payment?.checkout_url || payment?.paymongo_checkout_url || payment?.payment?.checkout_url)
          );

          const checkoutCandidate = byCodeWithCheckout || latestWithCheckout;
          if (checkoutCandidate) {
            paymentId = Number(checkoutCandidate?.id || paymentId || 0);
            effectiveCheckoutUrl = extractCheckoutUrl(checkoutCandidate);
            debugTrace.push(`stored-checkout-from-payments checkout=${Boolean(effectiveCheckoutUrl)} paymentId=${paymentId}`);
          }
        } catch (storedErr: any) {
          debugTrace.push(`stored-checkout lookup failed status=${storedErr?.response?.status ?? 'n/a'}`);
        }
      }

      if (!effectiveCheckoutUrl) {
        const debugText = debugTrace.join(' | ').slice(0, 1000);
        if (missingResumeRoute) {
          Alert.alert(
            'Payment Not Started',
            `Booking was created, but backend ${API_HOST_LABEL} cannot provide a mobile checkout session yet.\n\nPlease ask backend to enable /api/client/payments/{id}/resume and /api/client/payments/{id}/status.\n\nDebug: ${debugText}`
          );
        } else {
          Alert.alert(
            'Payment Not Started',
            `Booking was created, but checkout URL is unavailable.\n\nDebug: ${debugText}`
          );
        }
        return;
      }

      const result = await openAuthSessionAsync(effectiveCheckoutUrl, bookingCallbackUrl);
      const checkLatestPaymentState = async () => {
        let paymentState: string | null = null;
        if (paymentId > 0) {
          try {
            const payment = await waitForPaymentResult(paymentId);
            paymentState = String(payment?.status || '').toLowerCase() || null;
          } catch {
            paymentState = null;
          }
        }
        return paymentState;
      };

      const paymentState = await checkLatestPaymentState();

      if (paymentState === 'paid' || paymentState === 'downpayment_paid') {
        setBookingModal(false);
        setBookDate('');
        setBookTime('');
        setNotes('');
        setCaseDocument(null);
        Alert.alert('Payment Confirmed', 'Downpayment confirmed. Your consultation request is now waiting for lawyer confirmation.');
        return;
      }

      if (paymentState === 'failed' || paymentState === 'cancelled') {
        Alert.alert('Payment Not Completed', 'Your booking request was created, but payment did not complete. You can resume payment in Consultations.');
        return;
      }

      if (result.type === 'success') {
        Alert.alert('Payment Not Confirmed', 'You returned from checkout, but payment was not confirmed yet. Your booking request was created and you can try paying again from Payments or Consultations.');
        return;
      }

      Alert.alert('Checkout Closed', 'We checked the latest payment status and it is not marked as paid yet. Your booking request was created, and you can continue payment later from Payments or Consultations.');
    } catch (err: any) {
      const errors = err?.response?.data?.errors;
      Alert.alert('Booking Failed', errors ? Object.values(errors).flat().join('\n') : err?.response?.data?.message || err?.message || 'Booking failed.');
    } finally {
      setBooking(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!lawyer) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors.textLight} />
        <Text style={{ color: Colors.textMuted, marginTop: 12 }}>Lawyer not found.</Text>
      </View>
    );
  }

  const hourlyRate = Number(lawyer.hourly_rate) || 0;
  const estCost = ((hourlyRate / 60) * duration).toFixed(2);
  const isClient = user?.role === 'client';
  const availStatus = String(lawyer.availability_status || 'offline').toLowerCase();
  const availColor = availStatus === 'available' ? Colors.success : availStatus === 'busy' ? Colors.warning : Colors.textMuted;
  const currentMonth = getMonthStart(new Date());
  const blockedDates = new Set(availability?.blocked_dates ?? []);
  const unavailableDates = new Set(availability?.unavailable_dates ?? []);
  const calendarDays = getCalendarDays(calendarMonth);
  const monthLabel = calendarMonth.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
  const canGoPrevMonth = formatMonthValue(calendarMonth) > formatMonthValue(currentMonth);
  const selectedDateTimeLabel = formatBookingDateTime(bookDate, bookTime);
  const selectedSlotLabel = bookTime
    ? new Date(`2000-01-01T${bookTime}:00`).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
    : 'No time selected';
  const selectedTimeParts = getTimeParts(bookTime || '09:00');
  const visibleTimeBookedRecommendations = timeBookedPrompt.recommendations.filter((slot, index, source) => {
    const time = normalizeTimeValue(slot.time);
    if (!time) return false;
    return source.findIndex((candidate) => normalizeTimeValue(candidate.time) === time) === index;
  });
  const isPickedTimeUnavailable = (next: Partial<{ hour12: number; minute: number; meridiem: 'AM' | 'PM' }>) => {
    if (!bookDate) return true;
    const current = getTimeParts(bookTime || '09:00');
    const nextTime = buildTimeValue(
      next.hour12 ?? current.hour12,
      next.minute ?? current.minute,
      next.meridiem ?? current.meridiem,
    );
    const pickedDateTime = new Date(`${bookDate}T${nextTime}:00`);
    return bookDate === todayKey && pickedDateTime < getMinimumBookableTime();
  };
  const isScheduleUnavailable = !bookDate || !bookTime || blockedDates.has(bookDate) || unavailableDates.has(bookDate);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      {!launchedFromBookNow ? (
        <>
          <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
            <View style={styles.header}>
              <TouchableOpacity style={styles.backBtn} onPress={() => router.replace(resolvedReturnTarget as any)}>
                <Ionicons name="arrow-back" size={22} color="#fff" />
              </TouchableOpacity>

              {lawyer.avatar_url ? (
                <Image source={{ uri: lawyer.avatar_url }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarInitial}>{lawyer.name?.[0] ?? 'L'}</Text>
                </View>
              )}

              <Text style={styles.name}>{lawyer.name}</Text>
              <Text style={styles.sub}>{lawyer.specialty || 'Lawyer'}</Text>

              <View style={styles.badgesRow}>
                {lawyer.is_certified ? (
                  <View style={styles.certBadge}>
                    <Ionicons name="shield-checkmark" size={12} color={Colors.success} />
                    <Text style={styles.certBadgeText}>IBP Certified</Text>
                  </View>
                ) : null}
                <View style={[styles.availBadge, { backgroundColor: availColor + '30' }]}>
                  <View style={[styles.availDot, { backgroundColor: availColor }]} />
                  <Text style={[styles.availText, { color: availColor }]}>{availStatus}</Text>
                </View>
                {lawyer.firm ? (
                  <View style={styles.firmBadge}>
                    <Ionicons name="business-outline" size={12} color="rgba(255,255,255,0.85)" />
                    <Text style={styles.firmBadgeText}>{lawyer.firm}</Text>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statVal}>{hourlyRate > 0 ? `₱${hourlyRate.toLocaleString()}` : '—'}</Text>
                <Text style={styles.statLabel}>Per Hour</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBox}>
                <Text style={styles.statVal}>{lawyer.experience_years ?? 0} yrs</Text>
                <Text style={styles.statLabel}>Experience</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBox}>
                <Text style={styles.statVal}>{lawyer.rating != null ? Number(lawyer.rating).toFixed(1) : 'N/A'}</Text>
                <Text style={styles.statLabel}>Rating</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBox}>
                <Text style={styles.statVal}>{lawyer.reviews_count ?? 0}</Text>
                <Text style={styles.statLabel}>Reviews</Text>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Profile Details</Text>
              {lawyer.location ? <Text style={styles.detailText}>• {lawyer.location}</Text> : null}
              {lawyer.specialty ? <Text style={styles.detailText}>• {lawyer.specialty}</Text> : null}
              {hourlyRate > 0 ? <Text style={styles.detailText}>• ₱{hourlyRate.toLocaleString()} / hour</Text> : null}
            </View>

            {hourlyRate > 0 ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Consultation Rates</Text>
                <Text style={styles.ratesNote}>50% downpayment required at booking. Balance due after session.</Text>
                {[30, 60, 90, 120].map((min, index) => {
                  const cost = (hourlyRate / 60) * min;
                  const down = cost * 0.5;
                  return (
                    <View key={min} style={[styles.rateRow, index > 0 && styles.rateRowBorder]}>
                      <Text style={styles.rateMin}>{min} min</Text>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.rateTotal}>₱{cost.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</Text>
                        <Text style={styles.rateDown}>Downpayment: ₱{down.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}

            {lawyer.bio ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>About</Text>
                <Text style={styles.bioText}>{lawyer.bio}</Text>
              </View>
            ) : null}

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Client Reviews</Text>
              {Array.isArray(lawyer.reviews) && lawyer.reviews.length > 0 ? (
                lawyer.reviews.map((r: any) => (
                  <View key={r.id} style={styles.reviewItem}>
                    <Text style={styles.reviewName}>{r.client_name || 'Client'}</Text>
                    <Text style={styles.reviewComment}>{r.comment || 'No written comment.'}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyText}>No reviews yet</Text>
              )}
            </View>
          </ScrollView>

          {isClient ? (
            <View style={styles.actionBar}>
              <TouchableOpacity style={styles.msgBtn} onPress={startConversation} disabled={messaging}>
                {messaging ? <ActivityIndicator size="small" color={Colors.primary} /> : <Text style={styles.msgBtnText}>Message</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.bookBtn} onPress={() => setBookingModal(true)}>
                <Text style={styles.bookBtnText}>Book Consultation</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </>
      ) : null}

      <Modal
        visible={bookingModal}
        animationType={launchedFromBookNow ? 'none' : 'slide'}
        presentationStyle={launchedFromBookNow ? 'fullScreen' : 'pageSheet'}
        onRequestClose={closeBookingSheet}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={closeBookingSheet}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Book a Consultation</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView contentContainerStyle={styles.modalBody}>
            <View style={styles.modalLawyerCard}>
              <View style={styles.modalLawyerAvatar}>
                <Text style={styles.modalLawyerAvatarText}>{lawyer.name?.[0] ?? 'L'}</Text>
              </View>
              <View>
                <Text style={styles.modalLawyerName}>{lawyer.name}</Text>
                <Text style={styles.modalLawyerSpec}>{lawyer.specialty || 'Lawyer'}</Text>
              </View>
              <View style={{ marginLeft: 'auto' }}>
                <Text style={styles.modalRate}>₱{hourlyRate.toLocaleString()}/hr</Text>
              </View>
            </View>

            <Text style={styles.modalSectionTitle}>Consultation Details</Text>
            <Text style={styles.label}>Date & Time</Text>
            <TouchableOpacity style={styles.dateTimeHintBanner} onPress={openDateTimePicker} accessibilityRole="button">
              <Ionicons name="information-circle-outline" size={18} color={Colors.primary} />
              <Text style={styles.dateTimeHintText}>Tap the calendar icon to set the consultation date and time.</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.dateTimeSummary} onPress={openDateTimePicker} accessibilityRole="button">
              <View style={styles.dateTimeSummaryTextWrap}>
                <Text style={styles.dateTimeSummaryValue}>{selectedDateTimeLabel}</Text>
                <Text style={styles.dateTimeSummaryHint}>Tap the calendar to set date, hour, minute, and AM/PM.</Text>
              </View>
              <Ionicons name="calendar-outline" size={20} color={Colors.primary} />
            </TouchableOpacity>
            <View style={styles.calendarCard}>
              <View style={styles.calendarHeaderRow}>
                <TouchableOpacity
                  style={[styles.calendarNavBtn, !canGoPrevMonth && styles.calendarNavBtnDisabled]}
                  onPress={() => canGoPrevMonth && setCalendarMonth((value) => clampBookingMonth(changeMonth(value, -1)))}
                  disabled={!canGoPrevMonth}
                >
                  <Ionicons name="chevron-back" size={18} color={canGoPrevMonth ? Colors.primary : Colors.textLight} />
                </TouchableOpacity>
                <Text style={styles.calendarMonthLabel}>{monthLabel}</Text>
                <TouchableOpacity style={styles.calendarNavBtn} onPress={() => setCalendarMonth((value) => clampBookingMonth(changeMonth(value, 1)))}>
                  <Ionicons name="chevron-forward" size={18} color={Colors.primary} />
                </TouchableOpacity>
              </View>

              <View style={styles.calendarWeekRow}>
                {WEEKDAY_LABELS.map((label) => (
                  <Text key={label} style={styles.calendarWeekLabel}>{label}</Text>
                ))}
              </View>

              <View style={styles.calendarGrid}>
                {calendarDays.map((day, index) => {
                  if (!day) {
                    return (
                      <View key={`empty-${index}`} style={styles.calendarDayCell}>
                        <View style={[styles.calendarDayBtn, styles.calendarDayEmpty]} />
                      </View>
                    );
                  }

                  const dateKey = formatDateValue(day);
                  const isSelected = dateKey === bookDate;
                  const isBlocked = blockedDates.has(dateKey);
                  const isUnavailable = unavailableDates.has(dateKey);
                  const isPast = dateKey < todayKey;
                  const isDisabled = isBlocked || isUnavailable || isPast;

                  return (
                    <View key={dateKey} style={styles.calendarDayCell}>
                      <TouchableOpacity
                        style={[
                          styles.calendarDayBtn,
                          isSelected && styles.calendarDaySelected,
                          isBlocked && styles.calendarDayBlocked,
                          !isBlocked && isUnavailable && styles.calendarDayUnavailable,
                        ]}
                          disabled={isDisabled}
                          onPress={() => {
                            if (bookDate !== dateKey) {
                              setBookDate(dateKey);
                              setBookTime(getDefaultBookTimeForDate(dateKey, bookTime));
                            }
                          }}
                      >
                        <Text
                          style={[
                            styles.calendarDayText,
                            isSelected && styles.calendarDayTextSelected,
                            isDisabled && styles.calendarDayTextDisabled,
                          ]}
                        >
                          {day.getDate()}
                        </Text>
                        {isBlocked ? (
                          <View style={styles.calendarBlockedBanner}>
                            <Text style={styles.calendarBlockedBannerText}>Blocked</Text>
                          </View>
                        ) : null}
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            </View>

            <View style={styles.timePickerCard}>
              <View style={styles.timePickerHeader}>
                <View>
                  <Text style={styles.timePickerTitle}>Time</Text>
                  <Text style={styles.timePickerSubtitle}>{selectedSlotLabel}</Text>
                </View>
                <Ionicons name="time-outline" size={20} color={Colors.primary} />
              </View>

              {availabilityLoading ? (
                <View style={styles.slotStateBox}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                  <Text style={styles.slotStateText}>Loading available time slots...</Text>
                </View>
              ) : availabilityError ? (
                <View style={styles.slotStateBox}>
                  <Ionicons name="alert-circle-outline" size={18} color={Colors.error} />
                  <Text style={styles.slotStateText}>{availabilityError}</Text>
                </View>
              ) : filteredSlots.length ? (
                <View style={styles.slotGroupWrap}>
                  {groupedSlots.morning.length ? (
                    <View style={styles.slotSection}>
                      <Text style={styles.slotSectionTitle}>Morning</Text>
                      <View style={styles.slotGrid}>
                        {groupedSlots.morning.map((slot) => (
                          <TouchableOpacity
                            key={normalizeTimeValue(slot.time)}
                            style={[styles.slotBtn, normalizeTimeValue(bookTime) === normalizeTimeValue(slot.time) && styles.slotBtnActive]}
                            onPress={() => setBookTime(normalizeTimeValue(slot.time))}
                          >
                            <Ionicons name="time-outline" size={14} color={normalizeTimeValue(bookTime) === normalizeTimeValue(slot.time) ? '#fff' : Colors.primary} />
                            <Text style={[styles.slotBtnText, normalizeTimeValue(bookTime) === normalizeTimeValue(slot.time) && styles.slotBtnTextActive]}>{slot.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  ) : null}

                  {groupedSlots.afternoon.length ? (
                    <View style={styles.slotSection}>
                      <Text style={styles.slotSectionTitle}>Afternoon</Text>
                      <View style={styles.slotGrid}>
                        {groupedSlots.afternoon.map((slot) => (
                          <TouchableOpacity
                            key={normalizeTimeValue(slot.time)}
                            style={[styles.slotBtn, normalizeTimeValue(bookTime) === normalizeTimeValue(slot.time) && styles.slotBtnActive]}
                            onPress={() => setBookTime(normalizeTimeValue(slot.time))}
                          >
                            <Ionicons name="time-outline" size={14} color={normalizeTimeValue(bookTime) === normalizeTimeValue(slot.time) ? '#fff' : Colors.primary} />
                            <Text style={[styles.slotBtnText, normalizeTimeValue(bookTime) === normalizeTimeValue(slot.time) && styles.slotBtnTextActive]}>{slot.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  ) : null}
                </View>
              ) : (
                <View style={styles.slotStateBox}>
                  <Ionicons name="calendar-clear-outline" size={18} color={Colors.textLight} />
                  <Text style={styles.slotStateText}>
                    {isTodaySelected
                      ? 'No more slots available for the rest of today. Please pick another date.'
                      : 'No slots available for this date and duration.'}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.detailGrid}>
              <View style={styles.detailColumn}>
                <Text style={styles.label}>Duration</Text>
                <View style={styles.optionRow}>
                  {DURATIONS.map((d) => (
                    <TouchableOpacity key={d} style={[styles.optionBtn, duration === d && styles.optionBtnActive]} onPress={() => setDuration(d)}>
                      <Text style={[styles.optionText, duration === d && styles.optionTextActive]}>{d} min</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.detailColumn}>
                <Text style={styles.label}>Type</Text>
                <View style={styles.optionRow}>
                  {TYPES.map((t) => (
                    <TouchableOpacity key={t} style={[styles.optionBtn, type === t && styles.optionBtnActive]} onPress={() => setType(t)}>
                      <Ionicons
                        name={t === 'video' ? 'videocam-outline' : t === 'phone' ? 'call-outline' : 'business-outline'}
                        size={14}
                        color={type === t ? '#fff' : Colors.textMuted}
                      />
                      <Text style={[styles.optionText, type === t && styles.optionTextActive]}>
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            <Text style={styles.label}>Notes (Optional)</Text>
            <TextInput
              style={[styles.input, { minHeight: 100, textAlignVertical: 'top' }]}
              multiline
              value={notes}
              onChangeText={setNotes}
              placeholder="Briefly describe your legal concern"
              placeholderTextColor={Colors.textLight}
            />
            <TouchableOpacity
              style={[styles.askMessageBtn, messaging && styles.askMessageBtnDisabled]}
              onPress={askViaMessageFromBooking}
              disabled={messaging}
            >
              {messaging ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <>
                  <Ionicons name="chatbubble-ellipses-outline" size={14} color={Colors.primary} />
                  <Text style={styles.askMessageBtnText}>
                    Ask via Message{notes.trim() ? ' (use notes as draft)' : ''}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={styles.label}>Supporting Documents (Optional)</Text>
            <TouchableOpacity style={styles.uploadCard} onPress={pickCaseDocument}>
              <Ionicons name="attach-outline" size={18} color="#B9770E" />
              <Text style={styles.uploadCardText} numberOfLines={2}>
                {caseDocument
                  ? caseDocument.name
                  : 'Click to attach JPG, PNG, PDF, DOC, or DOCX files'}
              </Text>
            </TouchableOpacity>
            {caseDocument ? (
              <View style={styles.uploadMetaRow}>
                <Text style={styles.uploadHintText}>
                  {(caseDocument.size ?? 0) > 0
                    ? `${(caseDocument.size! / (1024 * 1024)).toFixed(2)} MB`
                    : 'Ready to upload'}
                </Text>
                <TouchableOpacity onPress={() => setCaseDocument(null)}>
                  <Text style={styles.uploadRemoveText}>Remove</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={styles.uploadHintText}>Accepted: JPG, PNG, PDF, DOC, DOCX. Max 10 MB.</Text>
            )}

            <View style={styles.costBox}>
              <Text style={styles.costLabel}>Estimated Cost</Text>
              <Text style={styles.costValue}>₱{Number(estCost).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</Text>
              <Text style={styles.costNote}>
                50% downpayment (₱{(Number(estCost) / 2).toLocaleString('en-PH', { minimumFractionDigits: 2 })}) charged upon booking
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.confirmBtn, (booking || isScheduleUnavailable) && styles.confirmBtnDisabled]}
              onPress={handleBook}
              disabled={booking || isScheduleUnavailable}
            >
              {booking ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmBtnText}>Confirm Booking</Text>}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={timeBookedPrompt.visible}
        transparent
        animationType="fade"
        onRequestClose={closeTimeBookedPrompt}
      >
        <View style={styles.timeBookedOverlay}>
          <View style={styles.timeBookedCard}>
            <View style={styles.timeBookedIconWrap}>
              <Ionicons name="alert-circle" size={30} color="#B45309" />
            </View>
            <Text style={styles.timeBookedTitle}>Time Already Booked</Text>
            <Text style={styles.timeBookedCopy}>
              This lawyer is already booked at <Text style={styles.timeBookedStrong}>{timeBookedPrompt.selectedTimeLabel}</Text>. Please choose another available time.
            </Text>

            <View style={styles.timeBookedDivider} />

            <View style={styles.timeBookedRecommendationHeader}>
              <Ionicons name="time-outline" size={16} color={Colors.primary} />
              <Text style={styles.timeBookedRecommendationTitle}>
                {visibleTimeBookedRecommendations.length ? 'Recommended times' : 'No times available'}
              </Text>
            </View>

            {visibleTimeBookedRecommendations.length ? (
              <View style={styles.timeBookedChipGrid}>
                {visibleTimeBookedRecommendations.map((slot, index) => (
                  <TouchableOpacity
                    key={`booked-reco-${normalizeTimeValue(slot.time)}-${index}`}
                    style={styles.timeBookedChip}
                    onPress={() => useRecommendedBookedTime(slot)}
                  >
                    <Ionicons name="checkmark-circle-outline" size={15} color="#FFFFFF" />
                    <Text style={styles.timeBookedChipText}>{slot.label || formatSlotTimeLabel(slot.time)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <Text style={styles.timeBookedEmptyText}>This date may be full. Pick another date to see more available slots.</Text>
            )}

            <TouchableOpacity style={styles.timeBookedSecondaryBtn} onPress={closeTimeBookedPrompt}>
              <Text style={styles.timeBookedSecondaryText}>Choose Another Time</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={dateTimePickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDateTimePickerVisible(false)}
      >
        <View style={[styles.datePickerOverlay, { paddingTop: Math.max(18, insets.top + 8), paddingBottom: Math.max(22, insets.bottom + 18) }]}>
          <View style={styles.datePickerCard}>
            <View style={styles.datePickerHeader}>
              <Text style={styles.datePickerTitle}>Date & Time</Text>
              <TouchableOpacity onPress={() => setDateTimePickerVisible(false)}>
                <Ionicons name="close" size={22} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.datePickerBody}>
              <View style={styles.datePickerCalendar}>
                <View style={styles.calendarHeaderRow}>
                  <TouchableOpacity
                    style={[styles.calendarNavBtn, !canGoPrevMonth && styles.calendarNavBtnDisabled]}
                    onPress={() => canGoPrevMonth && setCalendarMonth((value) => clampBookingMonth(changeMonth(value, -1)))}
                    disabled={!canGoPrevMonth}
                  >
                    <Ionicons name="chevron-back" size={18} color={canGoPrevMonth ? Colors.primary : Colors.textLight} />
                  </TouchableOpacity>
                  <Text style={styles.calendarMonthLabel}>{monthLabel}</Text>
                  <TouchableOpacity style={styles.calendarNavBtn} onPress={() => setCalendarMonth((value) => clampBookingMonth(changeMonth(value, 1)))}>
                    <Ionicons name="chevron-forward" size={18} color={Colors.primary} />
                  </TouchableOpacity>
                </View>

                <View style={styles.calendarWeekRow}>
                  {WEEKDAY_LABELS.map((label) => (
                    <Text key={`picker-week-${label}`} style={styles.calendarWeekLabel}>{label}</Text>
                  ))}
                </View>

                <View style={styles.calendarGrid}>
                  {calendarDays.map((day, index) => {
                    if (!day) {
                      return (
                        <View key={`picker-empty-${index}`} style={styles.calendarDayCell}>
                          <View style={[styles.calendarDayBtn, styles.calendarDayEmpty]} />
                        </View>
                      );
                    }

                    const dateKey = formatDateValue(day);
                    const isSelected = dateKey === bookDate;
                    const isBlocked = blockedDates.has(dateKey);
                    const isUnavailable = unavailableDates.has(dateKey);
                    const isPast = dateKey < todayKey;
                    const isDisabled = isBlocked || isUnavailable || isPast;

                    return (
                      <View key={`picker-${dateKey}`} style={styles.calendarDayCell}>
                        <TouchableOpacity
                          style={[
                            styles.calendarDayBtn,
                            isSelected && styles.calendarDaySelected,
                            isBlocked && styles.calendarDayBlocked,
                            !isBlocked && isUnavailable && styles.calendarDayUnavailable,
                          ]}
                          disabled={isDisabled}
                          onPress={() => {
                            setBookDate(dateKey);
                            setBookTime(getDefaultBookTimeForDate(dateKey, bookTime));
                          }}
                        >
                          <Text
                            style={[
                              styles.calendarDayText,
                              isSelected && styles.calendarDayTextSelected,
                              isDisabled && styles.calendarDayTextDisabled,
                            ]}
                          >
                            {day.getDate()}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>

                <View style={styles.datePickerQuickRow}>
                  <TouchableOpacity
                    onPress={() => {
                      setBookDate('');
                      setBookTime('');
                    }}
                  >
                    <Text style={styles.datePickerQuickText}>Clear</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      const today = new Date();
                      const todayValue = formatDateValue(today);
                      setCalendarMonth(getMonthStart(today));
                      setBookDate(todayValue);
                      setBookTime(getDefaultBookTimeForDate(todayValue, bookTime));
                    }}
                  >
                    <Text style={styles.datePickerQuickText}>Today</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.datePickerTime}>
                <ScrollView style={styles.timeColumn} showsVerticalScrollIndicator={false}>
                  {TIME_PICKER_HOURS.map((hour) => (
                    (() => {
                      const disabled = isPickedTimeUnavailable({ hour12: hour });
                      return (
                        <TouchableOpacity
                          key={`hour-${hour}`}
                          style={[
                            styles.timeOption,
                            selectedTimeParts.hour12 === hour && styles.timeOptionActive,
                            disabled && styles.timeOptionDisabled,
                          ]}
                          disabled={disabled}
                          onPress={() => setPickedTime({ hour12: hour })}
                        >
                          <Text style={[
                            styles.timeOptionText,
                            selectedTimeParts.hour12 === hour && styles.timeOptionTextActive,
                            disabled && styles.timeOptionTextDisabled,
                          ]}>{pad(hour)}</Text>
                        </TouchableOpacity>
                      );
                    })()
                  ))}
                </ScrollView>

                <ScrollView style={styles.timeColumn} showsVerticalScrollIndicator={false}>
                  {TIME_PICKER_MINUTES.map((minute) => (
                    (() => {
                      const disabled = isPickedTimeUnavailable({ minute });
                      return (
                        <TouchableOpacity
                          key={`minute-${minute}`}
                          style={[
                            styles.timeOption,
                            selectedTimeParts.minute === minute && styles.timeOptionActive,
                            disabled && styles.timeOptionDisabled,
                          ]}
                          disabled={disabled}
                          onPress={() => setPickedTime({ minute })}
                        >
                          <Text style={[
                            styles.timeOptionText,
                            selectedTimeParts.minute === minute && styles.timeOptionTextActive,
                            disabled && styles.timeOptionTextDisabled,
                          ]}>{pad(minute)}</Text>
                        </TouchableOpacity>
                      );
                    })()
                  ))}
                </ScrollView>

                <View style={styles.meridiemColumn}>
                  {TIME_PICKER_MERIDIEMS.map((meridiem) => (
                    (() => {
                      const disabled = isPickedTimeUnavailable({ meridiem });
                      return (
                        <TouchableOpacity
                          key={meridiem}
                          style={[
                            styles.timeOption,
                            selectedTimeParts.meridiem === meridiem && styles.timeOptionActive,
                            disabled && styles.timeOptionDisabled,
                          ]}
                          disabled={disabled}
                          onPress={() => setPickedTime({ meridiem })}
                        >
                          <Text style={[
                            styles.timeOptionText,
                            selectedTimeParts.meridiem === meridiem && styles.timeOptionTextActive,
                            disabled && styles.timeOptionTextDisabled,
                          ]}>{meridiem}</Text>
                        </TouchableOpacity>
                      );
                    })()
                  ))}
                </View>
              </View>
            </View>

            <TouchableOpacity style={[styles.datePickerDoneBtn, { marginBottom: Math.max(6, insets.bottom * 0.35) }]} onPress={closeDateTimePickerIfValid}>
              <Text style={styles.datePickerDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  scroll: { flex: 1 },
  header: {
    backgroundColor: Colors.primary,
    alignItems: 'center',
    paddingTop: 56,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  backBtn: { position: 'absolute', left: 16, top: 56, padding: 4 },
  avatar: { width: 88, height: 88, borderRadius: 44, marginBottom: 10, borderWidth: 2, borderColor: Colors.secondary },
  avatarFallback: { backgroundColor: Colors.secondary, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: Colors.primary, fontWeight: '800', fontSize: 30 },
  name: { fontSize: 24, fontWeight: '800', color: '#fff' },
  sub: { color: 'rgba(255,255,255,0.8)', fontSize: 14, marginTop: 4 },
  badgesRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 10 },
  certBadge: { flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: Colors.success + '35', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  certBadgeText: { color: Colors.success, fontSize: 11, fontWeight: '700' },
  availBadge: { flexDirection: 'row', gap: 6, alignItems: 'center', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  availDot: { width: 8, height: 8, borderRadius: 4 },
  availText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  firmBadge: { flexDirection: 'row', gap: 6, alignItems: 'center', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: 'rgba(255,255,255,0.18)' },
  firmBadgeText: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '600' },
  statsRow: { flexDirection: 'row', backgroundColor: Colors.card, marginBottom: 10, borderBottomWidth: 1, borderBottomColor: Colors.border, paddingVertical: 14 },
  statBox: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, backgroundColor: Colors.border },
  statVal: { fontSize: 13, fontWeight: '800', color: Colors.text },
  statLabel: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  card: { marginHorizontal: 16, marginTop: 10, backgroundColor: Colors.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.border },
  cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.text, marginBottom: 10 },
  detailText: { color: Colors.text, fontSize: 13, marginBottom: 6 },
  ratesNote: { fontSize: 12, color: Colors.textMuted, marginBottom: 8 },
  rateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  rateRowBorder: { borderTopWidth: 1, borderTopColor: Colors.border },
  rateMin: { fontSize: 14, fontWeight: '700', color: Colors.text },
  rateTotal: { fontSize: 14, fontWeight: '800', color: Colors.primary },
  rateDown: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  bioText: { color: Colors.textMuted, lineHeight: 20, fontSize: 13 },
  reviewItem: { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10, marginTop: 10 },
  reviewName: { fontWeight: '700', color: Colors.text, fontSize: 13 },
  reviewComment: { color: Colors.textMuted, fontSize: 12, marginTop: 4 },
  emptyText: { color: Colors.textLight, fontSize: 13 },
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.card,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  msgBtn: { flex: 1, borderRadius: 12, borderWidth: 2, borderColor: Colors.primary, alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  msgBtnText: { color: Colors.primary, fontWeight: '700', fontSize: 14 },
  bookBtn: { flex: 1, borderRadius: 12, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  bookBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },
  modalBody: { padding: 16, gap: 10, paddingBottom: 40 },
  modalSectionTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 4,
  },
  modalLawyerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 6,
  },
  modalLawyerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalLawyerAvatarText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  modalLawyerName: { fontSize: 14, fontWeight: '700', color: Colors.text },
  modalLawyerSpec: { fontSize: 12, color: Colors.textMuted },
  modalRate: { fontSize: 13, fontWeight: '700', color: Colors.success },
  label: { fontWeight: '600', color: Colors.text, marginTop: 6 },
  dateTimeHintBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
    backgroundColor: Colors.primary + '0F',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dateTimeHintText: {
    flex: 1,
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
  },
  dateTimeSummary: {
    minHeight: 64,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: Colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dateTimeSummaryTextWrap: { flex: 1 },
  dateTimeSummaryValue: { color: Colors.text, fontSize: 16, fontWeight: '800' },
  dateTimeSummaryHint: { color: Colors.textMuted, fontSize: 11, marginTop: 3, lineHeight: 15 },
  datePickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.52)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  datePickerCard: {
    width: '100%',
    maxHeight: '84%',
    backgroundColor: Colors.card,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  datePickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  datePickerTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  datePickerBody: {
    gap: 10,
  },
  datePickerCalendar: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    padding: 10,
    backgroundColor: '#FFFFFF',
  },
  datePickerQuickRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingHorizontal: 4,
  },
  datePickerQuickText: {
    color: Colors.info,
    fontSize: 13,
    fontWeight: '700',
  },
  datePickerTime: {
    flexDirection: 'row',
    gap: 8,
    height: 178,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    padding: 8,
  },
  timeColumn: {
    flex: 1,
  },
  meridiemColumn: {
    flex: 1,
    gap: 8,
  },
  timeOption: {
    minHeight: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    backgroundColor: '#F8FAFC',
  },
  timeOptionActive: {
    backgroundColor: '#0B7FEA',
  },
  timeOptionDisabled: {
    opacity: 0.38,
  },
  timeOptionText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  timeOptionTextActive: {
    color: '#FFFFFF',
  },
  timeOptionTextDisabled: {
    color: Colors.textLight,
  },
  datePickerDoneBtn: {
    marginTop: 12,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  datePickerDoneText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  input: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.text,
    backgroundColor: Colors.card,
  },
  askMessageBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
    backgroundColor: Colors.primary + '10',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  askMessageBtnDisabled: { opacity: 0.7 },
  askMessageBtnText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  calendarCard: { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 12 },
  calendarHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  calendarNavBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.card },
  calendarNavBtnDisabled: { opacity: 0.45 },
  calendarMonthLabel: { fontSize: 15, fontWeight: '700', color: Colors.text },
  calendarWeekRow: { flexDirection: 'row', marginBottom: 8 },
  calendarWeekLabel: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: Colors.textMuted },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3 },
  calendarDayCell: { width: '14.2857%', paddingHorizontal: 3, marginBottom: 6 },
  calendarDayBtn: { width: '100%', aspectRatio: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  calendarDayEmpty: { backgroundColor: 'transparent', borderColor: 'transparent' },
  calendarDaySelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  calendarDayBlocked: { backgroundColor: Colors.error + '18', borderColor: Colors.error + '55' },
  calendarDayUnavailable: { backgroundColor: Colors.textLight + '18', borderColor: Colors.textLight + '40' },
  calendarDayText: { fontSize: 13, fontWeight: '700', color: Colors.text },
  calendarDayTextSelected: { color: '#fff' },
  calendarDayTextDisabled: { color: Colors.textLight },
  calendarBlockedBanner: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: Colors.error, paddingVertical: 2, alignItems: 'center' },
  calendarBlockedBannerText: { color: '#fff', fontSize: 7, fontWeight: '900', letterSpacing: 0.2, textTransform: 'uppercase' },
  timePickerCard: {
    backgroundColor: Colors.card,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 14,
    padding: 14,
  },
  timePickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  timePickerTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  timePickerSubtitle: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  detailGrid: { gap: 10 },
  detailColumn: { gap: 8 },
  slotGroupWrap: { gap: 14 },
  slotSection: { gap: 8 },
  slotSectionTitle: { fontSize: 12, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.7 },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slotStateBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 10, backgroundColor: Colors.card, paddingHorizontal: 14, paddingVertical: 12 },
  slotStateText: { flex: 1, fontSize: 13, color: Colors.textMuted, lineHeight: 18 },
  slotBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.primary + '35',
    backgroundColor: Colors.primary + '10',
  },
  slotBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  slotBtnText: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  slotBtnTextActive: { color: '#fff' },
  optionBtn: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.card,
  },
  optionBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  optionText: { color: Colors.textMuted, fontWeight: '600' },
  optionTextActive: { color: '#fff' },
  costBox: { marginTop: 8, padding: 16, backgroundColor: Colors.success + '12', borderRadius: 12, borderWidth: 1, borderColor: Colors.success + '40' },
  costLabel: { fontSize: 12, color: Colors.success, fontWeight: '600', marginBottom: 4 },
  costValue: { fontSize: 28, fontWeight: '800', color: Colors.success },
  costNote: { fontSize: 11, color: Colors.textMuted, marginTop: 4 },
  uploadCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#D59A1A',
    backgroundColor: '#FFF8EA',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  uploadCardText: { flex: 1, color: '#B9770E', fontWeight: '700', fontSize: 13, lineHeight: 19 },
  uploadMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  uploadHintText: { fontSize: 12, color: Colors.textMuted, marginTop: 8 },
  uploadRemoveText: { fontSize: 12, fontWeight: '700', color: Colors.primary, marginTop: 8 },
  timeBookedOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.58)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  timeBookedCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderWidth: 1,
    borderColor: '#FCD9A3',
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 14,
  },
  timeBookedIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FBBF24',
    marginBottom: 12,
  },
  timeBookedTitle: {
    color: '#111827',
    fontSize: 21,
    fontWeight: '900',
    textAlign: 'center',
  },
  timeBookedCopy: {
    color: '#536176',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    textAlign: 'center',
  },
  timeBookedStrong: {
    color: '#111827',
    fontWeight: '900',
  },
  timeBookedDivider: {
    height: 1,
    backgroundColor: '#E7ECF4',
    marginVertical: 16,
  },
  timeBookedRecommendationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginBottom: 10,
  },
  timeBookedRecommendationTitle: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  timeBookedChipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  timeBookedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 10,
    backgroundColor: Colors.primary,
  },
  timeBookedChipText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  timeBookedEmptyText: {
    color: Colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  timeBookedSecondaryBtn: {
    minHeight: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    backgroundColor: '#EEF2F7',
    borderWidth: 1,
    borderColor: '#D8E0EC',
  },
  timeBookedSecondaryText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  confirmBtn: {
    marginTop: 14,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnDisabled: { opacity: 0.55 },
  confirmBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
