import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RoleColors } from '@/constants/theme';
import { adminApi } from '@/services/api';

function todayLabel() {
  return new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function normalizeUsers(payload: any) {
  const list = payload?.users ?? payload?.data ?? payload?.recent ?? [];
  return Array.isArray(list) ? list : [];
}

function roleLabel(role?: string) {
  return String(role || 'client').replace('_', ' ');
}

export default function AdminAllUsersScreen() {
  const [payload, setPayload] = useState<any>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await adminApi.users();
      setPayload(data);
    } catch {
      setPayload(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const users = useMemo(() => {
    const source = normalizeUsers(payload);
    const term = query.trim().toLowerCase();
    return source.filter((user: any) => !term || [user?.name, user?.email, user?.role].join(' ').toLowerCase().includes(term));
  }, [payload, query]);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={RoleColors.admin.accent} /></View>;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
      <PageHeader title="All Users" />
      <View style={styles.statsRow}>
        <Stat value={payload?.counts?.client ?? 0} label="Clients" icon="person" color="#7C3AED" />
        <Stat value={payload?.counts?.lawyer ?? 0} label="Lawyers" icon="briefcase" color="#2563EB" />
        <Stat value={payload?.counts?.law_firm ?? 0} label="Law Firms" icon="business" color="#059669" />
      </View>
      <View style={styles.filterCard}>
        <TextInput value={query} onChangeText={setQuery} style={styles.searchInput} placeholder="Search name or email..." placeholderTextColor="#7A8497" />
        <TouchableOpacity style={styles.filterBtn}><Ionicons name="search" size={17} color="#fff" /><Text style={styles.filterText}>Filter</Text></TouchableOpacity>
      </View>
      <View style={styles.tableCard}>
        {users.length === 0 ? <Text style={styles.empty}>No users found.</Text> : users.map((user: any, index: number) => (
          <View key={String(user?.id ?? user?.email ?? index)} style={styles.userRow}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{String(user?.name ?? 'U').charAt(0).toUpperCase()}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{user?.name ?? 'User'}</Text>
              <Text style={styles.meta}>{user?.email ?? 'No email'}</Text>
              <Text style={styles.date}>{user?.created_at ? new Date(user.created_at).toLocaleDateString('en-PH', { month: 'short', day: '2-digit', year: 'numeric' }) : 'No join date'}</Text>
            </View>
            <View style={[styles.rolePill, String(user?.role).includes('firm') && styles.roleFirm]}><Text style={styles.roleText}>{roleLabel(user?.role)}</Text></View>
            <TouchableOpacity style={styles.deleteBtn} activeOpacity={0.85}>
              <Ionicons name="trash-outline" size={14} color="#DC2626" />
              <Text style={styles.deleteText}>Delete</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

export function PageHeader({ title }: { title: string }) {
  return (
    <View style={styles.pageHeader}>
      <View>
        <Text style={styles.pageTitle}>{title}</Text>
        <Text style={styles.pageDate}>{todayLabel()}</Text>
      </View>
      <View style={styles.adminBadge}><Ionicons name="shield" size={13} color="#fff" /><Text style={styles.adminBadgeText}>Admin</Text></View>
    </View>
  );
}

export function Stat({ value, label, icon, color }: { value: string | number; label: string; icon: any; color: string }) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: `${color}1F` }]}><Ionicons name={icon} size={20} color={color} /></View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: RoleColors.admin.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: RoleColors.admin.background },
  content: { padding: 16, paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 16 : 16, paddingBottom: 120 },
  pageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  pageTitle: { color: '#202231', fontSize: 20, fontWeight: '900' },
  pageDate: { color: '#8A94A6', marginTop: 6, fontSize: 13 },
  adminBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: RoleColors.admin.accent, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999 },
  adminBadgeText: { color: '#fff', fontWeight: '900', fontSize: 12 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#E8EDF5', padding: 12 },
  statIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  statValue: { color: RoleColors.admin.shell, fontWeight: '900', fontSize: 22, marginTop: 8 },
  statLabel: { color: '#566174', fontWeight: '700', fontSize: 12, marginTop: 2 },
  filterCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#E8EDF5', padding: 12, marginBottom: 14, gap: 10 },
  searchInput: { height: 46, borderRadius: 10, borderWidth: 1, borderColor: '#D8E0EC', paddingHorizontal: 12, color: '#111827' },
  filterBtn: { height: 44, borderRadius: 10, backgroundColor: RoleColors.admin.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  filterText: { color: '#fff', fontWeight: '900' },
  tableCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#E8EDF5', overflow: 'hidden' },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EDE9FE', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: RoleColors.admin.accent, fontWeight: '900' },
  name: { color: RoleColors.admin.shell, fontSize: 15, fontWeight: '900' },
  meta: { color: '#667085', fontSize: 13, marginTop: 3 },
  date: { color: '#98A2B3', fontSize: 11, marginTop: 3 },
  rolePill: { backgroundColor: '#EDE9FE', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  roleFirm: { backgroundColor: '#D1FAE5' },
  roleText: { color: RoleColors.admin.accent, fontSize: 11, fontWeight: '900', textTransform: 'capitalize' },
  deleteBtn: { borderWidth: 1, borderColor: '#FDA4A4', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 4 },
  deleteText: { color: '#DC2626', fontSize: 11, fontWeight: '900' },
  empty: { color: '#667085', padding: 16, fontWeight: '700' },
});
