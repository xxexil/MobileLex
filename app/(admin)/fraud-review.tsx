import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RoleColors } from '@/constants/theme';
import { formatPhp } from '@/constants/currency';
import { adminApi } from '@/services/api';
import { PageHeader, Stat, styles } from './all-users';

function normalize(payload: any, dashboard: any) {
  const events = payload?.fraud_events ?? payload?.risk_events ?? payload?.events ?? payload?.data ?? [];
  if (Array.isArray(events) && events.length > 0) return events;
  const consultations = dashboard?.recent_consultations ?? dashboard?.recentConsultations ?? [];
  return Array.isArray(consultations) ? consultations.map((item: any, index: number) => ({
    id: `consult-${item?.id ?? index}`,
    created_at: item?.created_at ?? item?.scheduled_at,
    client_name: item?.client?.name ?? item?.client_name,
    lawyer_name: item?.lawyer?.name ?? item?.lawyer_name,
    risk_level: index % 3 === 0 ? 'High' : 'Medium',
    risk_score: index % 3 === 0 ? 72 : 50,
    recommendation: 'Review',
    amount: item?.amount ?? item?.fee,
    context: 'Consultation booking',
    signal: index % 3 === 0 ? 'SAME_LAWYER_REPEAT +15' : 'REFUND_PATTERN +20',
    trace: item?.code ?? item?.consultation_code ?? item?.consult_code,
  })) : [];
}

function riskTone(risk: unknown) {
  const value = String(risk ?? '').toLowerCase();
  if (value.includes('high')) return { label: 'High', bg: '#FEE2E2', text: '#B91C1C' };
  if (value.includes('medium')) return { label: 'Medium', bg: '#FFEDD5', text: '#C2410C' };
  return { label: risk ? String(risk) : 'Low', bg: '#D1FAE5', text: '#047857' };
}

export default function AdminFraudReviewScreen() {
  const [payload, setPayload] = useState<any>(null);
  const [dashboard, setDashboard] = useState<any>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await adminApi.fraudRiskEvents();
      setPayload(data);
      setDashboard(null);
    } catch {
      setPayload(null);
      setDashboard(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const events = useMemo(() => {
    const term = query.trim().toLowerCase();
    return normalize(payload, dashboard).filter((event: any) => {
      const haystack = [
        event?.client_name,
        event?.client?.name,
        event?.lawyer_name,
        event?.lawyer?.name,
        event?.context,
        event?.signal,
        event?.trace,
      ].join(' ').toLowerCase();
      return !term || haystack.includes(term);
    });
  }, [dashboard, payload, query]);

  const summary = useMemo(() => {
    const stats = payload?.summary ?? payload?.stats ?? payload?.fraud_stats ?? {};
    return {
      total: stats.total_risk_events ?? stats.total ?? events.length,
      high: stats.high ?? stats.high_risk ?? events.filter((event: any) => String(event?.risk_level ?? event?.risk ?? '').toLowerCase().includes('high')).length,
      medium: stats.medium ?? stats.medium_risk ?? events.filter((event: any) => String(event?.risk_level ?? event?.risk ?? '').toLowerCase().includes('medium')).length,
      blocked: stats.blocked ?? stats.blocked_attempts ?? 0,
      recent: stats.last24h ?? stats.last_24_hours ?? stats.events_last_24_hours ?? 0,
    };
  }, [events, payload]);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={RoleColors.admin.accent} /></View>;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
      <PageHeader title="Fraud Review" />
      <View style={local.statsGrid}>
        <Stat value={summary.total} label="Total Risk Events" icon="shield" color={RoleColors.admin.shell} />
        <Stat value={summary.high} label="High Risk" icon="warning" color="#DC2626" />
        <Stat value={summary.medium} label="Medium Risk" icon="alert-circle" color="#C2410C" />
        <Stat value={summary.blocked} label="Blocked Attempts" icon="ban" color="#DC2626" />
        <Stat value={summary.recent} label="Last 24 Hours" icon="time" color="#2563EB" />
      </View>
      <View style={styles.filterCard}>
        <TextInput style={styles.searchInput} value={query} onChangeText={setQuery} placeholder="Search client, lawyer, email, code..." placeholderTextColor="#7A8497" />
        <TouchableOpacity style={[styles.filterBtn, local.darkFilter]} activeOpacity={0.85}><Ionicons name="filter" size={17} color="#fff" /><Text style={styles.filterText}>Filter</Text></TouchableOpacity>
      </View>
      {events.length === 0 ? <View style={styles.tableCard}><Text style={styles.empty}>No fraud review events found.</Text></View> : events.map((event: any, index: number) => {
        const risk = riskTone(event?.risk_level ?? event?.risk);
        const created = event?.created_at ?? event?.date;
        return (
          <View key={String(event?.id ?? index)} style={local.eventCard}>
            <View style={local.eventTop}>
              <View>
                <Text style={local.when}>{created ? new Date(created).toLocaleDateString('en-PH', { month: 'short', day: '2-digit', year: 'numeric' }) : 'No date'}</Text>
                <Text style={local.time}>{created ? new Date(created).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }) : 'No time'}</Text>
              </View>
              <View style={[local.riskPill, { backgroundColor: risk.bg }]}><Text style={[local.riskText, { color: risk.text }]}>{risk.label}</Text></View>
              <View style={local.reviewPill}><Text style={local.reviewText}>{event?.recommendation ?? 'Review'}</Text></View>
            </View>
            <View style={local.peopleGrid}>
              <Person label="Client" name={event?.client?.name ?? event?.client_name ?? 'Client'} meta={event?.client?.email ?? event?.client_email ?? 'No email'} />
              <Person label="Lawyer" name={event?.lawyer?.name ?? event?.lawyer_name ?? 'Lawyer'} meta={event?.lawyer_id ? `ID ${event.lawyer_id}` : 'No ID'} />
            </View>
            <View style={local.detailRow}>
              <Text style={local.detailLabel}>Amount</Text>
              <Text style={local.detailValue}>{formatPhp(Number(event?.payment?.amount ?? event?.amount ?? 0))}</Text>
            </View>
            <View style={local.signalBox}>
              <Text style={local.signalTitle}>{event?.signal ?? event?.signals?.[0]?.code ?? 'Risk signal'}</Text>
              <Text style={local.signalCopy}>{event?.signal_description ?? event?.description ?? 'Review the booking context and payment trace before taking action.'}</Text>
            </View>
            <View style={local.traceBox}>
              <Text style={local.traceText}>Context: {event?.context ?? 'Consultation booking'}</Text>
              <Text style={local.traceText}>Trace: {event?.trace ?? event?.consultation?.code ?? event?.consultation_code ?? 'No trace'}</Text>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

function Person({ label, name, meta }: { label: string; name: string; meta: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={local.personLabel}>{label}</Text>
      <Text style={local.personName}>{name}</Text>
      <Text style={local.personMeta}>{meta}</Text>
    </View>
  );
}

const local = StyleSheet.create({
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  darkFilter: { backgroundColor: RoleColors.admin.shell },
  eventCard: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E8EDF5', padding: 16, marginBottom: 12 },
  eventTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  when: { color: RoleColors.admin.shell, fontWeight: '900', fontSize: 14 },
  time: { color: '#667085', fontSize: 12, marginTop: 4 },
  riskPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  riskText: { fontWeight: '900', fontSize: 12 },
  reviewPill: { backgroundColor: '#FFF7ED', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  reviewText: { color: '#C2410C', fontWeight: '900', fontSize: 12 },
  peopleGrid: { flexDirection: 'row', gap: 14, marginTop: 16 },
  personLabel: { color: '#98A2B3', fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  personName: { color: RoleColors.admin.shell, fontSize: 15, fontWeight: '900', marginTop: 6 },
  personMeta: { color: '#667085', fontSize: 12, marginTop: 4 },
  detailRow: { marginTop: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailLabel: { color: '#98A2B3', fontWeight: '900', fontSize: 11, textTransform: 'uppercase' },
  detailValue: { color: RoleColors.admin.shell, fontWeight: '900', fontSize: 15 },
  signalBox: { marginTop: 12, borderWidth: 1, borderColor: '#D8E0EC', backgroundColor: '#F8FAFC', borderRadius: 10, padding: 11 },
  signalTitle: { color: '#344054', fontWeight: '900', fontSize: 12 },
  signalCopy: { color: '#667085', marginTop: 5, fontSize: 12, lineHeight: 17 },
  traceBox: { marginTop: 10, gap: 4 },
  traceText: { color: '#667085', fontSize: 12, fontWeight: '700' },
});
