import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { adminApi } from '@/services/api';
import { useAuth } from '@/context/auth';
import { useFocusEffect } from 'expo-router';
import { createReverbEcho, isReverbConfigured } from '@/services/realtime';

export default function AdminUsersScreen() {
  const { user, token } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const echoRef = useRef<any | null>(null);

  const isPreview = user?.id === 0;

  const previewUsers = useMemo(
    () => ({
      counts: {
        client: 112,
        lawyer: 34,
        law_firm: 14,
        admin: 4,
      },
      total: 164,
      recent: [
        { id: 1, name: 'Ariana Cruz', role: 'client' },
        { id: 2, name: 'Renz Dela Torre', role: 'lawyer' },
        { id: 3, name: 'Cielo Partners', role: 'law_firm' },
        { id: 4, name: 'LexOps Admin', role: 'admin' },
        { id: 5, name: 'Mico Santos', role: 'client' },
      ],
    }),
    []
  );

  const load = useCallback(async () => {
    if (isPreview) {
      setData(previewUsers);
      setLastSyncedAt(new Date());
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const { data: payload } = await adminApi.users();
      setData(payload);
      setLastSyncedAt(new Date());
    } catch {
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isPreview, previewUsers]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (isPreview) return;

    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      load();
    }, 10000);

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') load();
    });

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      sub.remove();
    };
  }, [isPreview, load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    if (isPreview || !token || !isReverbConfigured()) return;

    const echo = createReverbEcho(token);
    const channelName = 'admin.users';
    const channel = echo.private(channelName);
    echoRef.current = echo;

    const onUserChanged = () => {
      load();
    };

    channel.listen('.UserChanged', onUserChanged);
    channel.listen('.user.changed', onUserChanged);

    return () => {
      try {
        channel.stopListening('.UserChanged');
        channel.stopListening('.user.changed');
        echo.leave(channelName);
        echo.leave(`private-${channelName}`);
        echo.disconnect();
      } catch {
        // ignore realtime cleanup errors
      }
      echoRef.current = null;
    };
  }, [isPreview, load, token]);

  const items = useMemo(
    () => [
      { id: '1', name: 'Client Accounts', count: data?.counts?.client ?? 0, icon: 'person-outline' as const },
      { id: '2', name: 'Lawyers', count: data?.counts?.lawyer ?? 0, icon: 'briefcase-outline' as const },
      { id: '3', name: 'Law Firms', count: data?.counts?.law_firm ?? 0, icon: 'business-outline' as const },
      { id: '4', name: 'Admins', count: data?.counts?.admin ?? 0, icon: 'shield-checkmark-outline' as const },
    ],
    [data]
  );

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
        <Text style={styles.heroEyebrow}>USER MANAGEMENT</Text>
        <Text style={styles.heroTitle}>Accounts</Text>
        <Text style={styles.heroSub}>Review role distribution and monitor account growth.</Text>
        <Text style={styles.heroSub}>Total accounts: {data?.total ?? 0}</Text>
        {!isPreview && (
          <Text style={styles.syncText}>
            {lastSyncedAt ? `Live sync: ${lastSyncedAt.toLocaleTimeString()}` : 'Live sync: waiting...'}
          </Text>
        )}
      </View>

      {isPreview && (
        <View style={styles.previewBanner}>
          <Ionicons name="information-circle-outline" size={16} color={Colors.primaryDark} />
          <Text style={styles.previewBannerText}>Preview Data: user counts and recent signups are mocked locally.</Text>
        </View>
      )}

      {items.map((item) => (
        <TouchableOpacity key={item.id} style={styles.card} activeOpacity={0.85}>
          <View style={styles.iconWrap}>
            <Ionicons name={item.icon} size={18} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{item.name}</Text>
            <Text style={styles.cardSub}>Tap to manage this segment</Text>
          </View>
          <Text style={styles.count}>{item.count}</Text>
        </TouchableOpacity>
      ))}

      <View style={styles.recentCard}>
        <Text style={styles.recentTitle}>Recent Signups</Text>
        {(Array.isArray(data?.recent) ? data.recent : []).slice(0, 5).map((u: any) => (
          <View key={String(u.id)} style={styles.recentRow}>
            <Text style={styles.recentName}>{u.name || 'User'}</Text>
            <Text style={styles.recentMeta}>{String(u.role || '').toUpperCase()}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
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
  syncText: { color: '#D7E1F4', marginTop: 6, fontSize: 11, opacity: 0.9 },
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { color: Colors.text, fontSize: 15, fontWeight: '800' },
  cardSub: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  count: { color: Colors.primaryDark, fontSize: 20, fontWeight: '800' },
  recentCard: {
    marginTop: 4,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8EDF5',
    padding: 14,
  },
  recentTitle: { color: Colors.text, fontSize: 14, fontWeight: '800', marginBottom: 8 },
  recentRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  recentName: { color: Colors.textMuted, fontSize: 12 },
  recentMeta: { color: Colors.primaryDark, fontSize: 11, fontWeight: '800' },
});
