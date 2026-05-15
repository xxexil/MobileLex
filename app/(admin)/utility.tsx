import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, RoleColors } from '@/constants/theme';
import { adminApi } from '@/services/api';

export default function AdminUtilityScreen() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<any>(null);
  const [system, setSystem] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [dashboardRes, systemRes] = await Promise.allSettled([
        adminApi.dashboard(),
        adminApi.systemStatus(),
      ]);
      setDashboard(dashboardRes.status === 'fulfilled' ? dashboardRes.value?.data ?? null : null);
      setSystem(systemRes.status === 'fulfilled' ? systemRes.value?.data ?? null : null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const utilityStats = useMemo(() => {
    const stats = dashboard?.stats ?? {};
    const metrics = system?.metrics ?? {};
    return [
      { label: 'Pending Consults', value: stats.pending_consultations ?? metrics.pending_consultations ?? 0, icon: 'calendar-outline' as const, color: '#D97706' },
      { label: 'Firm Apps', value: stats.unverified_firms ?? metrics.firm_applications_pending ?? dashboard?.summary?.pending_firm_applications ?? 0, icon: 'business-outline' as const, color: '#2563EB' },
      { label: 'Fraud Flags', value: stats.flags ?? stats.reports ?? 0, icon: 'shield-checkmark-outline' as const, color: '#DC2626' },
      { label: 'Unread', value: metrics.unread_messages ?? 0, icon: 'mail-unread-outline' as const, color: '#059669' },
    ];
  }, [dashboard, system]);

  const health = system?.health ?? {};

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={RoleColors.admin.accent} /></View>;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="construct-outline" size={24} color="#fff" />
          </View>
          <Text style={styles.heroTitle}>Admin Utility</Text>
          <Text style={styles.heroSub}>Quick operations, health checks, and review queues in one mobile panel.</Text>
        </View>

        <View style={styles.statsGrid}>
          {utilityStats.map((item) => (
            <TouchableOpacity key={item.label} style={styles.statCard} activeOpacity={0.88}>
              <View style={[styles.statIcon, { backgroundColor: `${item.color}18` }]}>
                <Ionicons name={item.icon} size={19} color={item.color} />
              </View>
              <Text style={styles.statValue}>{String(item.value)}</Text>
              <Text style={styles.statLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionGrid}>
          <UtilityAction icon="people-outline" label="All Users" onPress={() => router.push('/(admin)/all-users' as any)} />
          <UtilityAction icon="briefcase-outline" label="Lawyers" onPress={() => router.push('/(admin)/lawyers' as any)} />
          <UtilityAction icon="business-outline" label="Law Firms" onPress={() => router.push('/(admin)/law-firms' as any)} />
          <UtilityAction icon="calendar-outline" label="Consultations" onPress={() => router.push('/(admin)/consultations' as any)} />
          <UtilityAction icon="shield-checkmark-outline" label="Fraud Review" onPress={() => router.push('/(admin)/fraud-review' as any)} />
          <UtilityAction icon="server-outline" label="System" onPress={() => router.push('/(admin)/system' as any)} />
        </View>

        <Text style={styles.sectionTitle}>Service Health</Text>
        <View style={styles.healthCard}>
          <HealthLine label="API" status={String(health.api ?? 'unknown')} />
          <HealthLine label="Database" status={String(health.database ?? 'unknown')} />
          <HealthLine label="Queue" status={String(health.queue ?? 'unknown')} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function UtilityAction({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.actionCard} onPress={onPress} activeOpacity={0.88}>
      <Ionicons name={icon} size={21} color={RoleColors.admin.accent} />
      <Text style={styles.actionLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
    </TouchableOpacity>
  );
}

function HealthLine({ label, status }: { label: string; status: string }) {
  const normalized = status.toLowerCase();
  const color = normalized === 'online' || normalized === 'stable' ? Colors.success : normalized === 'unknown' ? Colors.textMuted : Colors.error;
  return (
    <View style={styles.healthLine}>
      <Text style={styles.healthLabel}>{label}</Text>
      <Text style={[styles.healthStatus, { color }]}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F2F5' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0F2F5' },
  content: { padding: 18, paddingBottom: 110 },
  hero: { backgroundColor: RoleColors.admin.shell, borderRadius: 22, padding: 18, marginBottom: 14 },
  heroIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: RoleColors.admin.accent, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  heroTitle: { color: '#fff', fontSize: 28, fontWeight: '900' },
  heroSub: { color: '#D7E1F4', fontSize: 13, lineHeight: 19, marginTop: 6 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: { width: '48%', backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  statIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  statValue: { color: '#0F1D36', fontSize: 24, fontWeight: '900', marginTop: 10 },
  statLabel: { color: '#64748B', fontSize: 12, fontWeight: '800', marginTop: 2 },
  sectionTitle: { color: '#0F1D36', fontSize: 17, fontWeight: '900', marginTop: 18, marginBottom: 10 },
  actionGrid: { gap: 10 },
  actionCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  actionLabel: { flex: 1, color: '#0F1D36', fontSize: 14, fontWeight: '900' },
  healthCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', padding: 14 },
  healthLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  healthLabel: { color: '#64748B', fontSize: 13, fontWeight: '800' },
  healthStatus: { fontSize: 13, fontWeight: '900', textTransform: 'capitalize' },
});

