import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, TextInput, BackHandler, Linking, Modal, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons as IoniconsBase } from '@expo/vector-icons';
const Ionicons = IoniconsBase as any;
import { lawyerApi } from '@/services/api';
import { Colors } from '@/constants/theme';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/context/auth';
import {
  createReverbEcho,
  isReverbConfigured,
  subscribeUserConsultationEvents,
  subscribeUserPaymentEvents,
} from '@/services/realtime';

const STATUS_TABS = ['pending', 'upcoming', 'completed', 'cancelled', 'expired', 'all'];
const TAB_WIDTHS: Record<string, number> = {
  pending: 92,
  upcoming: 100,
  completed: 104,
  cancelled: 104,
  expired: 92,
  all: 64,
};
const STATUS_SUMMARY = [
  { key: 'pending', label: 'Pending', icon: 'hourglass-outline', color: Colors.pending },
  { key: 'upcoming', label: 'Upcoming', icon: 'calendar-outline', color: Colors.upcoming },
  { key: 'completed', label: 'Completed', icon: 'checkmark-circle-outline', color: Colors.success },
  { key: 'cancelled', label: 'Cancelled', icon: 'close-circle-outline', color: Colors.error },
  { key: 'expired', label: 'Expired', icon: 'time-outline', color: Colors.textMuted },
];

export default function LawyerConsultations() {
  const { user, token } = useAuth();
  const params = useLocalSearchParams<{ consultationId?: string; fromNotification?: string }>();
  const [activeTab, setActiveTab] = useState('pending');
  const [consultations, setConsultations] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actioning, setActioning] = useState<number | null>(null);
  const [acceptTarget, setAcceptTarget] = useState<any | null>(null);
  const [declineTarget, setDeclineTarget] = useState<any | null>(null);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const cache = useRef<Record<string, any[]>>({});
  const router = useRouter();
  const openedFromNotification = params?.fromNotification === '1';
  const targetConsultationId = Number(params?.consultationId || 0) || null;

  const load = useCallback(async (status: string, forceRefresh = false) => {
    if (!forceRefresh && cache.current[status]) {
      setConsultations(cache.current[status]);
      setLoading(false);
      return;
    }
    try {
      const { data } = await lawyerApi.consultations(status);
      const items = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
      cache.current[status] = items;
      setConsultations(items);
    } catch (e: any) {
      console.warn('Consultations load error:', e?.response?.data ?? e?.message);
      setConsultations([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadStatusCounts = useCallback(async () => {
    const results = await Promise.allSettled(
      STATUS_SUMMARY.map((item) => lawyerApi.consultations(item.key))
    );
    const nextCounts: Record<string, number> = {};
    results.forEach((result, index) => {
      const key = STATUS_SUMMARY[index].key;
      if (result.status !== 'fulfilled') {
        nextCounts[key] = cache.current[key]?.length ?? 0;
        return;
      }
      const payload = result.value?.data;
      const items = Array.isArray(payload) ? payload : (Array.isArray(payload?.data) ? payload.data : []);
      cache.current[key] = items;
      nextCounts[key] = items.length;
    });
    nextCounts.all = STATUS_SUMMARY.reduce((sum, item) => sum + (nextCounts[item.key] ?? 0), 0);
    setStatusCounts(nextCounts);
  }, []);

  useEffect(() => {
    setLoading(!cache.current[activeTab]);
    load(activeTab);
  }, [activeTab, load]);

  useEffect(() => {
    loadStatusCounts();
  }, [loadStatusCounts]);

  useEffect(() => {
    if (!openedFromNotification) return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      router.back();
      return true;
    });

    return () => subscription.remove();
  }, [openedFromNotification, router]);

  useEffect(() => {
    if (!user?.id || !token || !isReverbConfigured()) return;

    const echo = createReverbEcho(token);
    const refresh = () => { cache.current = {}; load(activeTab, true); loadStatusCounts(); };

    const unsubscribeConsultations = subscribeUserConsultationEvents(echo, user.id, {
      onCreated: refresh,
      onUpdated: refresh,
    });

    const unsubscribePayments = subscribeUserPaymentEvents(echo, user.id, refresh);

    return () => {
      unsubscribeConsultations();
      unsubscribePayments();
      echo.disconnect();
    };
  }, [activeTab, load, loadStatusCounts, token, user?.id]);

  useEffect(() => {
    if (!targetConsultationId || !consultations.length) return;

    const target = consultations.find((item) => Number(item.id) === targetConsultationId);
    if (!target) return;

    const nextTab = STATUS_TABS.includes(String(target.status)) ? String(target.status) : 'all';
    if (activeTab !== nextTab) {
      setActiveTab(nextTab);
    }
  }, [activeTab, consultations, targetConsultationId]);

  async function action(fn: () => Promise<any>, id: number) {
    setActioning(id);
    try { await fn(); cache.current = {}; load(activeTab, true); loadStatusCounts(); }
    catch (err: any) { Alert.alert('Error', err?.response?.data?.message || 'Action failed.'); }
    finally { setActioning(null); }
  }

  function confirmAccept(item: any) {
    setAcceptTarget(item);
  }

  function confirmDecline(item: any) {
    setDeclineTarget(item);
  }

  function switchTab(tab: string) {
    setActiveTab(tab);
  }

  function closeAcceptModal() {
    if (acceptTarget && actioning === Number(acceptTarget.id)) return;
    setAcceptTarget(null);
  }

  function closeDeclineModal() {
    if (declineTarget && actioning === Number(declineTarget.id)) return;
    setDeclineTarget(null);
  }

  function submitAcceptRequest() {
    if (!acceptTarget) return;
    const targetId = Number(acceptTarget.id);
    setAcceptTarget(null);
    action(() => lawyerApi.acceptConsultation(targetId), targetId);
  }

  function submitDeclineRequest() {
    if (!declineTarget) return;
    const targetId = Number(declineTarget.id);
    setDeclineTarget(null);
    action(() => lawyerApi.declineConsultation(targetId), targetId);
  }

  const PENDING_STATUSES = ['pending', 'processing', 'payment_confirming', 'payment_pending', 'awaiting_payment'];

  const filteredConsultations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const nextItems = !query ? consultations : consultations.filter((item) => {
      const searchable = [
        item?.code,
        item?.client?.name,
        item?.status,
        item?.type,
        item?.scheduled_at,
      ]
        .map((value) => String(value ?? '').toLowerCase())
        .join(' ');

      return searchable.includes(query);
    });

    if (!targetConsultationId) return nextItems;

    const targetIndex = nextItems.findIndex((item) => Number(item.id) === targetConsultationId);
    if (targetIndex <= 0) return nextItems;

    const targetItem = nextItems[targetIndex];
    return [targetItem, ...nextItems.slice(0, targetIndex), ...nextItems.slice(targetIndex + 1)];
  }, [consultations, searchQuery, targetConsultationId]);

  const getBadge = (status: string) => {
    if (PENDING_STATUSES.includes(status)) return { bg: Colors.pending + '20', text: Colors.pending, label: 'Pending' };
    return ({
      upcoming:  { bg: Colors.upcoming + '20', text: Colors.upcoming,  label: 'Upcoming'  },
      completed: { bg: Colors.success + '20',  text: Colors.success,   label: 'Completed' },
      cancelled: { bg: Colors.error + '20',    text: Colors.error,     label: 'Cancelled' },
      expired:   { bg: Colors.textMuted + '20',text: Colors.textMuted, label: 'Expired'   },
    }[status] ?? { bg: Colors.textMuted + '20', text: Colors.textMuted, label: status });
  };

  function confirmAndJoinCall(item: any) {
    const scheduledTime = new Date(item.scheduled_at).getTime();
    const now = Date.now();
    const windowMinutes = 10; // Only allow joining within 10 minutes before and after scheduled time
    const windowStart = scheduledTime - windowMinutes * 60 * 1000;
    const windowEnd = scheduledTime + windowMinutes * 60 * 1000;
    // Custom logic: Only allow joining if client has paid (item.paid === true)
    if (item.paid === false) {
      Alert.alert('Payment Required', 'The client must complete payment before you can join the call.');
      return;
    }
    // Custom logic: Only allow joining if client has accepted terms (item.termsAccepted === true)
    if (item.termsAccepted === false) {
      Alert.alert('Terms Not Accepted', 'The client must accept the terms and conditions before you can join the call.');
      return;
    }
    if (now < windowStart) {
      Alert.alert(
        'Too Early',
        `You can only join the call within ${windowMinutes} minutes before the scheduled time: ${new Date(item.scheduled_at).toLocaleString()}`
      );
      return;
    }
    if (now > windowEnd) {
      Alert.alert(
        'Too Late',
        `You can only join the call up to ${windowMinutes} minutes after the scheduled time.`
      );
      return;
    }
    if (item.status !== 'upcoming') {
      Alert.alert('Not Ready', 'You can only join calls for upcoming consultations.');
      return;
    }
    if (item.status === 'cancelled') {
      Alert.alert('Cancelled', 'This consultation has been cancelled.');
      return;
    }
    if (item.status === 'completed') {
      Alert.alert('Completed', 'This consultation is already completed.');
      return;
    }
    if (!item.client || !item.client.id) {
      Alert.alert('Not Assigned', 'A client has not yet been assigned to this consultation.');
      return;
    }
    Alert.alert(
      'Join Consultation Call',
      `Do you want to join the call for consultation #${item.code || item.id}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Join',
          style: 'default',
          onPress: () =>
            router.push({
              pathname: '/(lawyer)/video-call',
              params: {
                mode: 'consultation',
                consultationId: item.id.toString(),
                consultationCode: String(item.code || ''),
                scheduledAt: String(item.scheduled_at || ''),
                durationMinutes: String(item.duration_minutes || ''),
                conversationId: item.id.toString(),
                title: item.type || 'Consultation',
              },
            }),
        },
      ]
    );
  }

  function renderItem({ item }: { item: any }) {
    const badge = getBadge(item.status);
    return (
      <View style={[styles.card, Number(item.id) === targetConsultationId && styles.cardHighlighted]}>
        <View style={styles.cardTop}>
          <Text style={styles.code}>{item.code}</Text>
          <View style={[styles.badge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.badgeText, { color: badge.text }]}>{badge.label}</Text>
          </View>
        </View>
        <Text style={styles.clientName}>{item.client?.name}</Text>
        <View style={styles.row}>
          <Ionicons name="calendar-outline" size={13} color={Colors.textMuted} />
          <Text style={styles.meta}>{new Date(item.scheduled_at).toLocaleString()}</Text>
        </View>
        <View style={styles.row}>
          <Ionicons name="videocam-outline" size={13} color={Colors.textMuted} />
          <Text style={styles.meta}>{item.type} · {item.duration_minutes} min</Text>
        </View>
        <Text style={styles.price}>₱{item.price?.toLocaleString()}</Text>

        {!!item.case_document_url && (
          <TouchableOpacity
            style={styles.docBtn}
            onPress={() => Linking.openURL(item.case_document_url)}
          >
            <Ionicons name="attach" size={15} color={Colors.primary} />
            <Text style={styles.docBtnText}>View Client Document</Text>
          </TouchableOpacity>
        )}

        {PENDING_STATUSES.includes(item.status) && (
          <View style={[styles.downpaymentChip, { backgroundColor: item.downpayment_paid ? Colors.success + '18' : Colors.error + '12', marginBottom: 8 }]}>
            <Ionicons name={item.downpayment_paid ? 'checkmark-circle' : 'time-outline'} size={13} color={item.downpayment_paid ? Colors.success : Colors.error} />
            <Text style={{ fontSize: 12, color: item.downpayment_paid ? Colors.success : Colors.error, fontWeight: '600' }}>
              {item.downpayment_paid ? 'Downpayment Paid' : 'Awaiting Downpayment'}
            </Text>
          </View>
        )}

        {PENDING_STATUSES.includes(item.status) && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.declineBtn}
              onPress={() => confirmDecline(item)}
            >
              <Ionicons name="close-outline" size={15} color="#D84343" />
              <Text style={styles.declineBtnText}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.acceptBtn, actioning === item.id && { opacity: 0.7 }]}
              onPress={() => confirmAccept(item)}
              disabled={actioning === item.id}
            >
              {actioning === item.id ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-outline" size={15} color="#fff" />
                  <Text style={styles.acceptBtnText}>Accept</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {item.status === 'upcoming' && (
          <View style={{ marginTop: 10, flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              style={[styles.completeBtn, { flex: 1 }]}
              onPress={() => confirmAndJoinCall(item)}
            >
              <Ionicons name="videocam-outline" size={16} color="#fff" />
              <Text style={styles.completeBtnText}>Join Call</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.completeBtn, { flex: 1, backgroundColor: Colors.success }]}
              onPress={() => Alert.alert('Mark Complete?', 'Mark this consultation as completed?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Complete', onPress: () => action(() => lawyerApi.completeConsultation(item.id), item.id) },
              ])}
              disabled={actioning === item.id}
            >
              <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
              <Text style={styles.completeBtnText}>Complete</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topSection}>
        {openedFromNotification ? (
          <View style={styles.notificationReturnBar}>
            <TouchableOpacity style={styles.notificationReturnBtn} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={16} color={Colors.primary} />
              <Text style={styles.notificationReturnText}>Back to Notifications</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        <View style={styles.pageHero}>
          <Text style={styles.pageEyebrow}>LAWYER CASES</Text>
          <Text style={styles.pageTitle}>Consultations</Text>
          <Text style={styles.pageSub}>Manage all your client consultations</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.summaryScroller} contentContainerStyle={styles.summaryRow}>
          {STATUS_SUMMARY.map((item) => {
            const active = activeTab === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                style={[styles.summaryCard, active && styles.summaryCardActive]}
                activeOpacity={0.88}
                onPress={() => switchTab(item.key)}
              >
                <View style={[styles.summaryIconWrap, { backgroundColor: `${item.color}18` }]}>
                  <Ionicons name={item.icon} size={18} color={item.color} />
                </View>
                <View style={styles.summaryCopy}>
                  <Text style={styles.summaryValue}>{statusCounts[item.key] ?? 0}</Text>
                  <Text style={styles.summaryLabel}>{item.label}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.controlsCard}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tabsScroller}
            contentContainerStyle={styles.tabs}
          >
            {STATUS_TABS.map((tab) => (
              <TouchableOpacity
                key={tab}
                style={[styles.tab, { width: TAB_WIDTHS[tab] ?? 108 }, activeTab === tab && styles.tabActive]}
                onPress={() => switchTab(tab)}
              >
                <Text numberOfLines={1} style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                  {tab === 'all' ? 'All' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={styles.searchRow}>
            <Ionicons name="search" size={16} color={Colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search code, client, status..."
              placeholderTextColor={Colors.textLight}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.trim() ? (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color={Colors.textLight} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>

      <FlatList
        style={styles.listRoot}
        data={filteredConsultations}
        keyExtractor={(i) => i.id.toString()}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); delete cache.current[activeTab]; load(activeTab, true); loadStatusCounts(); }} colors={[Colors.primary]} />}
        ListHeaderComponent={loading ? <ActivityIndicator style={{ marginTop: 32 }} size="large" color={Colors.primary} /> : null}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.empty}>
              <Ionicons name="briefcase-outline" size={48} color={Colors.textLight} />
              <Text style={styles.emptyText}>{searchQuery.trim() ? 'No matching consultations found' : 'No consultations found'}</Text>
            </View>
          )
        }
      />

      <Modal
        visible={!!acceptTarget}
        transparent
        animationType="fade"
        onRequestClose={closeAcceptModal}
      >
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <TouchableOpacity style={styles.confirmCloseBtn} onPress={closeAcceptModal}>
              <Ionicons name="close" size={16} color="#6B7280" />
            </TouchableOpacity>

            <View style={styles.confirmIconWrap}>
              <Ionicons name="checkmark" size={22} color="#16A34A" />
            </View>

            <Text style={styles.confirmTitle}>Accept Consultation?</Text>

            <View style={styles.confirmInfoPill}>
              <Text style={styles.confirmInfoText}>
                {(acceptTarget?.client?.name || 'Client')}
                {' · '}
                {acceptTarget?.scheduled_at ? new Date(acceptTarget.scheduled_at).toLocaleString() : 'Scheduled time unavailable'}
              </Text>
            </View>

            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={styles.confirmCancelBtn}
                onPress={closeAcceptModal}
                disabled={!!acceptTarget && actioning === Number(acceptTarget.id)}
              >
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.confirmAcceptBtn,
                  !!acceptTarget && actioning === Number(acceptTarget.id) && { opacity: 0.7 },
                ]}
                onPress={submitAcceptRequest}
                disabled={!!acceptTarget && actioning === Number(acceptTarget.id)}
              >
                {!!acceptTarget && actioning === Number(acceptTarget.id) ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.confirmAcceptText}>Accept Request</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!declineTarget}
        transparent
        animationType="fade"
        onRequestClose={closeDeclineModal}
      >
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <TouchableOpacity style={styles.confirmCloseBtn} onPress={closeDeclineModal}>
              <Ionicons name="close" size={16} color="#6B7280" />
            </TouchableOpacity>

            <View style={[styles.confirmIconWrap, styles.confirmIconWrapDanger]}>
              <Ionicons name="close" size={22} color="#DC2626" />
            </View>

            <Text style={styles.confirmTitle}>Decline Consultation?</Text>

            <View style={styles.confirmInfoPill}>
              <Text style={styles.confirmInfoText}>
                {(declineTarget?.client?.name || 'Client')}
                {' · '}
                {declineTarget?.scheduled_at ? new Date(declineTarget.scheduled_at).toLocaleString() : 'Scheduled time unavailable'}
              </Text>
            </View>

            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={styles.confirmCancelBtn}
                onPress={closeDeclineModal}
                disabled={!!declineTarget && actioning === Number(declineTarget.id)}
              >
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.confirmDeclineBtn,
                  !!declineTarget && actioning === Number(declineTarget.id) && { opacity: 0.7 },
                ]}
                onPress={submitDeclineRequest}
                disabled={!!declineTarget && actioning === Number(declineTarget.id)}
              >
                {!!declineTarget && actioning === Number(declineTarget.id) ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.confirmAcceptText}>Decline Request</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topSection: {
    zIndex: 2,
    overflow: 'visible',
  },
  notificationReturnBar: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, backgroundColor: Colors.background },
  notificationReturnBtn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#EEF4FF', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  notificationReturnText: { color: Colors.primary, fontSize: 12, fontWeight: '800' },
  pageHero: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 14,
    backgroundColor: Colors.primaryDark,
    borderRadius: 22,
    padding: 18,
  },
  pageEyebrow: { color: '#DCE8FF', fontSize: 11, fontWeight: '800', letterSpacing: 0.4, marginBottom: 8 },
  pageTitle: { color: '#FFFFFF', fontSize: 30, fontWeight: '900' },
  pageSub: { color: '#D7E1F4', fontSize: 13, lineHeight: 18, marginTop: 5 },
  summaryScroller: { flexGrow: 0, marginBottom: 16 },
  tabsScroller: {
    overflow: 'hidden',
  },
  summaryRow: { paddingHorizontal: 16, gap: 10, paddingBottom: 3 },
  summaryCard: {
    width: 172,
    minHeight: 76,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E8EDF5',
    paddingHorizontal: 13,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#102042',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 2,
  },
  summaryCardActive: { borderColor: `${Colors.primary}55`, backgroundColor: '#F8FBFF' },
  summaryIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  summaryCopy: { flex: 1 },
  summaryValue: { color: Colors.primaryDark, fontSize: 21, fontWeight: '900' },
  summaryLabel: { color: Colors.textMuted, fontSize: 12, fontWeight: '800', marginTop: 1 },
  controlsCard: {
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E6ECF3',
    padding: 12,
    position: 'relative',
    zIndex: 10,
    overflow: 'hidden',
    shadowColor: '#102042',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  tabs: {
    gap: 10,
    paddingBottom: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  tab: {
    flexShrink: 0,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#F2F5FA',
    borderWidth: 1,
    borderColor: '#EEF2F7',
  },
  tabActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
    shadowColor: '#091B39',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 3,
  },
  tabText: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, textTransform: 'capitalize', includeFontPadding: false, flexShrink: 1 },
  tabTextActive: { color: '#fff' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFD',
    borderWidth: 1,
    borderColor: '#E5EAF2',
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 48,
  },
  searchInput: { flex: 1, color: Colors.text, fontSize: 13, paddingVertical: 0, minHeight: 20 },
  list: { padding: 16, paddingBottom: 120 },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    padding: 17,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E8EDF5',
    elevation: 2,
    shadowColor: '#102042',
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  cardHighlighted: { borderWidth: 2, borderColor: Colors.info, backgroundColor: '#F7FBFF' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  code: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  badge: { borderRadius: 100, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  clientName: { fontSize: 17, fontWeight: '900', color: Colors.text, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  meta: { fontSize: 13, color: Colors.textMuted, fontWeight: '600' },
  price: { fontSize: 18, fontWeight: '900', color: Colors.success, marginTop: 10, marginBottom: 4 },
  downpaymentChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  docBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: `${Colors.primary}50`, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginTop: 10, alignSelf: 'flex-start', backgroundColor: `${Colors.primary}08` },
  docBtnText: { color: Colors.primary, fontWeight: '700', fontSize: 12 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  declineBtn: {
    flex: 1,
    borderWidth: 1.4,
    borderColor: '#FF8A80',
    borderRadius: 11,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF4F3',
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
  completeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.success, borderRadius: 8, paddingVertical: 10, marginTop: 12 },
  completeBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  confirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 22,
  },
  confirmCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 16,
    position: 'relative',
  },
  confirmCloseBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmIconWrap: {
    alignSelf: 'center',
    width: 54,
    height: 54,
    borderRadius: 10,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  confirmIconWrapDanger: {
    backgroundColor: '#FEE2E2',
  },
  confirmTitle: {
    textAlign: 'center',
    color: '#111827',
    fontWeight: '800',
    fontSize: 32 / 2,
    marginBottom: 12,
  },
  confirmInfoPill: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 14,
  },
  confirmInfoText: {
    textAlign: 'center',
    color: '#374151',
    fontSize: 17 / 2,
    fontWeight: '700',
  },
  confirmActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  confirmCancelBtn: {
    minWidth: 92,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmCancelText: {
    color: '#374151',
    fontWeight: '800',
    fontSize: 14,
  },
  confirmAcceptBtn: {
    minWidth: 136,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmDeclineBtn: {
    minWidth: 136,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmAcceptText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  empty: { flex: 1, alignItems: 'center', paddingTop: 60 },
  emptyText: { color: Colors.textMuted, marginTop: 12, fontSize: 14 },
  listRoot: { flex: 1 },
});
