import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons as IoniconsBase } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { lawFirmApi } from '@/services/api';

const Ionicons = IoniconsBase as any;
const PAGE_SIZE = 8;
const EARNINGS_TIMEOUT_MS = 12000;

function formatCurrency(value: number | string | undefined) {
  return `₱${Number(value ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value?: string | null) {
  if (!value) return 'No date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No date';
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function statusPalette(statusRaw?: string | null) {
  const status = String(statusRaw ?? '').toLowerCase();
  if (status === 'paid') return { bg: '#DCFCE7', text: '#166534', label: 'Paid' };
  if (status === 'downpayment paid' || status === 'downpayment_paid') return { bg: '#DBEAFE', text: '#1D4ED8', label: 'Paid (Down)' };
  if (status === 'pending') return { bg: '#FEF3C7', text: '#B45309', label: 'Awaiting Payment' };
  return { bg: '#E5E7EB', text: '#475569', label: statusRaw || 'Unknown' };
}

function SummaryCard({ icon, iconBg, iconColor, value, label }: { icon: string; iconBg: string; iconColor: string; value: string; label: string }) {
  return (
    <View style={styles.summaryCard}>
      <View style={[styles.summaryIconWrap, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
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

export default function LawFirmEarnings() {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<any>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All statuses');
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: payload } = await loadWithTimeout(lawFirmApi.earnings());
      setData(payload);
      setApiError(null);
    } catch (err: any) {
      setData(null);
      setApiError(String(err?.response?.data?.message ?? err?.message ?? 'Failed to load earnings data.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const recent = useMemo(() => (Array.isArray(data?.recent_payments) ? data.recent_payments : []), [data?.recent_payments]);
  const query = searchQuery.trim().toLowerCase();
  const statusOptions = useMemo(() => {
    const unique = Array.from(new Set(recent.map((item: any) => String(item?.status ?? '').trim()).filter(Boolean))) as string[];
    return ['All statuses', ...unique];
  }, [recent]);

  const filteredRecent = useMemo(() => recent.filter((item: any) => {
    const matchesStatus = statusFilter === 'All statuses' || String(item?.status ?? '') === statusFilter;
    if (!matchesStatus) return false;
    if (!query) return true;

    const haystack = [
      item?.client_name,
      item?.lawyer_name,
      item?.consult_code,
      item?.status,
      item?.date,
      item?.amount,
      item?.gross_amount,
    ]
      .map((value) => String(value ?? '').toLowerCase())
      .join(' ');

    return haystack.includes(query);
  }), [query, recent, statusFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [query, statusFilter, recent.length]);

  const summary = useMemo(() => {
    const now = new Date();
    const thisYear = recent.reduce((sum: number, item: any) => {
      const date = new Date(item?.date ?? '');
      if (Number.isNaN(date.getTime()) || date.getFullYear() !== now.getFullYear()) return sum;
      return sum + Number(item?.amount ?? 0);
    }, 0);
    const activeClients = new Set(recent.map((item: any) => String(item?.client_name ?? '').trim()).filter(Boolean)).size;

    return {
      totalEarned: Number(data?.total_earned ?? 0),
      thisMonth: Number(data?.this_month ?? 0),
      thisYear,
      pending: Number(data?.pending ?? 0),
      activeClients,
    };
  }, [data?.pending, data?.this_month, data?.total_earned, recent]);

  const lawyerBreakdown = useMemo(() => {
    const month = new Date().getMonth();
    const year = new Date().getFullYear();
    const grouped = new Map<string, { lawyerName: string; consultations: Set<string>; thisMonth: number; total: number; transactions: number }>();

    recent.forEach((item: any) => {
      const lawyerName = String(item?.lawyer_name ?? 'Unassigned').trim() || 'Unassigned';
      const current = grouped.get(lawyerName) ?? {
        lawyerName,
        consultations: new Set<string>(),
        thisMonth: 0,
        total: 0,
        transactions: 0,
      };

      current.total += Number(item?.amount ?? 0);
      current.transactions += 1;
      if (item?.consult_code) current.consultations.add(String(item.consult_code));

      const date = new Date(item?.date ?? '');
      if (!Number.isNaN(date.getTime()) && date.getMonth() === month && date.getFullYear() === year) {
        current.thisMonth += Number(item?.amount ?? 0);
      }

      grouped.set(lawyerName, current);
    });

    return Array.from(grouped.values())
      .map((entry) => ({
        lawyerName: entry.lawyerName,
        consultations: entry.consultations.size || entry.transactions,
        thisMonth: entry.thisMonth,
        total: entry.total,
        averageCut: entry.transactions ? entry.total / entry.transactions : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [recent]);

  const totalResults = filteredRecent.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = totalResults === 0 ? 0 : (safePage - 1) * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE, totalResults);
  const paginatedRecent = filteredRecent.slice(startIndex, endIndex);
  const visiblePages = useMemo(() => {
    const pages: number[] = [];
    const maxVisible = 4;
    let start = Math.max(1, safePage - 1);
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) start = Math.max(1, end - maxVisible + 1);
    for (let page = start; page <= end; page += 1) pages.push(page);
    return pages;
  }, [safePage, totalPages]);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#243A67" /></View>;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 88 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient colors={['#0C2757', '#123A74', '#1B5A99']} style={styles.hero}>
          <Text style={styles.heroLabel}>Firm Earnings</Text>
          <Text style={styles.heroValue}>{formatCurrency(summary.totalEarned)}</Text>
          <Text style={styles.heroSubtext}>Track your firm share retained from team consultations.</Text>
        </LinearGradient>

        {apiError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Sync Issue Detected</Text>
            <Text style={styles.errorLine}>{apiError}</Text>
          </View>
        ) : null}

        <View style={styles.summaryGrid}>
          <SummaryCard icon="cash-outline" iconBg="#F3E8FF" iconColor="#9333EA" value={formatCurrency(summary.totalEarned)} label="Total Firm Cut" />
          <SummaryCard icon="calendar-outline" iconBg="#DBEAFE" iconColor="#2563EB" value={formatCurrency(summary.thisMonth)} label="This Month" />
          <SummaryCard icon="today-outline" iconBg="#EDE9FE" iconColor="#7C3AED" value={formatCurrency(summary.thisYear)} label="This Year" />
          <SummaryCard icon="hourglass-outline" iconBg="#FEF3C7" iconColor="#D97706" value={formatCurrency(summary.pending)} label="Expected Pending" />
          <SummaryCard icon="people-outline" iconBg="#DCFCE7" iconColor="#166534" value={String(summary.activeClients)} label="Active Clients" />
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Per-Lawyer Breakdown</Text>
            <Text style={styles.sectionMeta}>Sorted by total firm cut</Text>
          </View>
          {lawyerBreakdown.length === 0 ? (
            <Text style={styles.empty}>No lawyer earnings available yet.</Text>
          ) : lawyerBreakdown.slice(0, 6).map((item, index) => (
            <View key={`${item.lawyerName}-${index}`} style={[styles.breakdownRow, index > 0 && styles.rowDivider]}>
              <View style={styles.breakdownIdentity}>
                <View style={styles.breakdownAvatar}>
                  <Text style={styles.breakdownAvatarText}>{String(item.lawyerName).charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.breakdownName}>{item.lawyerName}</Text>
                  <Text style={styles.breakdownMeta}>{item.consultations} consultations</Text>
                </View>
              </View>
              <View style={styles.breakdownNumbers}>
                <Text style={styles.breakdownValue}>{formatCurrency(item.total)}</Text>
                <Text style={styles.breakdownSubvalue}>This month {formatCurrency(item.thisMonth)}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>All Transactions</Text>
            <Text style={styles.sectionMeta}>{totalResults} results</Text>
          </View>

          <View style={styles.searchRow}>
            <Ionicons name="search" size={16} color="#8797AA" />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Client, lawyer, or consultation code"
              placeholderTextColor="#91A0B1"
            />
            {searchQuery.trim().length ? (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color="#91A0B1" />
              </TouchableOpacity>
            ) : null}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            {statusOptions.map((option) => {
              const active = statusFilter === option;
              return (
                <TouchableOpacity key={option} style={[styles.chip, active && styles.chipActive]} onPress={() => setStatusFilter(option)}>
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{option}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {paginatedRecent.length === 0 ? (
            <Text style={styles.empty}>{query ? 'No matching transactions found.' : 'No transactions yet.'}</Text>
          ) : paginatedRecent.map((item: any, index: number) => {
            const palette = statusPalette(item?.status);
            return (
              <View key={String(item?.id ?? index)} style={[styles.transactionCard, index > 0 && styles.transactionSpacing]}>
                <View style={styles.transactionTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.transactionClient}>{item?.client_name ?? 'Client'}</Text>
                    <Text style={styles.transactionLawyer}>{item?.lawyer_name ?? 'No lawyer assigned'}</Text>
                  </View>
                  <Text style={styles.transactionAmount}>{formatCurrency(item?.gross_amount ?? item?.amount ?? 0)}</Text>
                </View>

                <View style={styles.transactionMetaRow}>
                  <Text style={styles.transactionCode}>{item?.consult_code ?? 'No consultation code'}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: palette.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: palette.text }]}>{palette.label}</Text>
                  </View>
                </View>

                <View style={styles.transactionFooter}>
                  <Text style={styles.transactionDate}>{formatDate(item?.date)}</Text>
                  <Text style={styles.transactionCut}>Firm cut {formatCurrency(item?.amount ?? 0)}</Text>
                </View>
              </View>
            );
          })}

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

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.pageNumbersScroll}
                  contentContainerStyle={styles.pageNumbers}
                >
                  {visiblePages.map((page) => {
                    const active = page === safePage;
                    return (
                      <TouchableOpacity key={page} style={[styles.pageNumBtn, active && styles.pageNumBtnActive]} onPress={() => setCurrentPage(page)}>
                        <Text style={[styles.pageNumText, active && styles.pageNumTextActive]}>{page}</Text>
                      </TouchableOpacity>
                    );
                  })}
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
  container: { flex: 1, backgroundColor: '#EEF3F8' },
  content: { paddingHorizontal: 16, paddingBottom: 24 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#EEF3F8' },
  hero: { borderRadius: 24, padding: 20, marginTop: 6, marginBottom: 14 },
  heroLabel: { color: '#DCEBFF', fontSize: 14, fontWeight: '800' },
  heroValue: { color: '#FFFFFF', fontSize: 32, fontWeight: '900', marginTop: 8 },
  heroSubtext: { color: '#DCEBFF', marginTop: 8, lineHeight: 20 },
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
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  summaryCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E1E9F3',
  },
  summaryIconWrap: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  summaryValue: { color: '#17305B', fontWeight: '900', fontSize: 18 },
  summaryLabel: { color: '#66788E', fontSize: 13, marginTop: 4 },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E1E9F3',
    padding: 16,
    marginBottom: 14,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14 },
  sectionTitle: { color: '#17305B', fontSize: 18, fontWeight: '900' },
  sectionMeta: { color: '#7B8A9C', fontSize: 12 },
  empty: { color: '#7B8A9C', fontSize: 14, textAlign: 'center', paddingVertical: 18 },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 12 },
  rowDivider: { borderTopWidth: 1, borderTopColor: '#EDF2F7' },
  breakdownIdentity: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  breakdownAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#17305B', alignItems: 'center', justifyContent: 'center' },
  breakdownAvatarText: { color: '#FFFFFF', fontWeight: '900' },
  breakdownName: { color: '#17305B', fontWeight: '800', fontSize: 15 },
  breakdownMeta: { color: '#7B8A9C', fontSize: 12, marginTop: 2 },
  breakdownNumbers: { alignItems: 'flex-end' },
  breakdownValue: { color: '#17305B', fontWeight: '900', fontSize: 14 },
  breakdownSubvalue: { color: '#2563EB', fontSize: 12, marginTop: 2 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FBFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DCE7F2',
    paddingHorizontal: 12,
    height: 48,
    marginBottom: 12,
  },
  searchInput: { flex: 1, color: '#17305B', fontSize: 14 },
  chipsRow: { gap: 8, paddingBottom: 12 },
  chip: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: '#EFF4FA' },
  chipActive: { backgroundColor: '#243A67' },
  chipText: { color: '#5F7288', fontWeight: '700', fontSize: 12 },
  chipTextActive: { color: '#FFFFFF' },
  transactionCard: { backgroundColor: '#F8FBFF', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#E1E9F3' },
  transactionSpacing: { marginTop: 10 },
  transactionTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' },
  transactionClient: { color: '#17305B', fontWeight: '900', fontSize: 15 },
  transactionLawyer: { color: '#60748A', fontSize: 13, marginTop: 3 },
  transactionAmount: { color: '#111827', fontWeight: '900', fontSize: 15 },
  transactionMetaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginTop: 10 },
  transactionCode: { color: '#45617C', fontSize: 12, flex: 1 },
  statusBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  statusBadgeText: { fontSize: 11, fontWeight: '800' },
  transactionFooter: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginTop: 12 },
  transactionDate: { color: '#7B8A9C', fontSize: 12 },
  transactionCut: { color: '#243A67', fontSize: 12, fontWeight: '800' },
  paginationWrap: { marginTop: 16 },
  paginationSummary: { color: '#6B7E93', fontSize: 12, marginBottom: 10 },
  paginationRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  pageNumbersScroll: { flex: 1 },
  pageNavBtn: { paddingHorizontal: 12, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF4FA' },
  pageNavBtnDisabled: { opacity: 0.45 },
  pageNavText: { color: '#243A67', fontWeight: '800', fontSize: 12 },
  pageNavTextDisabled: { color: '#94A3B8' },
  pageNumbers: { flexDirection: 'row', gap: 8, paddingHorizontal: 2 },
  pageNumBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF4FA' },
  pageNumBtnActive: { backgroundColor: '#243A67' },
  pageNumText: { color: '#243A67', fontWeight: '800', fontSize: 12 },
  pageNumTextActive: { color: '#FFFFFF' },
});
