import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { Ionicons as IoniconsBase } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { lawyerApi } from '@/services/api';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import {
  createReverbEcho,
  isReverbConfigured,
  subscribeUserPaymentEvents,
} from '@/services/realtime';

const Ionicons = IoniconsBase as any;
const PAGE_SIZE = 10;
const EARNINGS_TIMEOUT_MS = 12000;

type PaymentItem = {
  id: number;
  amount: number;
  gross_amount?: number;
  firm_cut?: number;
  type?: string;
  status?: string;
  date?: string;
  client_name?: string;
  consult_code?: string;
};

function PageButton({
  page,
  currentPage,
  onPress,
}: {
  page: number;
  currentPage: number;
  onPress: (page: number) => void;
}) {
  const active = page === currentPage;
  return (
    <TouchableOpacity style={[styles.pageNumBtn, active && styles.pageNumBtnActive]} onPress={() => onPress(page)}>
      <Text style={[styles.pageNumText, active && styles.pageNumTextActive]}>{page}</Text>
    </TouchableOpacity>
  );
}

function formatCurrency(value: number | string | undefined) {
  return `P${Number(value ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatCurrencyPrecise(value: number | string | undefined) {
  return `P${Number(value ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getPaymentTypeLabel(type?: string) {
  const map: Record<string, string> = {
    downpayment: 'Downpayment 50%',
    balance: 'Balance 50%',
    full: 'Full',
  };
  return map[String(type ?? '')] ?? String(type ?? 'Full');
}

function getStatusLabel(status?: string) {
  if (status === 'downpayment_paid') return 'Paid (Down)';
  return String(status ?? '').replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function getStatusColors(status?: string) {
  if (status === 'paid') return { bg: '#DCFCE7', text: '#166534' };
  if (status === 'downpayment_paid') return { bg: '#DBEAFE', text: '#1D4ED8' };
  return { bg: '#FEF3C7', text: '#B45309' };
}

function StatCard({
  icon,
  iconBg,
  iconColor,
  value,
  label,
}: {
  icon: string;
  iconBg: string;
  iconColor: string;
  value: string;
  label: string;
}) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIconWrap, { backgroundColor: iconBg }]}> 
        <Ionicons name={icon} size={22} color={iconColor} />
      </View>
      <View style={styles.statCopy}>
        <Text style={styles.statNumber}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
    </View>
  );
}

function loadWithTimeout(promise: Promise<any>, timeoutMs = EARNINGS_TIMEOUT_MS): Promise<any> {
  return new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Earnings took too long to load. Please try again.'));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export default function LawyerEarnings() {
  const { user, token } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);

  const load = useCallback(async () => {
    try {
      const { data: res } = await loadWithTimeout(lawyerApi.earnings());
      setData(res);
    } catch {
      setData(null);
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
    if (!user?.id || !token || !isReverbConfigured()) return;

    const echo = createReverbEcho(token);
    const refresh = () => load();
    const unsubscribePayments = subscribeUserPaymentEvents(echo, user.id, refresh);

    return () => {
      unsubscribePayments();
      echo.disconnect();
    };
  }, [load, token, user?.id]);

  const payments = useMemo<PaymentItem[]>(() => {
    return Array.isArray(data?.recent_payments) ? data.recent_payments : [];
  }, [data?.recent_payments]);

  const query = searchQuery.trim().toLowerCase();

  const filteredPayments = useMemo(() => {
    return payments.filter((item) => {
      const matchesStatus = statusFilter === 'All' || String(item?.status ?? '') === statusFilter;
      const matchesType = typeFilter === 'All' || String(item?.type ?? '') === typeFilter;
      if (!matchesStatus || !matchesType) return false;
      if (!query) return true;

      const searchable = [
        item?.client_name,
        item?.consult_code,
        item?.status,
        item?.type,
        item?.date,
        item?.amount,
        item?.gross_amount,
        item?.firm_cut,
      ]
        .map((value) => String(value ?? '').toLowerCase())
        .join(' ');

      return searchable.includes(query);
    });
  }, [payments, query, statusFilter, typeFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [query, statusFilter, typeFilter, payments.length]);

  const totalResults = filteredPayments.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = totalResults === 0 ? 0 : (safePage - 1) * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE, totalResults);
  const paginatedPayments = filteredPayments.slice(startIndex, endIndex);
  const totalTransactions = Number(data?.total_transactions ?? payments.length ?? 0);
  const totalClients = Number(data?.total_clients ?? 0);

  const visiblePages = useMemo(() => {
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, safePage - 2);
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) start = Math.max(1, end - maxVisible + 1);
    for (let page = start; page <= end; page += 1) pages.push(page);
    return pages;
  }, [safePage, totalPages]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>;
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[Colors.primary]} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.pageHeader}>
          <View>
            <Text style={styles.pageEyebrow}>LAWYER WALLET</Text>
            <Text style={styles.pageTitle}>Earnings</Text>
            <Text style={styles.pageSub}>Payment history and earnings summary</Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statsScroller} contentContainerStyle={styles.statsGrid}>
          <StatCard
            icon="logo-usd"
            iconBg="#F3E8FF"
            iconColor="#9333EA"
            value={formatCurrency(data?.total_earned)}
            label="Total Earned"
          />
          <StatCard
            icon="calendar-outline"
            iconBg="#DBEAFE"
            iconColor="#2563EB"
            value={formatCurrency(data?.this_month)}
            label="This Month"
          />
          <StatCard
            icon="hourglass-outline"
            iconBg="#FEF3C7"
            iconColor="#D97706"
            value={formatCurrency(data?.pending)}
            label="Pending"
          />
          <StatCard
            icon="people-outline"
            iconBg="#DCFCE7"
            iconColor="#166534"
            value={String(totalClients)}
            label="Clients Paid"
          />
          {Number(data?.firm_cut_total ?? 0) > 0 ? (
            <StatCard
              icon="business-outline"
              iconBg="#FEF3C7"
              iconColor="#D97706"
              value={formatCurrency(data?.firm_cut_total)}
              label="Firm Cut"
            />
          ) : null}
        </ScrollView>

        <View style={styles.tableCard}>
          <View style={styles.tableHeader}>
            <View style={styles.tableTitleRow}>
              <Ionicons name="list-outline" size={16} color={Colors.primaryDark} />
              <Text style={styles.tableTitle}>Transaction History</Text>
            </View>
          </View>

          <View style={styles.filtersWrap}>
            <View style={styles.searchBox}>
              <View style={styles.searchRow}>
                <Ionicons name="search" size={16} color={Colors.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Client or consultation code"
                  placeholderTextColor={Colors.textLight}
                  autoCapitalize="none"
                />
                {searchQuery.trim() ? (
                  <TouchableOpacity onPress={() => setSearchQuery('')}>
                    <Ionicons name="close-circle" size={18} color={Colors.textLight} />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>

            <Text style={styles.filterLabel}>Status</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {([
                ['All statuses', 'All'],
                ['Pending', 'pending'],
                ['Paid', 'paid'],
                ['Paid (Down)', 'downpayment_paid'],
              ] as [string, string][]).map(([label, value]) => {
                const active = statusFilter === value;
                return (
                  <TouchableOpacity key={value} style={[styles.filterChip, active && styles.filterChipActive]} onPress={() => setStatusFilter(value)}>
                    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Text style={styles.filterLabel}>Payment type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {([
                ['All types', 'All'],
                ['Downpayment 50%', 'downpayment'],
                ['Balance 50%', 'balance'],
                ['Full', 'full'],
              ] as [string, string][]).map(([label, value]) => {
                const active = typeFilter === value;
                return (
                  <TouchableOpacity key={value} style={[styles.filterChip, active && styles.filterChipActive]} onPress={() => setTypeFilter(value)}>
                    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {(searchQuery || statusFilter !== 'All' || typeFilter !== 'All') ? (
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={() => {
                  setSearchQuery('');
                  setStatusFilter('All');
                  setTypeFilter('All');
                }}
              >
                <Text style={styles.clearBtnText}>Clear</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.resultsHeader}>
            <Text style={styles.resultsText}>{totalTransactions} total</Text>
          </View>

          {paginatedPayments.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="cash-outline" size={40} color={Colors.textLight} />
              <Text style={styles.emptyText}>{query ? 'No matching transactions.' : 'No transactions yet'}</Text>
            </View>
          ) : (
            <View style={styles.rowsWrap}>
              {paginatedPayments.map((item) => {
                const statusColors = getStatusColors(item.status);
                return (
                  <View key={String(item.id)} style={styles.paymentRow}>
                    <View style={styles.paymentTop}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.paymentClient}>{item.client_name ?? 'Client'}</Text>
                        <Text style={styles.paymentCode}>{item.consult_code ?? '-'}</Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: statusColors.bg }]}>
                        <Text style={[styles.statusBadgeText, { color: statusColors.text }]}>{getStatusLabel(item.status)}</Text>
                      </View>
                    </View>

                    <View style={styles.metaGrid}>
                      <View style={styles.metaItem}>
                        <Text style={styles.metaLabel}>Date</Text>
                        <Text style={styles.metaValue}>{item.date ?? '-'}</Text>
                      </View>
                      <View style={styles.metaItem}>
                        <Text style={styles.metaLabel}>Payment Type</Text>
                        <Text style={styles.metaValue}>{getPaymentTypeLabel(item.type)}</Text>
                      </View>
                      <View style={styles.metaItem}>
                        <Text style={styles.metaLabel}>Amount</Text>
                        <Text style={styles.amountValue}>{formatCurrencyPrecise(item.gross_amount ?? item.amount)}</Text>
                      </View>
                      <View style={styles.metaItem}>
                        <Text style={styles.metaLabel}>Firm Cut</Text>
                        <Text style={styles.firmCutValue}>
                          {Number(item.firm_cut ?? 0) > 0 ? formatCurrencyPrecise(item.firm_cut) : '-'}
                        </Text>
                      </View>
                      <View style={styles.metaItem}>
                        <Text style={styles.metaLabel}>Your Net</Text>
                        <Text style={styles.netValue}>{formatCurrencyPrecise(item.amount)}</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {totalResults > 0 ? (
            <View style={styles.paginationWrap}>
              <Text style={styles.paginationSummary}>Showing {startIndex + 1} to {endIndex} of {totalResults} results</Text>
              <View style={styles.paginationRow}>
                <TouchableOpacity
                  style={[styles.pageNavBtn, safePage === 1 && styles.pageNavBtnDisabled]}
                  disabled={safePage === 1}
                  onPress={() => setCurrentPage((page) => Math.max(1, page - 1))}
                >
                  <Text style={[styles.pageNavText, safePage === 1 && styles.pageNavTextDisabled]}>Previous</Text>
                </TouchableOpacity>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pageNumberScroller} contentContainerStyle={styles.pageNumberRow}>
                  {visiblePages[0] > 1 ? (
                    <>
                      <PageButton page={1} currentPage={safePage} onPress={setCurrentPage} />
                      {visiblePages[0] > 2 ? <Text style={styles.pageDots}>...</Text> : null}
                    </>
                  ) : null}
                  {visiblePages.map((page) => (
                    <PageButton key={page} page={page} currentPage={safePage} onPress={setCurrentPage} />
                  ))}
                  {visiblePages[visiblePages.length - 1] < totalPages ? (
                    <>
                      {visiblePages[visiblePages.length - 1] < totalPages - 1 ? <Text style={styles.pageDots}>...</Text> : null}
                      <PageButton page={totalPages} currentPage={safePage} onPress={setCurrentPage} />
                    </>
                  ) : null}
                </ScrollView>

                <TouchableOpacity
                  style={[styles.pageNavBtn, safePage === totalPages && styles.pageNavBtnDisabled]}
                  disabled={safePage === totalPages}
                  onPress={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                >
                  <Text style={[styles.pageNavText, safePage === totalPages && styles.pageNavTextDisabled]}>Next</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, paddingBottom: 120 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  pageHeader: {
    backgroundColor: Colors.primaryDark,
    borderRadius: 22,
    padding: 18,
    marginBottom: 16,
    minHeight: 150,
    justifyContent: 'space-between',
  },
  pageEyebrow: { color: '#DCE8FF', fontSize: 11, fontWeight: '800', letterSpacing: 0.4, marginBottom: 8 },
  pageTitle: { fontSize: 30, fontWeight: '900', color: '#FFFFFF' },
  pageSub: { fontSize: 13, color: '#D7E1F4', marginTop: 5, lineHeight: 18 },
  statsScroller: { flexGrow: 0, marginHorizontal: -16, marginBottom: 16 },
  statsGrid: { paddingHorizontal: 16, gap: 12, paddingBottom: 3 },
  statCard: {
    width: 236,
    minHeight: 104,
    backgroundColor: Colors.card,
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EEF2F7',
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
  statCopy: { flex: 1 },
  statNumber: { fontSize: 24, fontWeight: '900', color: Colors.primaryDark },
  statLabel: { fontSize: 13, color: Colors.textMuted, marginTop: 3, fontWeight: '800' },

  tableCard: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#EEF2F7',
    padding: 14,
    shadowColor: '#102042',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  tableHeader: { marginBottom: 14 },
  tableTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tableTitle: { fontSize: 16, fontWeight: '800', color: Colors.primaryDark },

  filtersWrap: { gap: 9, marginBottom: 12 },
  filterLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: '900', marginTop: 2 },
  searchBox: { marginBottom: 4 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: '#FAFBFD',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.text },
  filterRow: { gap: 8, paddingRight: 4 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#FAFBFD',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: { backgroundColor: Colors.primaryDark, borderColor: Colors.primaryDark },
  filterChipText: { fontSize: 12, fontWeight: '600', color: Colors.textMuted },
  filterChipTextActive: { color: '#fff' },
  clearBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  clearBtnText: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  resultsHeader: {
    borderTopWidth: 1,
    borderTopColor: '#EEF2F7',
    paddingTop: 12,
    marginBottom: 6,
  },
  resultsText: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },

  rowsWrap: { gap: 10 },
  paymentRow: {
    borderWidth: 1,
    borderColor: '#EEF2F7',
    borderRadius: 18,
    padding: 14,
    backgroundColor: '#FCFDFE',
  },
  paymentTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  paymentClient: { fontSize: 15, fontWeight: '800', color: Colors.primaryDark },
  paymentCode: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  statusBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metaItem: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  metaLabel: { fontSize: 10, fontWeight: '900', color: Colors.textLight, marginBottom: 5, textTransform: 'uppercase' },
  metaValue: { fontSize: 13, color: Colors.text, fontWeight: '700' },
  amountValue: { fontSize: 14, color: Colors.primaryDark, fontWeight: '900' },
  firmCutValue: { fontSize: 14, color: '#D97706', fontWeight: '900' },
  netValue: { fontSize: 14, color: '#166534', fontWeight: '900' },

  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: Colors.textMuted, marginTop: 8, textAlign: 'center' },

  paginationWrap: { marginTop: 16 },
  paginationSummary: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', marginBottom: 8 },
  paginationRow: { flexDirection: 'row', alignItems: 'center' },
  pageNavBtn: {
    flexShrink: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pageNavBtnDisabled: { opacity: 0.4 },
  pageNavText: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  pageNavTextDisabled: { color: Colors.textMuted },
  pageNumberScroller: { flex: 1 },
  pageNumberRow: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  pageNumBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pageNumBtnActive: { backgroundColor: Colors.primaryDark, borderColor: Colors.primaryDark },
  pageNumText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  pageNumTextActive: { color: '#fff' },
  pageDots: { fontSize: 13, color: Colors.textMuted, paddingHorizontal: 4, alignSelf: 'center' },
});
