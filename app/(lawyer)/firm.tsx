import { useCallback, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Linking, RefreshControl, TextInput, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { lawyerApi } from '@/services/api';
import { Colors } from '@/constants/theme';

interface Firm {
  id: number;
  firm_name: string;
  tagline?: string;
  description?: string;
  city?: string;
  address?: string;
  website?: string;
  phone?: string;
  founded_year?: number;
  firm_size_label?: string;
  cut_percentage?: number;
  specialties?: string[];
  is_verified?: boolean;
  logo_url?: string;
  rating?: number;
  reviews_count?: number;
  lawyers_count?: number;
}

interface Application {
  id: number;
  status: string;
  message?: string;
  applied_at: string;
  firm?: Firm;
}

function FirmLogo({ firm }: { firm: Firm }) {
  const initials = firm.firm_name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  return (
    <View style={styles.logoBox}>
      <Text style={styles.logoText}>{initials}</Text>
    </View>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    pending:  { bg: Colors.warning + '20', text: Colors.warning, label: 'Pending' },
    accepted: { bg: Colors.success + '20', text: Colors.success, label: 'Accepted' },
    rejected: { bg: Colors.error + '20',   text: Colors.error,   label: 'Rejected' },
  };
  const s = map[status] ?? { bg: Colors.textLight + '20', text: Colors.textLight, label: status };
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <Text style={[styles.badgeText, { color: s.text }]}>{s.label}</Text>
    </View>
  );
}

export default function LawyerFirm() {
  const [currentFirm, setCurrentFirm] = useState<Firm | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [firms, setFirms] = useState<Firm[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [applyModal, setApplyModal] = useState<Firm | null>(null);
  const [applyMessage, setApplyMessage] = useState('');
  const [applying, setApplying] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    try {
      const { data } = await lawyerApi.firms();
      setCurrentFirm(data.current_firm ?? null);
      setApplications(data.my_applications ?? []);
      setFirms(data.firms ?? []);
    } catch (e: any) {
      console.warn('Firms load error:', e?.response?.data ?? e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleApply() {
    if (!applyModal) return;
    setApplying(true);
    try {
      await lawyerApi.applyFirm(applyModal.id, applyMessage.trim() || undefined);
      setApplyModal(null);
      setApplyMessage('');
      Alert.alert('Application Submitted', 'The firm will review your profile.');
      load();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Failed to apply.');
    } finally {
      setApplying(false);
    }
  }

  async function handleLeave() {
    Alert.alert(
      'Leave Firm',
      `Are you sure you want to leave ${currentFirm?.firm_name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave', style: 'destructive',
          onPress: async () => {
            setLeaving(true);
            try {
              await lawyerApi.leaveFirm();
              Alert.alert('Left Firm', 'You have left the firm.');
              load();
            } catch (e: any) {
              Alert.alert('Error', e?.response?.data?.message ?? 'Failed to leave.');
            } finally {
              setLeaving(false);
            }
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>My Firm</Text>
        </View>
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>My Firm</Text>
          <Text style={styles.headerSub}>
            {currentFirm
              ? `You are currently a member of ${currentFirm.firm_name}`
              : 'You are not a member of any firm'}
          </Text>
        </View>
        <Ionicons name="business-outline" size={32} color="rgba(255,255,255,0.3)" />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[Colors.primary]} />}
      >
        {/* Current Firm Card */}
        {currentFirm && (
          <View style={styles.card}>
            <View style={styles.firmRow}>
              <FirmLogo firm={currentFirm} />
              <View style={styles.firmInfo}>
                <View style={styles.firmNameRow}>
                  <Text style={styles.firmName}>{currentFirm.firm_name}</Text>
                  {currentFirm.is_verified && (
                    <View style={styles.verifiedBadge}>
                      <Ionicons name="checkmark-circle" size={13} color={Colors.success} />
                      <Text style={styles.verifiedText}>Verified</Text>
                    </View>
                  )}
                  <View style={styles.currentBadge}>
                    <Ionicons name="star" size={11} color={Colors.secondary} />
                    <Text style={styles.currentBadgeText}>Current Firm</Text>
                  </View>
                </View>
                <Text style={styles.firmMeta} numberOfLines={1}>
                  {[currentFirm.tagline, currentFirm.firm_size_label, currentFirm.city].filter(Boolean).join(' • ')}
                </Text>
                {currentFirm.cut_percentage != null && (
                  <Text style={styles.firmCut}>Firm cut: <Text style={{ fontWeight: '700' }}>{currentFirm.cut_percentage}% of the balance payment</Text></Text>
                )}
              </View>
            </View>

            {(currentFirm.specialties ?? []).length > 0 && (
              <View style={styles.tagsRow}>
                {currentFirm.specialties!.map((s) => (
                  <View key={s} style={styles.tag}><Text style={styles.tagText}>{s}</Text></View>
                ))}
              </View>
            )}

            {currentFirm.description ? (
              <Text style={styles.firmDesc}>{currentFirm.description}</Text>
            ) : null}

            <View style={styles.firmLinks}>
              {currentFirm.phone && (
                <TouchableOpacity style={styles.firmLink} onPress={() => Linking.openURL(`tel:${currentFirm.phone}`)}>
                  <Ionicons name="call-outline" size={13} color={Colors.textMuted} />
                  <Text style={styles.firmLinkText}>{currentFirm.phone}</Text>
                </TouchableOpacity>
              )}
              {currentFirm.website && (
                <TouchableOpacity style={styles.firmLink} onPress={() => Linking.openURL(currentFirm.website!)}>
                  <Ionicons name="globe-outline" size={13} color={Colors.textMuted} />
                  <Text style={styles.firmLinkText}>{currentFirm.website}</Text>
                </TouchableOpacity>
              )}
              {currentFirm.founded_year && (
                <View style={styles.firmLink}>
                  <Ionicons name="time-outline" size={13} color={Colors.textMuted} />
                  <Text style={styles.firmLinkText}>Est. {currentFirm.founded_year}</Text>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={styles.leaveBtn}
              onPress={handleLeave}
              disabled={leaving}
            >
              {leaving
                ? <ActivityIndicator size="small" color={Colors.error} />
                : <>
                    <Ionicons name="exit-outline" size={15} color={Colors.error} />
                    <Text style={styles.leaveBtnText}>Leave Firm</Text>
                  </>}
            </TouchableOpacity>
          </View>
        )}

        {/* My Applications */}
        {applications.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="send-outline" size={16} color={Colors.secondary} />
              <Text style={styles.sectionTitle}>My Applications</Text>
            </View>
            {applications.map((app) => (
              <View key={app.id} style={styles.appRow}>
                {app.firm && <FirmLogo firm={app.firm} />}
                <View style={{ flex: 1 }}>
                  <Text style={styles.appFirmName}>{app.firm?.firm_name ?? '—'}</Text>
                  <Text style={styles.appDate}>
                    Applied {new Date(app.applied_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>
                </View>
                <StatusBadge status={app.status} />
              </View>
            ))}
          </View>
        )}

        {/* Browse Firms */}
        {firms.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="search-outline" size={16} color={Colors.secondary} />
              <Text style={styles.sectionTitle}>Browse Law Firms</Text>
            </View>
            {firms.map((firm) => (
              <View key={firm.id} style={[styles.card, { marginBottom: 12 }]}>
                <View style={styles.firmRow}>
                  <FirmLogo firm={firm} />
                  <View style={styles.firmInfo}>
                    <View style={styles.firmNameRow}>
                      <Text style={styles.firmName}>{firm.firm_name}</Text>
                      {firm.is_verified && (
                        <View style={styles.verifiedBadge}>
                          <Ionicons name="checkmark-circle" size={13} color={Colors.success} />
                          <Text style={styles.verifiedText}>Verified</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.firmMeta} numberOfLines={1}>
                      {[firm.firm_size_label, firm.city].filter(Boolean).join(' • ')}
                      {firm.lawyers_count != null ? ` • ${firm.lawyers_count} lawyers` : ''}
                    </Text>
                    {firm.cut_percentage != null && (
                      <Text style={styles.firmCut}>Firm cut: <Text style={{ fontWeight: '700' }}>{firm.cut_percentage}%</Text></Text>
                    )}
                  </View>
                </View>

                {(firm.specialties ?? []).length > 0 && (
                  <View style={styles.tagsRow}>
                    {firm.specialties!.map((s) => (
                      <View key={s} style={styles.tag}><Text style={styles.tagText}>{s}</Text></View>
                    ))}
                  </View>
                )}

                {firm.description ? (
                  <Text style={styles.firmDesc} numberOfLines={2}>{firm.description}</Text>
                ) : null}

                <TouchableOpacity
                  style={styles.applyBtn}
                  onPress={() => { setApplyModal(firm); setApplyMessage(''); }}
                >
                  <Ionicons name="paper-plane-outline" size={14} color="#fff" />
                  <Text style={styles.applyBtnText}>Apply to Join</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {!currentFirm && firms.length === 0 && applications.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="business-outline" size={52} color={Colors.textLight} />
            <Text style={styles.emptyTitle}>No Law Firms Available</Text>
            <Text style={styles.emptyText}>There are no law firms to join at the moment. Check back later.</Text>
          </View>
        )}
      </ScrollView>

      {/* Apply Modal */}
      <Modal visible={!!applyModal} transparent animationType="slide" onRequestClose={() => setApplyModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Apply to {applyModal?.firm_name}</Text>
            <Text style={styles.modalSub}>Write an optional message to the firm:</Text>
            <TextInput
              style={styles.modalInput}
              value={applyMessage}
              onChangeText={setApplyMessage}
              placeholder="Introduce yourself or state your interest..."
              placeholderTextColor={Colors.textLight}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              maxLength={500}
            />
            <Text style={styles.charCount}>{applyMessage.length}/500</Text>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setApplyModal(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSubmit} onPress={handleApply} disabled={applying}>
                {applying
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.modalSubmitText}>Submit Application</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    backgroundColor: Colors.primaryDark,
    paddingHorizontal: 20,
    paddingVertical: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#fff' },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  scroll: { padding: 16, paddingBottom: 32 },

  card: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
  },
  firmRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  logoBox: {
    width: 48, height: 48, borderRadius: 10,
    backgroundColor: Colors.primaryDark,
    justifyContent: 'center', alignItems: 'center',
  },
  logoText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  firmInfo: { flex: 1 },
  firmNameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 2 },
  firmName: { fontSize: 15, fontWeight: '700', color: Colors.text },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.success + '18', borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2 },
  verifiedText: { fontSize: 11, color: Colors.success, fontWeight: '600' },
  currentBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.secondary + '20', borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2 },
  currentBadgeText: { fontSize: 11, color: Colors.secondary, fontWeight: '600' },
  firmMeta: { fontSize: 12, color: Colors.textMuted, marginBottom: 2 },
  firmCut: { fontSize: 12, color: Colors.text, marginTop: 2 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  tag: { backgroundColor: Colors.info + '15', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  tagText: { fontSize: 11, color: Colors.info, fontWeight: '600' },
  firmDesc: { fontSize: 13, color: Colors.textMuted, marginTop: 10, lineHeight: 19 },
  firmLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 10 },
  firmLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  firmLinkText: { fontSize: 12, color: Colors.textMuted },
  leaveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 14, borderWidth: 1, borderColor: Colors.error,
    borderRadius: 8, paddingVertical: 9,
  },
  leaveBtnText: { fontSize: 13, fontWeight: '600', color: Colors.error },

  section: { marginBottom: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },

  appRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.card, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 8,
  },
  appFirmName: { fontSize: 14, fontWeight: '600', color: Colors.text },
  appDate: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  badge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '700' },

  applyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.primary, borderRadius: 8, paddingVertical: 10, marginTop: 14,
  },
  applyBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.text, marginTop: 16, marginBottom: 8 },
  emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: Colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 36 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: Colors.text, marginBottom: 6 },
  modalSub: { fontSize: 13, color: Colors.textMuted, marginBottom: 12 },
  modalInput: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 8,
    padding: 12, fontSize: 14, color: Colors.text,
    minHeight: 100, backgroundColor: Colors.background,
  },
  charCount: { fontSize: 11, color: Colors.textLight, textAlign: 'right', marginTop: 4, marginBottom: 16 },
  modalBtns: { flexDirection: 'row', gap: 10 },
  modalCancel: { flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  modalCancelText: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
  modalSubmit: { flex: 2, backgroundColor: Colors.primary, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  modalSubmitText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
