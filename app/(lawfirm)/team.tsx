import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons as IoniconsBase } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { lawFirmApi } from '@/services/api';
import ConfirmActionModal from '@/components/ConfirmActionModal';
import { useNotifications } from '@/context/notifications';
import {
  buildAcceptedElsewhereActivity,
  extractApplicationList,
  getAcceptedFirmName,
  isAcceptedElsewhereApplication,
} from '@/utils/firmApplications';

const Ionicons = IoniconsBase as any;
const ROLE_FILTERS = ['all', 'lawyer', 'admin'] as const;

type PendingAction = {
  title: string;
  message: string;
  confirmLabel: string;
  icon: keyof typeof IoniconsBase.glyphMap;
  tone: 'danger' | 'primary';
  run: () => Promise<void>;
} | null;

function initials(name?: string | null) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

function openLink(url: string, errorMessage: string) {
  Linking.openURL(url).catch(() => {
    Alert.alert('Unavailable', errorMessage);
  });
}

function normalizeMember(item: any) {
  return {
    ...item,
    role: item?.role ?? 'lawyer',
    availability_status: item?.availability_status ?? item?.current_status,
  };
}

function extractList(payload: any, keys: string[]) {
  if (Array.isArray(payload)) return payload;
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

export default function LawFirmTeam() {
  const { addActivity, triggerLawFirmUnreadRefresh } = useNotifications();
  const [members, setMembers] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [apiError, setApiError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'team' | 'applications'>('team');
  const [activeFilter, setActiveFilter] = useState<(typeof ROLE_FILTERS)[number]>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actioningId, setActioningId] = useState<number | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const acceptedElsewhereNotifiedRef = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    const [teamRes, appsRes] = await Promise.allSettled([
      lawFirmApi.team(),
      lawFirmApi.applications(),
    ]);

    const issues: string[] = [];

    if (teamRes.status === 'fulfilled') {
      const payload = teamRes.value?.data;
      setMembers(extractList(payload, ['members', 'team_members', 'team']).map(normalizeMember));
    } else {
      setMembers([]);
      issues.push(String(teamRes.reason?.response?.data?.message ?? teamRes.reason?.message ?? 'Failed to load team data.'));
    }

    if (appsRes.status === 'fulfilled') {
      const payload = appsRes.value?.data;
      const nextApplications = extractApplicationList(payload);
      nextApplications
        .filter(isAcceptedElsewhereApplication)
        .forEach((application) => {
          const activity = buildAcceptedElsewhereActivity(application);
          if (acceptedElsewhereNotifiedRef.current.has(activity.id)) return;
          acceptedElsewhereNotifiedRef.current.add(activity.id);
          addActivity(activity);
        });
      setApplications(nextApplications);
    } else {
      setApplications([]);
      issues.push(String(appsRes.reason?.response?.data?.message ?? appsRes.reason?.message ?? 'Failed to load applications.'));
    }

    setApiError(issues.length ? issues.join(' | ') : null);
    setLoading(false);
    setRefreshing(false);
  }, [addActivity]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredMembers = useMemo(() => {
    if (activeFilter === 'all') return members;
    return members.filter((item) => String(item?.role ?? '').toLowerCase() === activeFilter);
  }, [activeFilter, members]);

  const activeLawyers = useMemo(
    () => members.filter((item) => String(item?.availability_status ?? '').toLowerCase() === 'available').length,
    [members],
  );
  const adminCount = useMemo(
    () => members.filter((item) => String(item?.role ?? '').toLowerCase() === 'admin').length,
    [members],
  );

  const handleAccept = useCallback((appId: number, lawyerName: string) => {
    setPendingAction({
      title: 'Accept application',
      message: `Add ${lawyerName} to your law firm team?`,
      confirmLabel: 'Accept',
      icon: 'person-add-outline',
      tone: 'primary',
      run: async () => {
        setActioningId(appId);
        try {
          await lawFirmApi.acceptApplication(appId);
          setApplications((prev) => prev.filter((entry) => entry.id !== appId));
          triggerLawFirmUnreadRefresh();
          await load();
        } catch (err: any) {
          Alert.alert('Error', err?.response?.data?.message ?? 'Failed to accept application.');
        } finally {
          setActioningId(null);
        }
      },
    });
  }, [load, triggerLawFirmUnreadRefresh]);

  const handleReject = useCallback((appId: number, lawyerName: string) => {
    setPendingAction({
      title: 'Reject application',
      message: `Reject ${lawyerName}'s application?`,
      confirmLabel: 'Reject',
      icon: 'close-circle-outline',
      tone: 'danger',
      run: async () => {
        setActioningId(appId);
        try {
          await lawFirmApi.rejectApplication(appId);
          setApplications((prev) => prev.filter((entry) => entry.id !== appId));
          triggerLawFirmUnreadRefresh();
        } catch (err: any) {
          Alert.alert('Error', err?.response?.data?.message ?? 'Failed to reject application.');
        } finally {
          setActioningId(null);
        }
      },
    });
  }, [triggerLawFirmUnreadRefresh]);

  const handleRemoveMember = useCallback((memberId: number, memberName: string) => {
    setPendingAction({
      title: 'Remove lawyer',
      message: `Remove ${memberName} from your law firm team?`,
      confirmLabel: 'Remove',
      icon: 'trash-outline',
      tone: 'danger',
      run: async () => {
        setActioningId(memberId);
        try {
          await lawFirmApi.removeLawyer(memberId);
          setMembers((prev) => prev.filter((entry) => Number(entry.id) !== Number(memberId)));
          await load();
        } catch (err: any) {
          Alert.alert('Remove Failed', err?.response?.data?.message ?? 'Failed to remove this lawyer.');
        } finally {
          setActioningId(null);
        }
      },
    });
  }, [load]);

  const runPendingAction = useCallback(async () => {
    const action = pendingAction;
    if (!action) return;
    setPendingAction(null);
    await action.run();
  }, [pendingAction]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ConfirmActionModal
        visible={Boolean(pendingAction)}
        title={pendingAction?.title ?? ''}
        message={pendingAction?.message ?? ''}
        confirmLabel={pendingAction?.confirmLabel}
        icon={pendingAction?.icon}
        tone={pendingAction?.tone}
        onCancel={() => setPendingAction(null)}
        onConfirm={runPendingAction}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        <View style={styles.hero}>
          <Text style={styles.title}>Team & Applications</Text>
          <Text style={styles.subtitle}>Manage your lawyers and review incoming applications.</Text>
        </View>

        <View style={styles.segmentWrap}>
          <TouchableOpacity
            style={[styles.segmentBtn, activeTab === 'team' && styles.segmentBtnActive]}
            onPress={() => setActiveTab('team')}
          >
            <Ionicons name="people" size={17} color={activeTab === 'team' ? '#FFFFFF' : '#6A7D92'} />
            <Text style={[styles.segmentText, activeTab === 'team' && styles.segmentTextActive]}>Team Members</Text>
            <View style={[styles.segmentBadge, activeTab === 'team' && styles.segmentBadgeActive]}>
              <Text style={[styles.segmentBadgeText, activeTab === 'team' && styles.segmentBadgeTextActive]}>{members.length}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentBtn, activeTab === 'applications' && styles.segmentBtnActive]}
            onPress={() => setActiveTab('applications')}
          >
            <Ionicons name="briefcase-outline" size={17} color={activeTab === 'applications' ? '#FFFFFF' : '#6A7D92'} />
            <Text style={[styles.segmentText, activeTab === 'applications' && styles.segmentTextActive]}>Applications</Text>
            <View style={[styles.segmentBadge, activeTab === 'applications' && styles.segmentBadgeAmber]}>
              <Text style={[styles.segmentBadgeText, activeTab === 'applications' && styles.segmentBadgeAmberText]}>{applications.length}</Text>
            </View>
          </TouchableOpacity>
        </View>

        {apiError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Sync Issue Detected</Text>
            <Text style={styles.errorLine}>{apiError}</Text>
          </View>
        ) : null}

        {activeTab === 'team' ? (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{members.length}</Text>
                <Text style={styles.statLabel}>Team members</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={[styles.statValue, { color: '#15803D' }]}>{activeLawyers}</Text>
                <Text style={styles.statLabel}>Active now</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={[styles.statValue, { color: '#1D4ED8' }]}>{adminCount}</Text>
                <Text style={styles.statLabel}>Firm admins</Text>
              </View>
            </ScrollView>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
              {ROLE_FILTERS.map((item) => {
                const active = activeFilter === item;
                return (
                  <TouchableOpacity key={item} style={[styles.filterChip, active && styles.filterChipActive]} onPress={() => setActiveFilter(item)}>
                    <Text style={[styles.filterText, active && styles.filterTextActive]}>{item.charAt(0).toUpperCase() + item.slice(1)}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {filteredMembers.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="people-outline" size={34} color="#9AA9BA" />
                <Text style={styles.emptyTitle}>No team members found</Text>
                <Text style={styles.emptyText}>Try another filter or add approved applications to your team.</Text>
              </View>
            ) : filteredMembers.map((item, index) => {
              const isOnline = String(item?.availability_status ?? '').toLowerCase() === 'available';
              const isActioning = actioningId === item?.id;
              const joinedAt = item?.joined_at || item?.pivot?.created_at || item?.created_at;
              const totalConsults = Number(item?.total_consultations ?? item?.consultations_count ?? item?.consultations ?? 0);
              return (
                <View key={String(item?.id ?? index)} style={styles.memberCard}>
                  <View style={[styles.memberAccent, { backgroundColor: isOnline ? '#14532D' : '#CBD5E1' }]} />
                  <View style={styles.memberCardBody}>
                    <View style={styles.memberTopRow}>
                      <View style={styles.memberIdentity}>
                        <View style={styles.avatar}>
                          <Text style={styles.avatarText}>{initials(item?.name)}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.memberName}>{item?.name ?? 'Team Member'}</Text>
                          <View style={styles.inlineMetaRow}>
                            {item?.specialty ? <Text style={styles.inlineMeta}>{item.specialty}</Text> : null}
                            {item?.experience_years ? <Text style={styles.inlineMeta}>{item.experience_years} yrs experience</Text> : null}
                          </View>
                        </View>
                      </View>
                      <Text style={styles.memberRole}>{String(item?.role ?? 'lawyer').toUpperCase()}</Text>
                    </View>

                    <View style={styles.badgeRow}>
                      <View style={styles.statusWrap}>
                        <View style={[styles.statusDot, { backgroundColor: isOnline ? '#16A34A' : '#111827' }]} />
                        <Text style={styles.statusText}>{isOnline ? 'Available' : 'Offline'}</Text>
                      </View>
                      {String(item?.role ?? '').toLowerCase() === 'lawyer' ? (
                        <View style={styles.certifiedBadge}>
                          <Ionicons name="shield-checkmark" size={14} color="#166534" />
                          <Text style={styles.certifiedText}>Certified</Text>
                        </View>
                      ) : null}
                    </View>

                    <View style={styles.detailRow}>
                      <Ionicons name="mail-outline" size={14} color="#7C8EA3" />
                      <Text style={styles.detailText}>{item?.email ?? 'No email provided'}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Ionicons name="call-outline" size={14} color="#7C8EA3" />
                      <Text style={styles.detailText}>{item?.phone ?? 'No phone provided'}</Text>
                    </View>

                    <View style={styles.memberStatsRow}>
                      <View style={styles.memberStatPill}>
                        <Text style={styles.memberStatValue}>{totalConsults}</Text>
                        <Text style={styles.memberStatLabel}>Consultations</Text>
                      </View>
                      <View style={styles.memberStatPill}>
                        <Text style={styles.memberStatValue}>
                          {joinedAt ? new Date(joinedAt).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' }) : 'N/A'}
                        </Text>
                        <Text style={styles.memberStatLabel}>Joined</Text>
                      </View>
                    </View>

                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        style={[styles.secondaryBtn, !item?.email && styles.btnDisabled]}
                        disabled={!item?.email}
                        onPress={() => openLink(`mailto:${item.email}`, 'Could not open the email app.')}
                      >
                        <Ionicons name="chatbubble-ellipses" size={15} color={Colors.primary} />
                        <Text style={styles.secondaryBtnText}>Email</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.primaryBtn, !item?.phone && styles.btnDisabled]}
                        disabled={!item?.phone}
                        onPress={() => openLink(`tel:${item.phone}`, 'Could not open the dialer.')}
                      >
                        <Ionicons name="call" size={15} color="#FFFFFF" />
                        <Text style={styles.primaryBtnText}>Call</Text>
                      </TouchableOpacity>
                    </View>
                    {String(item?.role ?? '').toLowerCase() !== 'admin' ? (
                      <TouchableOpacity
                        style={[styles.removeBtn, isActioning && styles.btnDisabled]}
                        disabled={isActioning}
                        onPress={() => handleRemoveMember(Number(item.id), item?.name ?? 'this lawyer')}
                      >
                        {isActioning ? <ActivityIndicator size="small" color="#B91C1C" /> : <Ionicons name="person-remove-outline" size={15} color="#B91C1C" />}
                        <Text style={styles.removeBtnText}>Remove from firm</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </>
        ) : (
          applications.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="checkmark-circle-outline" size={34} color="#9AA9BA" />
              <Text style={styles.emptyTitle}>No pending applications</Text>
              <Text style={styles.emptyText}>Incoming lawyer applications will show here for review.</Text>
            </View>
          ) : applications.map((app, index) => {
            const lawyer = app?.lawyer ?? {};
            const isActioning = actioningId === app?.id;
            const acceptedElsewhere = isAcceptedElsewhereApplication(app);
            const acceptedFirmName = getAcceptedFirmName(app);
            return (
              <View key={String(app?.id ?? index)} style={styles.applicationCard}>
                <View style={styles.memberIdentity}>
                  <View style={[styles.avatar, { backgroundColor: '#0F2D5C' }]}>
                    <Text style={styles.avatarText}>{initials(lawyer?.name)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.memberName}>{lawyer?.name ?? 'Applicant'}</Text>
                    <View style={styles.inlineMetaRow}>
                      {lawyer?.specialty ? <Text style={styles.inlineMeta}>{lawyer.specialty}</Text> : null}
                      {lawyer?.experience_years ? <Text style={styles.inlineMeta}>{lawyer.experience_years} yrs experience</Text> : null}
                    </View>
                  </View>
                </View>
                {app?.message ? <Text style={styles.applicationMessage}>“{app.message}”</Text> : null}
                {acceptedElsewhere ? (
                  <View style={styles.acceptedElsewhereNotice}>
                    <Ionicons name="information-circle-outline" size={16} color="#B45309" />
                    <Text style={styles.acceptedElsewhereText}>
                      Already accepted to {acceptedFirmName || 'another law firm'}.
                    </Text>
                  </View>
                ) : null}
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[styles.primaryBtn, (isActioning || acceptedElsewhere) && styles.btnDisabled]}
                    disabled={isActioning || acceptedElsewhere}
                    onPress={() => handleAccept(app.id, lawyer?.name ?? 'this lawyer')}
                  >
                    {isActioning ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="checkmark" size={15} color="#FFFFFF" />}
                    <Text style={styles.primaryBtnText}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.rejectBtn, isActioning && styles.btnDisabled]}
                    disabled={isActioning}
                    onPress={() => handleReject(app.id, lawyer?.name ?? 'this lawyer')}
                  >
                    <Ionicons name="close" size={15} color="#DC2626" />
                    <Text style={styles.rejectBtnText}>Reject</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#EEF3F8' },
  content: { paddingHorizontal: 16, paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#EEF3F8' },
  hero: { paddingTop: 8, paddingBottom: 14 },
  title: { color: '#17305B', fontSize: 30, fontWeight: '900' },
  subtitle: { color: '#60748A', fontSize: 16, marginTop: 6 },
  segmentWrap: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 6,
    marginBottom: 14,
    shadowColor: '#0B1D3A',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  segmentBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  segmentBtnActive: { backgroundColor: '#243A67' },
  segmentText: { color: '#64748B', fontWeight: '800', fontSize: 14 },
  segmentTextActive: { color: '#FFFFFF' },
  segmentBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 999,
    backgroundColor: '#F43F5E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBadgeActive: { backgroundColor: '#F43F5E' },
  segmentBadgeAmber: { backgroundColor: '#D18A1D' },
  segmentBadgeText: { color: '#FFFFFF', fontWeight: '900', fontSize: 11 },
  segmentBadgeTextActive: { color: '#FFFFFF' },
  segmentBadgeAmberText: { color: '#FFFFFF' },
  errorCard: {
    backgroundColor: '#FCEBEC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E7B5B8',
    padding: 12,
    marginBottom: 12,
  },
  errorTitle: { color: '#8A1C22', fontWeight: '900', marginBottom: 4, fontSize: 12 },
  errorLine: { color: '#7A2A2F', fontSize: 12, lineHeight: 18 },
  statsRow: { gap: 10, paddingBottom: 14 },
  statCard: {
    minWidth: 118,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#E3EBF4',
  },
  statValue: { color: '#17305B', fontWeight: '900', fontSize: 24 },
  statLabel: { color: '#6B7E93', fontSize: 13, marginTop: 4 },
  filters: { gap: 8, paddingBottom: 14 },
  filterChip: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: '#DCE7F2' },
  filterChipActive: { backgroundColor: '#243A67' },
  filterText: { color: '#607284', fontWeight: '700', fontSize: 12 },
  filterTextActive: { color: '#FFFFFF' },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E3EBF4',
  },
  emptyTitle: { color: '#1F365F', fontWeight: '800', fontSize: 18, marginTop: 10 },
  emptyText: { color: '#6F8093', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  memberCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E0E7EF',
    marginBottom: 14,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  memberAccent: { width: 6 },
  memberCardBody: { flex: 1, padding: 16 },
  memberTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  memberIdentity: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#102A56',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#FFFFFF', fontWeight: '900', fontSize: 18 },
  memberName: { color: '#17305B', fontWeight: '900', fontSize: 20 },
  memberRole: {
    color: '#17305B',
    backgroundColor: '#EEF4FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    fontSize: 11,
    fontWeight: '800',
  },
  inlineMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  inlineMeta: { color: '#65788D', fontSize: 14 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, marginBottom: 10, flexWrap: 'wrap' },
  statusWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 9, height: 9, borderRadius: 999 },
  statusText: { color: '#111827', fontSize: 14, fontWeight: '700' },
  certifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#DCFCE7',
  },
  certifiedText: { color: '#166534', fontWeight: '800', fontSize: 13 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  detailText: { color: '#6B7E93', fontSize: 14, flex: 1 },
  memberStatsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  memberStatPill: {
    flex: 1,
    backgroundColor: '#F8FAFD',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E3EBF4',
    paddingVertical: 9,
    paddingHorizontal: 10,
  },
  memberStatValue: { color: '#17305B', fontSize: 14, fontWeight: '900' },
  memberStatLabel: { color: '#6B7E93', fontSize: 11, fontWeight: '700', marginTop: 2 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  secondaryBtn: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#C9D7EA',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#F6F9FF',
  },
  secondaryBtnText: { color: Colors.primary, fontWeight: '800', fontSize: 14 },
  primaryBtn: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#EB3B4D',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  btnDisabled: { opacity: 0.5 },
  applicationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E0E7EF',
    padding: 16,
    marginBottom: 14,
  },
  applicationMessage: { color: '#6B7E93', marginTop: 12, lineHeight: 20, fontSize: 14 },
  acceptedElsewhereNotice: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FCD34D',
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  acceptedElsewhereText: { flex: 1, color: '#92400E', fontSize: 13, fontWeight: '800', lineHeight: 18 },
  removeBtn: {
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F2B7BE',
    backgroundColor: '#FFF5F5',
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  removeBtnText: { color: '#B91C1C', fontWeight: '900', fontSize: 13 },
  rejectBtn: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F2B7BE',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFF5F5',
  },
  rejectBtnText: { color: '#DC2626', fontWeight: '800', fontSize: 14 },
});
