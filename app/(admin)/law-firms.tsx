import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RoleColors } from '@/constants/theme';
import { adminApi } from '@/services/api';
import { PageHeader, styles } from './all-users';

function normalize(payload: any) {
  const firms = payload?.firms ?? payload?.data ?? payload?.users ?? [];
  if (!Array.isArray(firms)) return [];
  return firms.filter((firm: any) => !firm?.role || String(firm?.role ?? '').toLowerCase().includes('firm'));
}

export default function AdminLawFirmsScreen() {
  const [payload, setPayload] = useState<any>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await adminApi.lawFirms();
      setPayload(data);
    } catch {
      setPayload(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const firms = useMemo(() => {
    const term = query.trim().toLowerCase();
    return normalize(payload).filter((firm: any) => {
      const haystack = [firm?.firm_name, firm?.organization_name, firm?.name, firm?.admin_name, firm?.email, firm?.city].join(' ').toLowerCase();
      return !term || haystack.includes(term);
    });
  }, [payload, query]);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={RoleColors.admin.accent} /></View>;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
      <PageHeader title="Law Firms" />
      <View style={styles.filterCard}>
        <TextInput style={styles.searchInput} value={query} onChangeText={setQuery} placeholder="Search firm name or city..." placeholderTextColor="#7A8497" />
        <TouchableOpacity style={styles.filterBtn} activeOpacity={0.85}><Ionicons name="search" size={17} color="#fff" /><Text style={styles.filterText}>Filter</Text></TouchableOpacity>
      </View>
      {firms.length === 0 ? <View style={styles.tableCard}><Text style={styles.empty}>No law firms found.</Text></View> : firms.map((firm: any, index: number) => {
        const firmName = firm?.firm_name ?? firm?.organization_name ?? firm?.name ?? 'Law Firm';
        return (
          <View key={String(firm?.id ?? firm?.email ?? index)} style={local.card}>
            <View style={local.initialBox}><Text style={local.initialText}>{String(firmName).slice(0, 2).toUpperCase()}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={local.title}>{firmName}</Text>
              <View style={local.metaWrap}>
                <Meta icon="person" text={`Admin: ${firm?.admin_name ?? firm?.name ?? 'Firm admin'}`} />
                <Meta icon="mail" text={firm?.email ?? 'No email'} />
                <Meta icon="star" text={`${firm?.rating ?? '0.0'} (${firm?.reviews_count ?? 0} reviews)`} color="#F59E0B" />
              </View>
              <View style={local.actions}>
                <TouchableOpacity style={local.reviewBtn} activeOpacity={0.85}>
                  <Ionicons name="folder-open" size={15} color={RoleColors.lawFirm.shell} />
                  <Text style={local.reviewText}>Review Docs</Text>
                </TouchableOpacity>
                <View style={firm?.is_verified ? local.verified : local.unverified}>
                  <Ionicons name={firm?.is_verified ? 'checkmark-circle' : 'time'} size={12} color={firm?.is_verified ? '#047857' : '#B91C1C'} />
                  <Text style={firm?.is_verified ? local.verifiedText : local.unverifiedText}>{firm?.is_verified ? 'Verified' : 'Unverified'}</Text>
                </View>
                <TouchableOpacity style={local.verifyBtn} activeOpacity={0.85}>
                  <Ionicons name="checkmark-circle" size={15} color="#fff" />
                  <Text style={local.verifyText}>Verify Firm</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        );
      })}
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
  initialBox: { width: 58, height: 58, borderRadius: 14, backgroundColor: RoleColors.lawFirm.shell, alignItems: 'center', justifyContent: 'center' },
  initialText: { color: '#fff', fontWeight: '900', fontSize: 18 },
  title: { color: RoleColors.admin.shell, fontSize: 17, fontWeight: '900' },
  metaWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 10 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { color: '#667085', fontSize: 12, fontWeight: '700' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  reviewBtn: { borderWidth: 1, borderColor: '#B7D8C3', borderRadius: 10, paddingHorizontal: 11, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  reviewText: { color: RoleColors.lawFirm.shell, fontWeight: '900', fontSize: 12 },
  unverified: { backgroundColor: '#FEE2E2', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 5 },
  unverifiedText: { color: '#B91C1C', fontWeight: '900', fontSize: 11 },
  verified: { backgroundColor: '#D1FAE5', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 5 },
  verifiedText: { color: '#047857', fontWeight: '900', fontSize: 11 },
  verifyBtn: { backgroundColor: '#059669', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 5 },
  verifyText: { color: '#fff', fontWeight: '900', fontSize: 12 },
});
