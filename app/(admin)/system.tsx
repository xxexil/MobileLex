import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { adminApi } from '@/services/api';
import { useAuth } from '@/context/auth';
import { createReverbEcho, isReverbConfigured } from '@/services/realtime';

export default function AdminSystemScreen() {
  const { user, token } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [freezeRegistrations, setFreezeRegistrations] = useState(false);
  const echoRef = useRef<any | null>(null);

  const isPreview = user?.id === 0;

  const previewSystem = {
    toggles: {
      maintenance_mode: false,
      freeze_registrations: false,
    },
    health: {
      api: 'online',
      database: 'online',
      queue: 'stable',
    },
    metrics: {
      pending_consultations: 7,
      unread_messages: 19,
      firm_applications_pending: 3,
    },
  };

  const load = useCallback(async () => {
    if (isPreview) {
      setData(previewSystem);
      setMaintenanceMode(Boolean(previewSystem.toggles.maintenance_mode));
      setFreezeRegistrations(Boolean(previewSystem.toggles.freeze_registrations));
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const { data: payload } = await adminApi.systemStatus();
      setData(payload);
      setMaintenanceMode(Boolean(payload?.toggles?.maintenance_mode));
      setFreezeRegistrations(Boolean(payload?.toggles?.freeze_registrations));
    } catch {
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isPreview]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (isPreview || !token || !isReverbConfigured()) return;

    const echo = createReverbEcho(token);
    const channelName = 'admin.metrics';
    const channel = echo.private(channelName);
    echoRef.current = echo;

    const onMetricsChanged = () => {
      load();
    };

    channel.listen('.MetricsChanged', onMetricsChanged);
    channel.listen('.metrics.changed', onMetricsChanged);

    return () => {
      try {
        channel.stopListening('.MetricsChanged');
        channel.stopListening('.metrics.changed');
        echo.leave(channelName);
        echo.leave(`private-${channelName}`);
        echo.disconnect();
      } catch {
        // ignore realtime cleanup errors
      }
      echoRef.current = null;
    };
  }, [isPreview, load, token]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[Colors.primary]} />}
    >
      <View style={styles.hero}>
        <Text style={styles.heroEyebrow}>SYSTEM STATUS</Text>
        <Text style={styles.heroTitle}>Operations</Text>
        <Text style={styles.heroSub}>Manage operational toggles and monitor service health.</Text>
      </View>

      {isPreview && (
        <View style={styles.previewBanner}>
          <Ionicons name="information-circle-outline" size={16} color={Colors.primaryDark} />
          <Text style={styles.previewBannerText}>Preview Data: system health and metrics are mocked in local preview mode.</Text>
        </View>
      )}

      <View style={styles.card}>
        <Row
          icon="construct-outline"
          title="Maintenance Mode"
          subtitle="Temporarily disable public activity"
          value={maintenanceMode}
          onChange={setMaintenanceMode}
        />
        <Divider />
        <Row
          icon="person-add-outline"
          title="Freeze Registrations"
          subtitle="Pause new account signups"
          value={freezeRegistrations}
          onChange={setFreezeRegistrations}
        />
      </View>

      <View style={styles.healthCard}>
        <Text style={styles.healthTitle}>Health Snapshot</Text>
        <HealthLine label="API" status={String(data?.health?.api ?? 'unknown')} tone={(data?.health?.api === 'online') ? Colors.success : Colors.error} />
        <HealthLine label="Database" status={String(data?.health?.database ?? 'unknown')} tone={(data?.health?.database === 'online') ? Colors.success : Colors.error} />
        <HealthLine label="Queue" status={String(data?.health?.queue ?? 'unknown')} tone={Colors.info} />
      </View>

      <View style={styles.healthCard}>
        <Text style={styles.healthTitle}>Live Metrics</Text>
        <HealthLine label="Pending Consultations" status={String(data?.metrics?.pending_consultations ?? 0)} tone={Colors.primaryDark} />
        <HealthLine label="Unread Messages" status={String(data?.metrics?.unread_messages ?? 0)} tone={Colors.primaryDark} />
        <HealthLine label="Firm Applications" status={String(data?.metrics?.firm_applications_pending ?? 0)} tone={Colors.primaryDark} />
      </View>
    </ScrollView>
  );
}

function Row({
  icon,
  title,
  subtitle,
  value,
  onChange,
}: {
  icon: any;
  title: string;
  subtitle: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={18} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>{title}</Text>
          <Text style={styles.rowSub}>{subtitle}</Text>
        </View>
      </View>
      <Switch value={value} onValueChange={onChange} thumbColor="#fff" trackColor={{ false: '#CBD5E1', true: Colors.primary }} />
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

function HealthLine({ label, status, tone }: { label: string; status: string; tone: string }) {
  return (
    <View style={styles.healthLine}>
      <Text style={styles.healthLabel}>{label}</Text>
      <Text style={[styles.healthStatus, { color: tone }]}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, paddingBottom: 24 },
  hero: {
    backgroundColor: Colors.primaryDark,
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
  },
  heroEyebrow: { color: '#D7E1F4', fontSize: 11, fontWeight: '700' },
  heroTitle: { color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 2 },
  heroSub: { color: '#D7E1F4', marginTop: 8, fontSize: 13 },
  previewBanner: {
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF5DC',
    borderWidth: 1,
    borderColor: '#F1D28C',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  previewBannerText: {
    flex: 1,
    color: Colors.primaryDark,
    fontSize: 12,
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8EDF5',
    padding: 14,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  left: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, marginRight: 10 },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { color: Colors.text, fontSize: 15, fontWeight: '800' },
  rowSub: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  divider: { height: 1, backgroundColor: '#E8EDF5', marginVertical: 12 },
  healthCard: {
    marginTop: 12,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8EDF5',
    padding: 14,
  },
  healthTitle: { color: Colors.text, fontSize: 14, fontWeight: '800', marginBottom: 8 },
  healthLine: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  healthLabel: { color: Colors.textMuted, fontSize: 12 },
  healthStatus: { fontSize: 12, fontWeight: '800' },
});
