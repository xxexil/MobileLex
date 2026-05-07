import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as ExpoLinking from 'expo-linking';
import { openAuthSessionAsync } from 'expo-web-browser';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { clientApi } from '@/services/api';
import { paymongoService } from '@/services/paymongo';
import { LARAVEL_API_BASE } from '@/services/endpoints';
import { Colors } from '@/constants/theme';
import { formatPhp } from '@/constants/currency';
import EmptyState from '@/components/EmptyState';

type PaymentStatus =
  | 'paid'
  | 'pending'
  | 'failed'
  | 'downpayment_paid'
  | 'refunded'
  | 'refund_completed'
  | 'refund_pending'
  | 'refunding'
  | 'cancelled'
  | string;

type PaymentFilter = 'all' | 'paid' | 'pending' | 'refunded' | 'failed';
type NormalizedPaymentStatus = 'paid' | 'pending' | 'refunded' | 'processing' | 'failed' | 'cancelled' | 'other';

interface PaymentItem {
  id: number;
  amount?: number;
  status?: PaymentStatus;
  created_at?: string;
  paid_at?: string;
  type?: string;
  consultation?: {
    code?: string;
    service_type?: string;
    consultation_type?: string;
    duration?: number;
    duration_minutes?: number;
    lawyer?: { name?: string };
  };
  lawyer?: { name?: string };
}

type DisplayPayment = PaymentItem & {
  normalizedStatus: NormalizedPaymentStatus;
  lawyerName: string;
  consultationCode: string;
  paymentTypeLabel: string;
  serviceLabel: string;
  amountValue: number;
  dateLabel: string;
  sortTime: number;
  statusLabel: string;
};

interface Stats {
  totalPaid: number;
  pendingAmount: number;
  refundedAmount: number;
  transactionCount: number;
}

const WEB_APP_BASE_URL = LARAVEL_API_BASE.replace(/\/api\/?$/, '');

const PAYMENT_FILTERS: Array<{ key: PaymentFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'paid', label: 'Paid' },
  { key: 'pending', label: 'Pending' },
  { key: 'refunded', label: 'Refunded' },
  { key: 'failed', label: 'Failed' },
];

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
    source?.data?.attributes?.url,
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
    source?.data?.attributes?.session_id,
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

export default function ClientPayments() {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ backTo?: string }>();
  const backHandledRef = useRef(false);
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<PaymentFilter>('all');
  const [resumingPaymentId, setResumingPaymentId] = useState<number | null>(null);
  const callbackUrl = useMemo(() => getMobileCallbackUrl('/payments'), []);
  const fallbackRoute = useMemo(() => resolvePaymentBackRoute(params.backTo), [params.backTo]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (backHandledRef.current) return;
      const actionType = event.data.action.type;
      if (actionType !== 'GO_BACK' && actionType !== 'POP' && actionType !== 'POP_TO_TOP') {
        return;
      }

      event.preventDefault();
      backHandledRef.current = true;
      router.replace(fallbackRoute as any);
    });

    return unsubscribe;
  }, [fallbackRoute, navigation, router]);

  const normalizedPayments = useMemo<DisplayPayment[]>(() => {
    return payments
      .map((payment) => {
        const normalizedStatus = normalizePaymentStatus(payment.status);
        const amountValue = Number(payment.amount || 0);

        return {
          ...payment,
          normalizedStatus,
          lawyerName: payment.consultation?.lawyer?.name || payment.lawyer?.name || 'Legal Consultation',
          consultationCode: payment.consultation?.code || `LC-${String(payment.id).padStart(6, '0')}`,
          paymentTypeLabel: formatPaymentType(payment.type),
          serviceLabel: formatServiceLabel(payment),
          amountValue,
          dateLabel: formatHistoryDate(payment.paid_at || payment.created_at),
          sortTime: getSortTime(payment.paid_at || payment.created_at),
          statusLabel: getStatusLabel(normalizedStatus, payment.type),
        };
      })
      .sort((left, right) => right.sortTime - left.sortTime);
  }, [payments]);

  const stats = useMemo<Stats>(() => {
    return normalizedPayments.reduce<Stats>((summary, payment) => {
      summary.transactionCount += 1;

      if (payment.normalizedStatus === 'paid') {
        summary.totalPaid += payment.amountValue;
      }

      if (payment.normalizedStatus === 'pending' || payment.normalizedStatus === 'processing') {
        summary.pendingAmount += payment.amountValue;
      }

      if (payment.normalizedStatus === 'refunded') {
        summary.refundedAmount += payment.amountValue;
      }

      return summary;
    }, {
      totalPaid: 0,
      pendingAmount: 0,
      refundedAmount: 0,
      transactionCount: 0,
    });
  }, [normalizedPayments]);

  const filteredPayments = useMemo(() => {
    if (activeFilter === 'all') return normalizedPayments;
    return normalizedPayments.filter((payment) => matchesFilter(payment.normalizedStatus, activeFilter));
  }, [activeFilter, normalizedPayments]);

  const filterCounts = useMemo<Record<PaymentFilter, number>>(() => {
    const counts: Record<PaymentFilter, number> = {
      all: normalizedPayments.length,
      paid: 0,
      pending: 0,
      refunded: 0,
      failed: 0,
    };

    for (const payment of normalizedPayments) {
      if (payment.normalizedStatus === 'paid') counts.paid += 1;
      if (payment.normalizedStatus === 'pending' || payment.normalizedStatus === 'processing') counts.pending += 1;
      if (payment.normalizedStatus === 'refunded') counts.refunded += 1;
      if (payment.normalizedStatus === 'failed') counts.failed += 1;
    }

    return counts;
  }, [normalizedPayments]);

  const load = useCallback(async () => {
    try {
      const { data } = await clientApi.payments();
      const payload = Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.payments?.data)
          ? data.payments.data
          : Array.isArray(data)
            ? data
            : [];
      setPayments(payload);
    } catch {
      setPayments([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const handleResumePayment = useCallback(async (paymentId: number) => {
    setResumingPaymentId(paymentId);
    try {
      const response = await clientApi.resumePayment(paymentId, {
        paymentMethodTypes: ['card', 'gcash', 'paymaya', 'grab_pay', 'shopee_pay', 'dob'],
        successUrl: callbackUrl,
        cancelUrl: callbackUrl,
      });

      const checkoutUrl = extractCheckoutUrl(response?.data);

      if (!checkoutUrl) {
        Alert.alert('Error', 'Unable to get payment checkout. Please try again or open this payment from Consultations.');
        return;
      }

      const result = await openAuthSessionAsync(checkoutUrl, callbackUrl);

      if (result.type === 'success') {
        await load();
        Alert.alert('Returned to App', 'Payment return received. We are updating the status in the background.');

        void (async () => {
          try {
            const payment = await paymongoService.pollPaymentStatus(paymentId, 24, 2000);
            if (paymongoService.isPaymentSuccessful(payment?.status)) {
              await load();
            }
          } catch {
            // Background refresh is best-effort.
          }
        })();
        return;
      }

      if (result.type === 'cancel') {
        Alert.alert('Cancelled', 'Payment was not completed.');
      }
    } catch (error: any) {
      Alert.alert('Error', error?.response?.data?.message || error?.message || 'Failed to resume payment.');
    } finally {
      setResumingPaymentId(null);
    }
  }, [callbackUrl, load]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={filteredPayments}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        contentContainerStyle={filteredPayments.length ? styles.listContent : styles.emptyWrap}
        ListHeaderComponent={
          <>
            <View style={styles.pageHeader}>
              <Text style={styles.pageTitle}>Payment History</Text>
              <Text style={styles.pageSubtitle}>Track your consultation payments and billing.</Text>
            </View>

            <View style={styles.metricsGrid}>
              <MetricCard
                icon="checkmark-circle"
                iconColor={Colors.success}
                iconBg="rgba(22, 163, 74, 0.12)"
                value={formatPhp(stats.totalPaid, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                label="Total Paid"
              />
              <MetricCard
                icon="time"
                iconColor={Colors.warning}
                iconBg="rgba(217, 119, 6, 0.12)"
                value={formatPhp(stats.pendingAmount, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                label="Pending"
              />
              <MetricCard
                icon="return-up-back"
                iconColor={Colors.error}
                iconBg="rgba(220, 38, 38, 0.1)"
                value={formatPhp(stats.refundedAmount, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                label="Refunded"
              />
              <MetricCard
                icon="receipt"
                iconColor={Colors.info}
                iconBg="rgba(37, 99, 235, 0.12)"
                value={stats.transactionCount.toString()}
                label="Transactions"
              />
            </View>

            <View style={styles.historySection}>
              <View style={styles.historyHeader}>
                <Text style={styles.historyTitle}>Transactions</Text>
                <Text style={styles.historyMeta}>{filterCounts[activeFilter]} shown</Text>
              </View>

              <View style={styles.filterRow}>
                {PAYMENT_FILTERS.map((filter) => {
                  const selected = activeFilter === filter.key;
                  return (
                    <TouchableOpacity
                      key={filter.key}
                      style={[styles.filterChip, selected && styles.filterChipActive]}
                      onPress={() => setActiveFilter(filter.key)}
                    >
                      <Text style={[styles.filterChipText, selected && styles.filterChipTextActive]}>{`${filter.label} ${filterCounts[filter.key]}`}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderText, styles.tableHeaderPrimary]}>Lawyer</Text>
                <Text style={styles.tableHeaderText}>Type</Text>
                <Text style={[styles.tableHeaderText, styles.tableHeaderAmount]}>Amount</Text>
              </View>
            </View>

            {__DEV__ && <Text style={styles.debugText}>API: {LARAVEL_API_BASE}</Text>}
          </>
        }
        ListEmptyComponent={<EmptyState message={activeFilter === 'all' ? 'No payments yet.' : `No ${activeFilter} payments yet.`} />}
        renderItem={({ item, index }) => {
          const canResumePayment = item.normalizedStatus === 'pending' || item.normalizedStatus === 'processing';

          return (
            <View style={[
              styles.transactionRow,
              canResumePayment && styles.transactionRowDue,
              index === 0 && styles.transactionRowFirst,
              index === filteredPayments.length - 1 && styles.transactionRowLast,
            ]}>
              <View style={styles.transactionTop}>
                <View style={styles.transactionIdentity}>
                  <Text style={styles.lawyerName}>{item.lawyerName}</Text>
                  <Text style={styles.consultationCode}>{item.consultationCode}</Text>
                  <Text style={styles.serviceLabel}>{item.serviceLabel}</Text>
                </View>

                <View style={styles.amountBlock}>
                  <Text style={[styles.amountText, { color: getAmountColor(item.normalizedStatus) }]}>
                    {formatPhp(item.amountValue, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                  <View style={[styles.statusBadge, getStatusBadgeStyle(item.normalizedStatus)]}>
                    <Text style={[styles.statusBadgeText, { color: getStatusColor(item.normalizedStatus) }]}>{item.statusLabel}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.transactionMetaRow}>
                <View style={styles.metaPill}>
                  <Ionicons name="card-outline" size={13} color={Colors.primary} />
                  <Text style={styles.metaPillText}>{item.paymentTypeLabel}</Text>
                  {canResumePayment ? (
                    <View style={styles.dueBadge}>
                      <Ionicons name="alert-circle" size={11} color="#D97706" />
                      <Text style={styles.dueBadgeText}>Due</Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.metaPill}>
                  <Ionicons name="calendar-outline" size={13} color={Colors.textMuted} />
                  <Text style={styles.metaPillText}>{item.dateLabel}</Text>
                </View>
              </View>

              {canResumePayment && (
                <TouchableOpacity
                  style={styles.payNowBtn}
                  onPress={() => handleResumePayment(item.id)}
                  disabled={resumingPaymentId === item.id}
                >
                  {resumingPaymentId === item.id ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="flash-outline" size={16} color="#fff" />
                      <Text style={styles.payNowText}>Pay Now</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

function MetricCard({
  icon,
  iconColor,
  iconBg,
  value,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBg: string;
  value: string;
  label: string;
}) {
  return (
    <View style={styles.metricCard}>
      <View style={[styles.metricIconWrap, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={19} color={iconColor} />
      </View>
      <View style={styles.metricTextWrap}>
        <Text style={styles.metricValue} numberOfLines={1}>{value}</Text>
        <Text style={styles.metricLabel}>{label}</Text>
      </View>
    </View>
  );
}

function normalizePaymentStatus(status?: string): NormalizedPaymentStatus {
  const value = String(status || '').toLowerCase();
  if (value === 'paid' || value === 'downpayment_paid') return 'paid';
  if (value === 'pending') return 'pending';
  if (value === 'refund_pending' || value === 'refunding') return 'processing';
  if (value === 'refunded' || value === 'refund_completed') return 'refunded';
  if (value === 'failed') return 'failed';
  if (value === 'cancelled') return 'cancelled';
  return 'other';
}

function matchesFilter(status: NormalizedPaymentStatus, filter: PaymentFilter) {
  if (filter === 'all') return true;
  if (filter === 'paid') return status === 'paid';
  if (filter === 'pending') return status === 'pending' || status === 'processing';
  if (filter === 'refunded') return status === 'refunded';
  return status === 'failed';
}

function formatPaymentType(type?: string) {
  const raw = String(type || 'consultation').trim();
  if (!raw) return 'Consultation';

  const normalized = raw.toLowerCase().replace(/[_-]+/g, ' ');
  if (normalized.includes('downpayment')) return 'Downpayment 50%';
  if (normalized.includes('balance')) return 'Balance 50%';
  if (normalized.includes('refund')) return 'Refund';

  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatServiceLabel(payment: PaymentItem) {
  const typeLabel = payment.consultation?.consultation_type || payment.consultation?.service_type || 'Consultation';
  const duration = payment.consultation?.duration_minutes || payment.consultation?.duration;
  const normalizedType = String(typeLabel).replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

  if (duration) {
    return `${normalizedType}, ${duration} min`;
  }

  return normalizedType;
}

function getStatusLabel(status: NormalizedPaymentStatus, type?: string) {
  if (status === 'paid' && String(type || '').toLowerCase().includes('downpayment')) return 'Paid (Down)';
  if (status === 'processing') return 'Refunding';
  if (status === 'refunded') return 'Refunded';
  if (status === 'pending') return 'Pending';
  if (status === 'failed') return 'Failed';
  if (status === 'cancelled') return 'Cancelled';
  if (status === 'paid') return 'Paid';
  return 'Recorded';
}

function getAmountColor(status: NormalizedPaymentStatus) {
  if (status === 'refunded') return Colors.error;
  if (status === 'pending' || status === 'processing') return Colors.warning;
  return Colors.primaryDark;
}

function getStatusColor(status: NormalizedPaymentStatus) {
  if (status === 'paid') return '#1E64B7';
  if (status === 'pending' || status === 'processing') return '#9A6700';
  if (status === 'refunded' || status === 'failed' || status === 'cancelled') return '#B42318';
  return Colors.textMuted;
}

function getStatusBadgeStyle(status: NormalizedPaymentStatus) {
  if (status === 'paid') return styles.statusBadgePaid;
  if (status === 'pending' || status === 'processing') return styles.statusBadgePending;
  if (status === 'refunded') return styles.statusBadgeRefunded;
  if (status === 'failed' || status === 'cancelled') return styles.statusBadgeFailed;
  return styles.statusBadgeNeutral;
}

function formatHistoryDate(value?: string) {
  if (!value) return 'No date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No date';

  return date.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getSortTime(value?: string) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6FA' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F4F6FA' },
  listContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120 },
  emptyWrap: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120 },
  pageHeader: {
    marginBottom: 18,
    paddingTop: 8,
  },
  pageTitle: {
    color: Colors.primaryDark,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.6,
  },
  pageSubtitle: {
    marginTop: 6,
    color: Colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 18,
  },
  metricCard: {
    width: '48.2%',
    minHeight: 102,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E6EBF3',
    shadowColor: '#0F172A',
    shadowOpacity: 0.07,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  metricIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  metricTextWrap: {
    gap: 4,
  },
  metricValue: {
    color: Colors.primaryDark,
    fontSize: 22,
    fontWeight: '900',
  },
  metricLabel: {
    color: '#7A8AA0',
    fontSize: 13,
    fontWeight: '700',
  },
  historySection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E6EBF3',
    marginBottom: 10,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  historyTitle: {
    color: Colors.primaryDark,
    fontSize: 20,
    fontWeight: '900',
  },
  historyMeta: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: '#D9E1EE',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F8FAFD',
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipText: {
    color: '#607089',
    fontSize: 12,
    fontWeight: '800',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  tableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#EEF2F7',
    paddingTop: 12,
  },
  tableHeaderText: {
    color: '#8A97A8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  tableHeaderPrimary: {
    flex: 1,
  },
  tableHeaderAmount: {
    textAlign: 'right',
  },
  transactionRow: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E6EBF3',
    borderTopWidth: 0,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  transactionRowDue: {
    backgroundColor: '#FFFBEA',
    borderColor: '#F3E7B5',
  },
  transactionRowFirst: {
    borderTopWidth: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  transactionRowLast: {
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    marginBottom: 8,
  },
  transactionTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 14,
  },
  transactionIdentity: {
    flex: 1,
  },
  lawyerName: {
    color: Colors.primaryDark,
    fontSize: 18,
    fontWeight: '900',
  },
  consultationCode: {
    marginTop: 6,
    color: '#4E5F78',
    fontSize: 15,
    fontWeight: '700',
  },
  serviceLabel: {
    marginTop: 2,
    color: '#7A8AA0',
    fontSize: 13,
    fontWeight: '600',
  },
  amountBlock: {
    alignItems: 'flex-end',
    minWidth: 108,
  },
  amountText: {
    fontSize: 20,
    fontWeight: '900',
  },
  statusBadge: {
    marginTop: 10,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
  },
  statusBadgePaid: {
    backgroundColor: '#D8ECFF',
    borderColor: '#C6E1FB',
  },
  statusBadgePending: {
    backgroundColor: '#FFF0C2',
    borderColor: '#FBE3A0',
  },
  statusBadgeRefunded: {
    backgroundColor: '#FEE4E2',
    borderColor: '#FECACA',
  },
  statusBadgeFailed: {
    backgroundColor: '#FEE4E2',
    borderColor: '#F9C5C2',
  },
  statusBadgeNeutral: {
    backgroundColor: '#EEF2F7',
    borderColor: '#E2E8F0',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  transactionMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F7F9FC',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  metaPillText: {
    color: '#5E7088',
    fontSize: 12,
    fontWeight: '700',
  },
  dueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginLeft: 2,
  },
  dueBadgeText: {
    color: '#D97706',
    fontSize: 11,
    fontWeight: '900',
  },
  payNowBtn: {
    marginTop: 14,
    borderRadius: 14,
    backgroundColor: '#D97706',
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  payNowText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  debugText: {
    marginTop: 6,
    marginBottom: 12,
    color: '#8A97A8',
    fontSize: 10,
  },
});

function resolvePaymentBackRoute(backTo?: string) {
  if (backTo === 'payroll') return '/payroll';
  return '/(client)/consultations';
}
