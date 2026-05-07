import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons as IoniconsBase } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { formatPhp } from '@/constants/currency';
import { lawFirmApi } from '@/services/api';
import { useLocalSearchParams, useRouter } from 'expo-router';

const Ionicons = IoniconsBase as any;
const FILTERS = ['pending', 'upcoming', 'completed', 'cancelled', 'expired', 'all'] as const;

function normalizeStatus(status?: string | null) {
  const value = String(status ?? '').toLowerCase();
  if (['pending', 'processing', 'payment_confirming', 'payment_pending', 'awaiting_payment'].includes(value)) return 'pending';
  if (FILTERS.includes(value as (typeof FILTERS)[number])) return value as (typeof FILTERS)[number];
  return 'all';
}

function statusLabel(status: string) {
  switch (status) {
    case 'pending': return 'Awaiting Lawyer';
    case 'upcoming': return 'Upcoming';
    case 'completed': return 'Completed';
    case 'cancelled': return 'Cancelled';
    case 'expired': return 'Expired';
    default: return 'All';
  }
}

function statusPalette(status: string) {
  switch (status) {
    case 'pending': return { icon: 'hourglass-outline', color: '#D97706', bg: '#FFF4DB' };
    case 'upcoming': return { icon: 'calendar-outline', color: '#2563EB', bg: '#EAF2FF' };
    case 'completed': return { icon: 'checkmark-circle', color: '#16A34A', bg: '#E8FAEE' };
    case 'cancelled': return { icon: 'close-circle', color: '#DC2626', bg: '#FEECEC' };
    case 'expired': return { icon: 'time-outline', color: '#6B7280', bg: '#EEF2F7' };
    default: return { icon: 'albums-outline', color: '#334155', bg: '#E2E8F0' };
  }
}

function formatSchedule(value?: string | null) {
  if (!value) return 'No schedule';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No schedule';
  return `${date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })} ${date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
}

export default function LawFirmConsultations() {
  const params = useLocalSearchParams<{ consultationId?: string; fromNotification?: string }>();
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [apiError, setApiError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<(typeof FILTERS)[number]>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [messagingId, setMessagingId] = useState<number | null>(null);
  const openedFromNotification = params?.fromNotification === '1';
  const targetConsultationId = Number(params?.consultationId || 0) || null;

  const load = useCallback(async () => {
    try {
      const { data } = await lawFirmApi.consultations();
      const payload = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      setItems(payload);
      setApiError(null);
    } catch (err: any) {
      setItems([]);
      setApiError(String(err?.response?.data?.message ?? err?.message ?? 'Failed to load consultations.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!openedFromNotification) return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      router.back();
      return true;
    });

    return () => subscription.remove();
  }, [openedFromNotification, router]);

  useEffect(() => {
    if (!targetConsultationId || !items.length) return;
    const target = items.find((item) => Number(item?.id) === targetConsultationId);
    if (!target) return;

    const nextFilter = normalizeStatus(target?.status);
    if (activeFilter !== nextFilter) {
      setActiveFilter(nextFilter);
    }
  }, [activeFilter, items, targetConsultationId]);

  const summary = useMemo(() => {
    const counts = { pending: 0, upcoming: 0, completed: 0, cancelled: 0, expired: 0, all: items.length };
    items.forEach((item) => {
      const key = normalizeStatus(item?.status);
      if (key in counts && key !== 'all') counts[key as keyof typeof counts] += 1;
    });
    return counts;
  }, [items]);

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    let nextItems = activeFilter === 'all'
      ? items
      : items.filter((item) => normalizeStatus(item?.status) === activeFilter);

    if (query) {
      nextItems = nextItems.filter((item) => {
        const haystack = [
          item?.code,
          item?.client_name,
          item?.lawyer_name,
          item?.status,
          item?.type,
          item?.scheduled_at,
        ]
          .map((value) => String(value ?? '').toLowerCase())
          .join(' ');

        return haystack.includes(query);
      });
    }

    if (!targetConsultationId) return nextItems;
    const targetIndex = nextItems.findIndex((item) => Number(item?.id) === targetConsultationId);
    if (targetIndex <= 0) return nextItems;
    const target = nextItems[targetIndex];
    return [target, ...nextItems.slice(0, targetIndex), ...nextItems.slice(targetIndex + 1)];
  }, [activeFilter, items, searchQuery, targetConsultationId]);

  const handleMessageClient = useCallback(async (item: any) => {
    if (!item?.client_id) {
      Alert.alert('Unavailable', 'This consultation does not have a client assigned yet.');
      return;
    }

    setMessagingId(Number(item.id));
    try {
      await lawFirmApi.startConversation(Number(item.client_id));
      const { data } = await lawFirmApi.conversations();
      const conversations = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
      const target = conversations.find((entry: any) => Number(entry?.other_user?.id) === Number(item.client_id));
      if (target?.id) {
        router.push({ pathname: '/(lawfirm)/messages', params: { conversationId: String(target.id) } });
      } else {
        router.push('/(lawfirm)/messages');
      }
    } catch (err: any) {
      Alert.alert('Unable to open chat', err?.response?.data?.message ?? 'Please try again.');
    } finally {
      setMessagingId(null);
    }
  }, [router]);

  const handleOpenDocument = useCallback((url?: string | null) => {
    if (!url) return;
    Linking.openURL(url).catch(() => {
      Alert.alert('Unavailable', 'Could not open the case document.');
    });
  }, []);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        <Text style={styles.title}>Firm Consultations</Text>
        <Text style={styles.subtitle}>All consultations handled by your team.</Text>

        {openedFromNotification ? (
          <View style={styles.notificationReturnBar}>
            <TouchableOpacity style={styles.notificationReturnBtn} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={16} color={Colors.primary} />
              <Text style={styles.notificationReturnText}>Back to Notifications</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.summaryRow}>
          {FILTERS.filter((item) => item !== 'all').map((item) => {
            const palette = statusPalette(item);
            return (
              <View key={item} style={styles.summaryCard}>
                <View style={[styles.summaryIconWrap, { backgroundColor: palette.bg }]}>
                  <Ionicons name={palette.icon} size={18} color={palette.color} />
                </View>
                <Text style={styles.summaryValue}>{summary[item]}</Text>
                <Text style={styles.summaryLabel}>{statusLabel(item)}</Text>
              </View>
            );
          })}
        </ScrollView>

        <View style={styles.searchRow}>
          <Ionicons name="search" size={18} color="#8797AA" />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search by client or lawyer name..."
            placeholderTextColor="#91A0B1"
          />
          {searchQuery.trim().length ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color="#91A0B1" />
            </TouchableOpacity>
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {FILTERS.map((item) => {
            const active = activeFilter === item;
            return (
              <TouchableOpacity key={item} style={[styles.filterChip, active && styles.filterChipActive]} onPress={() => setActiveFilter(item)}>
                <Text style={[styles.filterText, active && styles.filterTextActive]}>{statusLabel(item)}</Text>
                {item !== 'all' ? (
                  <View style={[styles.filterBadge, active && styles.filterBadgeActive]}>
                    <Text style={[styles.filterBadgeText, active && styles.filterBadgeTextActive]}>{summary[item]}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {apiError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Sync Issue Detected</Text>
            <Text style={styles.errorLine}>{apiError}</Text>
          </View>
        ) : null}

        {filteredItems.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="calendar-outline" size={40} color="#CBD5E1" />
            <Text style={styles.emptyTitle}>No {statusLabel(activeFilter).toLowerCase()} consultations</Text>
            <Text style={styles.emptyText}>Try a different filter or pull down to refresh your team consultations.</Text>
          </View>
        ) : filteredItems.map((item, index) => {
          const statusKey = normalizeStatus(item?.status);
          const palette = statusPalette(statusKey);
          const isTarget = Number(item?.id) === targetConsultationId;
          return (
            <View key={String(item?.id ?? index)} style={[styles.card, isTarget && styles.cardHighlighted]}>
              <View style={styles.cardHeader}>
                <Text style={styles.code}>#{item?.code ?? item?.id ?? '-'}</Text>
                <View style={[styles.statusPill, { backgroundColor: palette.bg }]}>
                  <Ionicons name={palette.icon} size={12} color={palette.color} />
                  <Text style={[styles.statusText, { color: palette.color }]}>{statusLabel(statusKey)}</Text>
                </View>
              </View>

              <Text style={styles.clientName}>{item?.client?.name ?? item?.client_name ?? 'Client not assigned'}</Text>
              <Text style={styles.lawyerName}>Handled by {item?.lawyer?.name ?? item?.lawyer_name ?? 'No lawyer assigned'}</Text>

              <View style={styles.metaRow}>
                <View style={styles.metaPill}>
                  <Ionicons name="videocam-outline" size={12} color="#1D4ED8" />
                  <Text style={styles.metaPillText}>{String(item?.type ?? 'Consultation').replace(/^./, (char: string) => char.toUpperCase())}</Text>
                </View>
                <View style={styles.metaPill}>
                  <Ionicons name="calendar-outline" size={12} color="#64748B" />
                  <Text style={styles.metaPillText}>{formatSchedule(item?.scheduled_at)}</Text>
                </View>
              </View>

              <View style={styles.amountRow}>
                <Text style={styles.amountLabel}>Consultation Amount</Text>
                <Text style={styles.amountValue}>{formatPhp(Number(item?.amount ?? 0))}</Text>
              </View>

              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={[styles.secondaryBtn, messagingId === Number(item?.id) && styles.btnDisabled]}
                  onPress={() => handleMessageClient(item)}
                  disabled={messagingId === Number(item?.id)}
                >
                  {messagingId === Number(item?.id)
                    ? <ActivityIndicator size="small" color={Colors.primary} />
                    : <Ionicons name="chatbubble-ellipses" size={15} color={Colors.primary} />}
                  <Text style={styles.secondaryBtnText}>Message Client</Text>
                </TouchableOpacity>
                {item?.case_document_url ? (
                  <TouchableOpacity style={styles.primaryBtn} onPress={() => handleOpenDocument(item.case_document_url)}>
                    <Ionicons name="document-text-outline" size={15} color="#FFFFFF" />
                    <Text style={styles.primaryBtnText}>Case File</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#EEF3F8' },
  content: { paddingHorizontal: 16, paddingBottom: 28 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#EEF3F8' },
  title: { color: '#17305B', fontSize: 28, fontWeight: '900', marginTop: 8 },
  subtitle: { color: '#60748A', fontSize: 16, marginTop: 6, marginBottom: 12 },
  notificationReturnBar: { paddingBottom: 10 },
  notificationReturnBtn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#EAF0FF', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  notificationReturnText: { color: Colors.primary, fontSize: 12, fontWeight: '800' },
  summaryRow: { gap: 10, paddingBottom: 14 },
  summaryCard: {
    minWidth: 128,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#E1E9F3',
    shadowColor: '#102042',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 2,
  },
  summaryIconWrap: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  summaryValue: { color: '#17305B', fontWeight: '900', fontSize: 28 },
  summaryLabel: { color: '#65788D', fontSize: 14, marginTop: 2 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DEE7F0',
    paddingHorizontal: 14,
    height: 52,
    marginBottom: 12,
  },
  searchInput: { flex: 1, color: '#17305B', fontSize: 15 },
  filters: { gap: 10, paddingBottom: 14 },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E1E9F3',
  },
  filterChipActive: { backgroundColor: '#243A67', borderColor: '#243A67' },
  filterText: { color: '#617488', fontWeight: '800', fontSize: 13 },
  filterTextActive: { color: '#FFFFFF' },
  filterBadge: { minWidth: 24, paddingHorizontal: 6, height: 24, borderRadius: 999, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  filterBadgeActive: { backgroundColor: 'rgba(255,255,255,0.16)' },
  filterBadgeText: { color: '#243A67', fontWeight: '900', fontSize: 11 },
  filterBadgeTextActive: { color: '#FFFFFF' },
  errorCard: {
    backgroundColor: '#FCEBEC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E7B5B8',
    padding: 12,
    marginBottom: 12,
  },
  errorTitle: { color: '#8A1C22', fontWeight: '900', marginBottom: 4, fontSize: 12 },
  errorLine: { color: '#7A2A2F', fontSize: 12, lineHeight: 18 },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E1E9F3',
    padding: 24,
    alignItems: 'center',
  },
  emptyTitle: { color: '#1F365F', fontWeight: '800', fontSize: 18, marginTop: 10 },
  emptyText: { color: '#6F8093', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E1E9F3',
    padding: 17,
    marginBottom: 14,
    shadowColor: '#102042',
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  cardHighlighted: { borderColor: '#60A5FA', borderWidth: 2, backgroundColor: '#F8FBFF' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  code: { color: '#1D4ED8', fontWeight: '900', fontSize: 13 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusText: { fontWeight: '800', fontSize: 12 },
  clientName: { color: '#17305B', fontSize: 20, fontWeight: '900', marginTop: 14 },
  lawyerName: { color: '#66788E', fontSize: 14, marginTop: 4 },
  metaRow: { gap: 10, marginTop: 14 },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F7FAFD',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E8EEF6',
  },
  metaPillText: { color: '#60748A', fontSize: 13, flex: 1 },
  amountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },
  amountLabel: { color: '#6A7D92', fontSize: 13, fontWeight: '700' },
  amountValue: { color: '#17305B', fontSize: 20, fontWeight: '900' },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  secondaryBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#C9D7EA',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#F6F9FF',
  },
  secondaryBtnText: { color: Colors.primary, fontWeight: '800', fontSize: 14 },
  primaryBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: '#243A67',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  btnDisabled: { opacity: 0.5 },
});
