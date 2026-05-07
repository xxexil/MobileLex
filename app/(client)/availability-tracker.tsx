import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { clientApi } from '@/services/api';
import { Colors } from '@/constants/theme';
import RatingBadge from '@/components/RatingBadge';

type LawyerStatus = {
  id: number;
  name: string;
  specialty: string;
  location: string;
  avatar_url: string;
  availability_status: 'available' | 'busy' | 'offline';
  hourly_rate: number;
  rating?: number;
  review_count?: number;
  available_slots_today: number;
  occupancy_percent: number;
  next_available_time: string | null;
};

const AVAIL_COLOR: Record<string, string> = {
  available: Colors.success,
  busy: Colors.warning,
  offline: Colors.textMuted,
};

const AVAIL_LABEL: Record<string, string> = {
  available: 'Available',
  busy: 'Busy - Limited Slots',
  offline: 'Offline',
};

export default function AvailabilityTrackerScreen() {
  const router = useRouter();
  const [lawyers, setLawyers] = useState<LawyerStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    loadLawyers();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;

    // Auto-refresh every 15 seconds
    const interval = setInterval(() => {
      loadLawyers(true);
    }, 15000);

    return () => clearInterval(interval);
  }, [autoRefresh]);

  async function loadLawyers(isAutoRefresh = false) {
    try {
      if (!isAutoRefresh) setLoading(true);
      else setRefreshing(true);

      const { data } = await clientApi.lawyers({ limit: 50 });
      if (data?.data) {
        // Transform data to include availability metrics
        const enhanced = await Promise.all(
          data.data.map(async (lawyer: any) => {
            try {
              const avail = await clientApi.lawyerAvailability(lawyer.id, {
                duration_minutes: 60,
              });
              const todaySlots = avail.data?.slots?.filter((s: any) => s.time) || [];
              return {
                id: lawyer.id,
                name: lawyer.name,
                specialty: lawyer.specialty,
                location: lawyer.location,
                avatar_url: lawyer.avatar_url,
                availability_status: lawyer.availability_status,
                hourly_rate: lawyer.hourly_rate,
                rating: Number(lawyer.rating || 0),
                review_count: Number(lawyer.review_count || 0),
                available_slots_today: todaySlots.length,
                occupancy_percent: Math.min(100, Math.round((1 - todaySlots.length / 8) * 100)),
                next_available_time: avail.data?.selected_date || null,
              };
            } catch {
              return {
                id: lawyer.id,
                name: lawyer.name,
                specialty: lawyer.specialty,
                location: lawyer.location,
                avatar_url: lawyer.avatar_url,
                availability_status: lawyer.availability_status,
                hourly_rate: lawyer.hourly_rate,
                rating: Number(lawyer.rating || 0),
                review_count: Number(lawyer.review_count || 0),
                available_slots_today: 0,
                occupancy_percent: 0,
                next_available_time: null,
              };
            }
          })
        );
        setLawyers(enhanced);
      }
    } catch (err) {
      console.error('Failed to load lawyers:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading availability...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const onRefresh = async () => {
    await loadLawyers(true);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitle}>
          <Text style={styles.title}>Live Availability</Text>
          <Text style={styles.subtitle}>Real-time lawyer availability tracker</Text>
        </View>
      </View>

      {/* Toggle Auto-refresh */}
      <View style={styles.controlsBar}>
        <TouchableOpacity
          style={[styles.toggleBtn, autoRefresh && styles.toggleBtnActive]}
          onPress={() => setAutoRefresh(!autoRefresh)}
        >
          <Ionicons
            name={autoRefresh ? 'refresh' : 'refresh-outline'}
            size={16}
            color={autoRefresh ? '#fff' : Colors.textMuted}
          />
          <Text style={[styles.toggleText, autoRefresh && { color: '#fff' }]}>
            {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.manualRefreshBtn}
          onPress={onRefresh}
          disabled={refreshing}
        >
          {refreshing
            ? <ActivityIndicator size="small" color={Colors.primary} />
            : <Ionicons name="refresh" size={18} color={Colors.primary} />}
        </TouchableOpacity>
      </View>

      <FlatList
        data={lawyers}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.lawyerCard}
            onPress={() => router.push(`/lawyer/${item.id}`)}
          >
            {/* Header row: name + status */}
            <View style={styles.cardHeader}>
              <View style={styles.nameRow}>
                <View style={[styles.avatar, { backgroundColor: Colors.primary + '30' }]}>
                  <Text style={styles.avatarText}>{item.name?.[0]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lawyerName}>{item.name}</Text>
                  <RatingBadge rating={item.rating} reviewCount={item.review_count} />
                  <Text style={styles.specialty}>{item.specialty}</Text>
                </View>
              </View>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: AVAIL_COLOR[item.availability_status] + '15' },
                ]}
              >
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: AVAIL_COLOR[item.availability_status] },
                  ]}
                />
                <Text
                  style={[
                    styles.statusText,
                    { color: AVAIL_COLOR[item.availability_status] },
                  ]}
                >
                  {AVAIL_LABEL[item.availability_status]}
                </Text>
              </View>
            </View>

            {/* Metrics row */}
            <View style={styles.metricsRow}>
              <View style={styles.metricItem}>
                <Ionicons name="time-outline" size={16} color={Colors.primary} />
                <Text style={[styles.metricValue, { color: Colors.primary }]}>
                  {item.available_slots_today}
                </Text>
                <Text style={styles.metricLabel}>Available\nSlots (60min)</Text>
              </View>

              <View style={styles.metricDivider} />

              <View style={styles.metricItem}>
                <Ionicons name="pie-chart-outline" size={16} color={Colors.warning} />
                <Text style={[styles.metricValue, { color: Colors.warning }]}>
                  {item.occupancy_percent}%
                </Text>
                <Text style={styles.metricLabel}>Schedule\nOccupancy</Text>
              </View>

              <View style={styles.metricDivider} />

              <View style={styles.metricItem}>
                <Ionicons name="cash-outline" size={16} color={Colors.success} />
                <Text style={[styles.metricValue, { color: Colors.success }]}>
                  ₱{Number(item.hourly_rate || 0).toLocaleString()}
                </Text>
                <Text style={styles.metricLabel}>Rate\n/hour</Text>
              </View>
            </View>

            {/* Location and action */}
            <View style={styles.cardFooter}>
              <View style={styles.locationRow}>
                <Ionicons name="location-outline" size={14} color={Colors.textMuted} />
                <Text style={styles.locationText}>{item.location}</Text>
              </View>
              <TouchableOpacity style={styles.bookBtn}>
                <Ionicons name="arrow-forward" size={16} color={Colors.primary} />
                <Text style={styles.bookBtnText}>View Profile</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
        contentContainerStyle={styles.listContent}
        scrollEnabled={true}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: Colors.textMuted, fontSize: 14 },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { padding: 4, marginRight: 12 },
  headerTitle: { flex: 1 },
  title: { fontSize: 20, fontWeight: '800', color: Colors.text },
  subtitle: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },

  // Controls
  controlsBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  toggleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.card },
  toggleBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  toggleText: { fontSize: 12, fontWeight: '600', color: Colors.textMuted },
  manualRefreshBtn: { paddingHorizontal: 12, paddingVertical: 8 },

  // List
  listContent: { padding: 12 },

  // Card
  lawyerCard: { marginBottom: 12, backgroundColor: Colors.card, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', padding: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  nameRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 18, fontWeight: '800', color: Colors.primary },
  lawyerName: { fontSize: 15, fontWeight: '700', color: Colors.text },
  specialty: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 11, fontWeight: '600' },

  // Metrics
  metricsRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
  metricItem: { flex: 1, alignItems: 'center', gap: 6 },
  metricValue: { fontSize: 16, fontWeight: '800' },
  metricLabel: { fontSize: 10, color: Colors.textMuted, textAlign: 'center', lineHeight: 14 },
  metricDivider: { width: 1, height: 40, backgroundColor: Colors.border, marginHorizontal: 8 },

  // Footer
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.background },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  locationText: { fontSize: 11, color: Colors.textMuted },
  bookBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: Colors.primary + '15', borderRadius: 6 },
  bookBtnText: { fontSize: 12, fontWeight: '600', color: Colors.primary },
});
