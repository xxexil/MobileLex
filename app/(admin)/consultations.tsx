import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RoleColors } from '@/constants/theme';
import { formatPhp } from '@/constants/currency';
import { adminApi } from '@/services/api';
import { PageHeader, Stat, styles } from './all-users';

function normalize(payload: any) {
  const list = payload?.consultations ?? payload?.recent_consultations ?? payload?.recentConsultations ?? payload?.data ?? [];
  return Array.isArray(list) ? list : [];
}

function statusTone(statusRaw: unknown) {
  const status = String(statusRaw ?? '').toLowerCase();
  if (status.includes('cancel')) return { label: 'Cancelled', bg: '#FEE2E2', text: '#B91C1C', border: '#EF4444' };
  if (status.includes('complete')) return { label: 'Completed', bg: '#D1FAE5', text: '#047857', border: '#10B981' };
  if (status.includes('upcoming')) return { label: 'Upcoming', bg: '#DBEAFE', text: '#1D4ED8', border: '#3B82F6' };
  return { label: statusRaw ? String(statusRaw) : 'Pending', bg: '#FEF3C7', text: '#B45309', border: '#F59E0B' };
}

export default function AdminConsultationsScreen() {
  const [payload, setPayload] = useState<any>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await adminApi.consultations();
      setPayload(data);
    } catch {
      setPayload(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const consultations = useMemo(() => {
    const term = query.trim().toLowerCase();
    return normalize(payload).filter((item: any) => {
      const haystack = [
        item?.code,
        item?.consultation_code,
        item?.consult_code,
        item?.client?.name,
        item?.client_name,
        item?.lawyer?.name,
        item?.lawyer_name,
        item?.status,
        item?.type,
      ].join(' ').toLowerCase();
      return !term || haystack.includes(term);
    });
  }, [payload, query]);

  const summary = useMemo(() => {
    const stats = payload?.stats ?? {};
    const totalRevenue = Number(payload?.summary?.total_revenue ?? stats.total_revenue ?? consultations.reduce((sum: number, item: any) => sum + Number(item?.price ?? item?.amount ?? item?.fee ?? 0), 0));
    return {
      revenue: totalRevenue,
      pending: payload?.summary?.pending ?? stats.pending_consultations ?? consultations.filter((item: any) => String(item?.status ?? '').toLowerCase().includes('pending')).length,
      upcoming: payload?.summary?.upcoming ?? stats.upcoming_consultations ?? consultations.filter((item: any) => String(item?.status ?? '').toLowerCase().includes('upcoming')).length,
      completed: payload?.summary?.completed ?? stats.completed_consultations ?? consultations.filter((item: any) => String(item?.status ?? '').toLowerCase().includes('complete')).length,
      cancelled: payload?.summary?.cancelled ?? stats.cancelled_consultations ?? consultations.filter((item: any) => String(item?.status ?? '').toLowerCase().includes('cancel')).length,
    };
  }, [consultations, payload]);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={RoleColors.admin.accent} /></View>;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
      <PageHeader title="Consultations" />
      <View style={local.statsGrid}>
        <Stat value={formatPhp(summary.revenue)} label="Total Revenue" icon="cash" color={RoleColors.admin.accent} />
        <Stat value={summary.pending} label="Pending" icon="hourglass" color="#D97706" />
        <Stat value={summary.upcoming} label="Upcoming" icon="calendar" color="#3B82F6" />
        <Stat value={summary.completed} label="Completed" icon="checkmark-circle" color="#10B981" />
        <Stat value={summary.cancelled} label="Cancelled" icon="close-circle" color="#EF4444" />
      </View>
      <View style={styles.filterCard}>
        <TextInput style={styles.searchInput} value={query} onChangeText={setQuery} placeholder="Search code, client, or lawyer..." placeholderTextColor="#7A8497" />
        <TouchableOpacity style={styles.filterBtn} activeOpacity={0.85}><Ionicons name="search" size={17} color="#fff" /><Text style={styles.filterText}>Filter</Text></TouchableOpacity>
      </View>
      {consultations.length === 0 ? <View style={styles.tableCard}><Text style={styles.empty}>No consultations found.</Text></View> : consultations.map((item: any, index: number) => {
        const tone = statusTone(item?.status);
        const code = item?.code ?? item?.consultation_code ?? item?.consult_code ?? `CONS-${String(item?.id ?? index).padStart(6, '0')}`;
        const client = item?.client?.name ?? item?.client_name ?? 'Client';
        const lawyer = item?.lawyer?.name ?? item?.lawyer_name ?? 'Lawyer';
        const scheduled = item?.scheduled_at ?? item?.date ?? item?.created_at;
        return (
          <View key={String(item?.id ?? code ?? index)} style={[local.consultCard, { borderLeftColor: tone.border }]}>
            <View style={local.pillRow}>
              <View style={local.codePill}><Text style={local.codeText}>{code}</Text></View>
              <View style={[local.statusPill, { backgroundColor: tone.bg }]}><Text style={[local.statusText, { color: tone.text }]}>{tone.label}</Text></View>
              <View style={local.typePill}><Ionicons name="videocam" size={13} color={RoleColors.admin.shell} /><Text style={local.typeText}>{item?.type ?? 'Video'}</Text></View>
            </View>
            <View style={local.peopleGrid}>
              <View style={{ flex: 1 }}>
                <Text style={local.label}>Client</Text>
                <Text style={local.person}>{client}</Text>
                <Text style={local.email}>{item?.client?.email ?? item?.client_email ?? 'No email'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={local.label}>Lawyer</Text>
                <Text style={local.person}>{lawyer}</Text>
                <Text style={local.email}>{item?.lawyer?.email ?? item?.lawyer_email ?? 'No email'}</Text>
              </View>
            </View>
            <View style={local.footer}>
              <Footer icon="calendar" text={scheduled ? new Date(scheduled).toLocaleDateString('en-PH', { month: 'short', day: '2-digit', year: 'numeric' }) : 'No date'} />
              <Footer icon="time" text={scheduled ? new Date(scheduled).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }) : 'No time'} />
              <Footer icon="hourglass" text={item?.duration ? `${item.duration} min` : '1 hour'} />
              <Footer icon="cash" text={formatPhp(Number(item?.price ?? item?.amount ?? item?.fee ?? 0))} />
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

function Footer({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={local.footerItem}>
      <Ionicons name={icon} size={13} color="#98A2B3" />
      <Text style={local.footerText}>{text}</Text>
    </View>
  );
}

const local = StyleSheet.create({
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  consultCard: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderLeftWidth: 4, borderColor: '#E8EDF5', padding: 16, marginBottom: 12 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  codePill: { backgroundColor: '#F3F4F6', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  codeText: { color: RoleColors.admin.shell, fontWeight: '900', fontSize: 12 },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  statusText: { fontWeight: '900', fontSize: 12 },
  typePill: { backgroundColor: '#F3F4F6', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 5 },
  typeText: { color: RoleColors.admin.shell, fontWeight: '900', fontSize: 12 },
  peopleGrid: { flexDirection: 'row', gap: 16, marginTop: 16 },
  label: { color: '#98A2B3', fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  person: { color: RoleColors.admin.shell, fontSize: 15, fontWeight: '900', marginTop: 6 },
  email: { color: '#8A94A6', fontSize: 12, marginTop: 4 },
  footer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 15 },
  footerItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  footerText: { color: '#667085', fontSize: 12, fontWeight: '700' },
});
