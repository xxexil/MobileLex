import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RoleColors } from '@/constants/theme';
import { adminApi } from '@/services/api';
import { PageHeader, styles } from './all-users';

function normalize(payload: any) {
  const lawyers = payload?.lawyers ?? payload?.data ?? payload?.users ?? [];
  if (!Array.isArray(lawyers)) return [];
  return lawyers.filter((user: any) => !user?.role || String(user?.role ?? '').toLowerCase().includes('lawyer'));
}

export default function AdminLawyersScreen() {
  const [payload, setPayload] = useState<any>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await adminApi.lawyers();
      setPayload(data);
    } catch {
      setPayload(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const lawyers = useMemo(() => {
    const term = query.trim().toLowerCase();
    return normalize(payload).filter((lawyer: any) => {
      const haystack = [lawyer?.name, lawyer?.email, lawyer?.specialty, lawyer?.practice_area, lawyer?.city, lawyer?.location].join(' ').toLowerCase();
      return !term || haystack.includes(term);
    });
  }, [payload, query]);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={RoleColors.admin.accent} /></View>;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
      <PageHeader title="Lawyers" />
      <View style={styles.filterCard}>
        <TextInput style={styles.searchInput} value={query} onChangeText={setQuery} placeholder="Search name, email, or specialty..." placeholderTextColor="#7A8497" />
        <TouchableOpacity style={styles.filterBtn} activeOpacity={0.85}><Ionicons name="search" size={17} color="#fff" /><Text style={styles.filterText}>Filter</Text></TouchableOpacity>
      </View>
      {lawyers.length === 0 ? <View style={styles.tableCard}><Text style={styles.empty}>No lawyers found.</Text></View> : lawyers.map((lawyer: any, index: number) => (
        <View key={String(lawyer?.id ?? lawyer?.email ?? index)} style={local.card}>
          <View style={local.initialBox}><Text style={local.initialText}>{String(lawyer?.name ?? 'LA').slice(0, 2).toUpperCase()}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={local.title}>{lawyer?.name ?? 'Lawyer'}</Text>
            <Text style={local.email}>{lawyer?.email ?? 'No email'}</Text>
            <View style={local.metaWrap}>
              <Meta icon="scale-outline" text={lawyer?.specialty ?? lawyer?.practice_area ?? 'No specialty'} />
              <Meta icon="location-outline" text={lawyer?.city ?? lawyer?.location ?? 'No location'} />
              <Meta icon="time-outline" text={`${lawyer?.experience_years ?? 0} yrs exp.`} />
              <Meta icon="cash-outline" text={`PHP ${lawyer?.hourly_rate ?? 0}/hr`} />
              <Meta icon="star" text={String(lawyer?.rating ?? '0.0')} color="#F59E0B" />
            </View>
            <View style={local.statusRow}>
              <View style={lawyer?.is_certified ? local.verified : local.unverified}>
                <Ionicons name={lawyer?.is_certified ? 'checkmark-circle' : 'time'} size={12} color={lawyer?.is_certified ? '#047857' : '#B91C1C'} />
                <Text style={lawyer?.is_certified ? local.verifiedText : local.unverifiedText}>{lawyer?.is_certified ? 'Certified' : 'Uncertified'}</Text>
              </View>
              <TouchableOpacity style={local.certifyBtn} activeOpacity={0.85}><Ionicons name="checkmark-circle" size={14} color="#fff" /><Text style={local.certifyText}>Certify</Text></TouchableOpacity>
            </View>
          </View>
          <TouchableOpacity style={local.reviewBtn} activeOpacity={0.85}><Text style={local.reviewText}>Review Docs</Text></TouchableOpacity>
        </View>
      ))}
    </ScrollView>
  );
}

function Meta({ icon, text, color = '#98A2B3' }: { icon: any; text: string; color?: string }) {
  return (
    <View style={local.metaItem}>
      <Ionicons name={icon} size={13} color={color} />
      <Text style={local.metaText}>{text}</Text>
    </View>
  );
}

const local = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E8EDF5', padding: 16, marginBottom: 12, flexDirection: 'row', gap: 14 },
  initialBox: { width: 58, height: 58, borderRadius: 14, backgroundColor: RoleColors.admin.accent, alignItems: 'center', justifyContent: 'center' },
  initialText: { color: '#fff', fontWeight: '900', fontSize: 18 },
  title: { color: RoleColors.admin.shell, fontSize: 17, fontWeight: '900', paddingRight: 112 },
  email: { color: '#667085', fontSize: 13, marginTop: 4, paddingRight: 112 },
  metaWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { color: '#667085', fontSize: 12, fontWeight: '700' },
  statusRow: { flexDirection: 'row', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' },
  unverified: { backgroundColor: '#FEE2E2', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 5 },
  unverifiedText: { color: '#B91C1C', fontWeight: '900', fontSize: 11 },
  verified: { backgroundColor: '#D1FAE5', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 5 },
  verifiedText: { color: '#047857', fontWeight: '900', fontSize: 11 },
  certifyBtn: { backgroundColor: '#059669', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 5 },
  certifyText: { color: '#fff', fontWeight: '900', fontSize: 12 },
  reviewBtn: { position: 'absolute', right: 14, top: 14, backgroundColor: '#059669', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  reviewText: { color: '#fff', fontWeight: '900', fontSize: 12 },
});
