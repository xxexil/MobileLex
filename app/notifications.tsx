import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons as IoniconsBase } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, RoleColors } from '@/constants/theme';
import { clientApi, lawyerApi, lawFirmApi } from '@/services/api';
import { useAuth } from '@/context/auth';
import { useNotifications } from '@/context/notifications';
import { LinearGradient } from 'expo-linear-gradient';

const Ionicons = IoniconsBase as any;

export default function NotificationCenterScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const {
    activities,
    unreadActivityCount,
    markActivityRead,
    markAllActivitiesRead,
    refreshClientUnreadTick,
    refreshLawyerUnreadTick,
    refreshLawFirmUnreadTick,
  } = useNotifications();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [messageUnread, setMessageUnread] = useState(0);
  const [recentConversations, setRecentConversations] = useState<any[]>([]);
  const [recentConsultations, setRecentConsultations] = useState<any[]>([]);
  const roleTheme =
    user?.role === 'law_firm'
      ? RoleColors.lawFirm
      : user?.role === 'lawyer'
        ? RoleColors.lawyer
        : RoleColors.client;
  const roleLabel =
    user?.role === 'law_firm'
      ? 'Law Firm'
      : user?.role === 'lawyer'
        ? 'Lawyer'
        : 'Client';
  const unreadSummary = unreadActivityCount + messageUnread;

  const load = useCallback(async () => {
    try {
      if (user?.role === 'client') {
        const [{ data: convs }, { data: consults }] = await Promise.all([
          clientApi.unreadCount(),
          clientApi.consultations(),
        ]);
        const conversationPayload: any[] = Array.isArray(convs) ? convs : [];
        const consultationPayload: any[] = Array.isArray(consults?.data) ? consults.data : Array.isArray(consults) ? consults : [];
        setMessageUnread(conversationPayload.reduce((sum, c) => sum + (c.unread ?? 0), 0));
        setRecentConversations(conversationPayload.slice(0, 5));
        setRecentConsultations(consultationPayload.slice(0, 5));
      } else if (user?.role === 'lawyer') {
        const [{ data: convs }, { data: consults }] = await Promise.all([
          lawyerApi.unreadCount(),
          lawyerApi.consultations(),
        ]);
        const conversationPayload: any[] = Array.isArray(convs) ? convs : [];
        const consultationPayload: any[] = Array.isArray(consults?.data) ? consults.data : Array.isArray(consults) ? consults : [];
        setMessageUnread(conversationPayload.reduce((sum, c) => sum + (c.unread ?? 0), 0));
        setRecentConversations(conversationPayload.slice(0, 5));
        setRecentConsultations(consultationPayload.slice(0, 5));
      } else if (user?.role === 'law_firm') {
        const [{ data: convs }, { data: consults }] = await Promise.all([
          lawFirmApi.messages(),
          lawFirmApi.consultations(),
        ]);
        const conversationPayload: any[] = Array.isArray(convs?.data) ? convs.data : Array.isArray(convs) ? convs : [];
        const consultationPayload: any[] = Array.isArray(consults?.data) ? consults.data : Array.isArray(consults) ? consults : [];
        setMessageUnread(conversationPayload.reduce((sum, c) => sum + (c.unread ?? 0), 0));
        setRecentConversations(conversationPayload.slice(0, 5));
        setRecentConsultations(consultationPayload.slice(0, 5));
      } else {
        setMessageUnread(0);
        setRecentConversations([]);
        setRecentConsultations([]);
      }
    } catch {
      setMessageUnread(0);
      setRecentConversations([]);
      setRecentConsultations([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.role]);

  useEffect(() => {
    load();
  }, [load, refreshClientUnreadTick, refreshLawyerUnreadTick, refreshLawFirmUnreadTick]);

  useFocusEffect(
    useCallback(() => {
      markAllActivitiesRead();
    }, [markAllActivitiesRead])
  );

  const messagesRoute =
    user?.role === 'client'
      ? '/(client)/messages'
      : user?.role === 'law_firm'
      ? '/(lawfirm)/messages'
      : '/(lawyer)/messages';

  const consultRoute =
    user?.role === 'client'
      ? '/(client)/consultations'
      : user?.role === 'law_firm'
      ? '/(lawfirm)/consultations'
      : '/(lawyer)/consultations';

  const groupChatRoute = '/(client)/group-chat';
  const paymentsRoute = '/(client)/payments';

  const openConversation = (conversationId?: number, options?: { fromNotification?: boolean }) => {
    if (!conversationId) {
      router.push(messagesRoute as any);
      return;
    }
    router.push({
      pathname: messagesRoute,
      params: {
        conversationId: String(conversationId),
        ...(options?.fromNotification ? { fromNotification: '1' } : {}),
      },
    } as any);
  };

  const openConsultation = (consultationId?: number) => {
    if (!consultationId) {
      router.push(consultRoute as any);
      return;
    }
    router.push({ pathname: consultRoute, params: { consultationId: String(consultationId), fromNotification: '1' } } as any);
  };

  const openGroupChat = (groupId?: number) => {
    if (!groupId || user?.role !== 'client') {
      router.push(groupChatRoute as any);
      return;
    }

    router.push({ pathname: groupChatRoute, params: { groupId: String(groupId), fromNotification: '1' } } as any);
  };

  const openActivity = (activity: { routeKind?: 'messages' | 'consultations' | 'group-chat' | 'video-call' | 'payments'; conversationId?: number; consultationId?: number; groupId?: number; mode?: 'one-on-one' | 'group'; title?: string }) => {
    if (activity.routeKind === 'messages') {
      openConversation(activity.conversationId, { fromNotification: true });
      return;
    }

    if (activity.routeKind === 'group-chat') {
      openGroupChat(activity.groupId);
      return;
    }

    if (activity.routeKind === 'video-call') {
      if (user?.role === 'lawyer') {
        router.push({ pathname: '/(lawyer)/video-call', params: activity.conversationId ? { conversationId: String(activity.conversationId), mode: activity.mode ?? 'one-on-one', title: activity.title ?? '' } : {} } as any);
      } else if (user?.role === 'client') {
        router.push({ pathname: '/(client)/video-call', params: activity.conversationId ? { conversationId: String(activity.conversationId), mode: activity.mode ?? 'one-on-one', title: activity.title ?? '' } : {} } as any);
      }
      return;
    }

    if (activity.routeKind === 'payments' && user?.role === 'client') {
      router.push({ pathname: paymentsRoute, params: activity.consultationId ? { consultationId: String(activity.consultationId), fromNotification: '1' } : {} } as any);
      return;
    }

    openConsultation(activity.consultationId);
  };

  const formatRelativeTime = (createdAt: number) => {
    const deltaMs = Date.now() - createdAt;
    const seconds = Math.max(1, Math.floor(deltaMs / 1000));
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    return new Date(createdAt).toLocaleString();
  };

  const liveActivities = useMemo(() => {
    const source = activities.slice(0, 20);
    if (filter === 'unread') {
      return source.filter((item) => !item.readAt);
    }
    return source;
  }, [activities, filter]);

  const toneColor = (tone: string) => {
    switch (tone) {
      case 'success':
        return Colors.success;
      case 'warning':
        return Colors.warning;
      case 'error':
        return Colors.error;
      default:
        return Colors.info;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          <LinearGradient colors={[roleTheme.shell, roleTheme.shellDark]} style={styles.heroCard}>
            <View style={styles.heroTopRow}>
              <TouchableOpacity style={styles.backBtnDark} onPress={() => router.back()}>
                <Ionicons name="chevron-back" size={22} color="#fff" />
              </TouchableOpacity>
              <View style={[styles.heroBadge, { backgroundColor: `${roleTheme.accent}22` }]}>
                <Ionicons name="notifications-outline" size={14} color={roleTheme.accent} />
                <Text style={[styles.heroBadgeText, { color: roleTheme.accent }]}>{roleLabel.toUpperCase()}</Text>
              </View>
            </View>
            <Text style={styles.heroTitle}>Notifications</Text>
            <Text style={styles.heroSub}>Live updates, messages, and consultation alerts in one place.</Text>
            <View style={styles.heroStatsRow}>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatValue}>{unreadSummary}</Text>
                <Text style={styles.heroStatLabel}>Unread</Text>
              </View>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatValue}>{recentConsultations.length}</Text>
                <Text style={styles.heroStatLabel}>Consults</Text>
              </View>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatValue}>{recentConversations.length}</Text>
                <Text style={styles.heroStatLabel}>Chats</Text>
              </View>
            </View>
          </LinearGradient>

          <View style={styles.panel}>
            <TouchableOpacity style={styles.primaryCard} onPress={() => router.push(consultRoute as any)} activeOpacity={0.9}>
              <View style={[styles.iconWrap, { backgroundColor: `${roleTheme.accent}18` }]}>
                <Ionicons name="calendar-outline" size={20} color={roleTheme.accent} />
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle}>Consultation Updates</Text>
                <Text style={styles.cardSub}>Open consultations to review pending and upcoming schedules.</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
            </TouchableOpacity>

            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Activity Feed</Text>
              <View style={styles.filterRow}>
                <TouchableOpacity
                  style={[
                    styles.filterChip,
                    filter === 'all' && styles.filterChipActive,
                    filter === 'all' && { backgroundColor: roleTheme.accent, borderColor: roleTheme.accent },
                  ]}
                  onPress={() => setFilter('all')}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.filterChipText, filter === 'all' && styles.filterChipTextActive]}>All</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.filterChip,
                    filter === 'unread' && styles.filterChipActive,
                    filter === 'unread' && { backgroundColor: roleTheme.accent, borderColor: roleTheme.accent },
                  ]}
                  onPress={() => setFilter('unread')}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.filterChipText, filter === 'unread' && styles.filterChipTextActive]}>
                    Unread{unreadActivityCount > 0 ? ` (${unreadActivityCount})` : ''}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
          {liveActivities.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                {filter === 'unread'
                  ? 'No unread notifications right now.'
                  : 'No live activity yet. New events will appear here immediately.'}
              </Text>
            </View>
          ) : (
            liveActivities.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.activityItem, !item.readAt && styles.activityItemUnread]}
                onPress={() => {
                  markActivityRead(item.id);
                  openActivity(item);
                }}
                activeOpacity={0.9}
              >
                <View style={[styles.activityAccent, { backgroundColor: toneColor(item.tone) }]} />
                <View style={[styles.activityIconWrap, { backgroundColor: `${toneColor(item.tone)}16` }]}>
                  <Ionicons name={item.icon as any} size={18} color={toneColor(item.tone)} />
                </View>
                <View style={styles.activityBody}>
                  <View style={styles.activityHeader}>
                    <Text style={styles.feedTitle}>{item.title}</Text>
                    <Text style={styles.activityTime}>{formatRelativeTime(item.createdAt)}</Text>
                  </View>
                  <Text style={styles.feedSub}>{item.body}</Text>
                </View>
                <View style={styles.activityActionPill}>
                  <Text style={styles.activityActionText}>Open</Text>
                </View>
                {!item.readAt ? <View style={styles.unreadDot} /> : null}
              </TouchableOpacity>
            ))
          )}

          <Text style={styles.sectionTitle}>Recent Message Alerts</Text>
          {recentConversations.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No recent message alerts.</Text>
            </View>
          ) : (
            recentConversations.map((item, idx) => (
              <TouchableOpacity key={String(item?.id ?? idx)} style={styles.feedItem} onPress={() => openConversation(item?.id, { fromNotification: true })} activeOpacity={0.9}>
                <View style={[styles.feedAccent, { backgroundColor: roleTheme.accent }]} />
                <View style={[styles.feedIconWrap, (item?.unread ?? 0) === 0 && styles.feedIconWrapRead]}>
                  <Ionicons
                    name={(item?.unread ?? 0) > 0 ? 'mail-unread-outline' : 'mail-open-outline'}
                    size={16}
                    color={(item?.unread ?? 0) > 0 ? roleTheme.accent : Colors.textMuted}
                  />
                </View>
                <View style={styles.feedBody}>
                  <Text style={[styles.feedTitle, (item?.unread ?? 0) === 0 && styles.feedTitleRead]}>{item?.other_user?.name ?? item?.client?.name ?? 'Conversation'}</Text>
                  <Text style={styles.feedSub} numberOfLines={1}>{item?.last_message ?? 'Open conversation'}</Text>
                </View>
                {(item?.unread ?? 0) > 0 ? <Text style={styles.feedBadge}>{item.unread}</Text> : <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />}
              </TouchableOpacity>
            ))
          )}

          <Text style={styles.sectionTitle}>Recent Consultation Alerts</Text>
          {recentConsultations.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No recent consultation updates.</Text>
            </View>
          ) : (
            recentConsultations.map((item, idx) => (
              <TouchableOpacity key={String(item?.id ?? idx)} style={styles.feedItem} onPress={() => openConsultation(item?.id)} activeOpacity={0.9}>
                <View style={[styles.feedAccent, { backgroundColor: roleTheme.accent }]} />
                <View style={styles.feedIconWrap}>
                  <Ionicons name="calendar-clear-outline" size={16} color={roleTheme.accent} />
                </View>
                <View style={styles.feedBody}>
                  <Text style={styles.feedTitle}>#{item?.code ?? item?.id ?? 'Consultation'}</Text>
                  <Text style={styles.feedSub} numberOfLines={1}>{String(item?.status ?? 'updated')} · {item?.scheduled_at ? new Date(item.scheduled_at).toLocaleString() : 'No schedule'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },
  heroCard: {
    marginTop: 8,
    marginBottom: 12,
    borderRadius: 24,
    padding: 18,
    shadowColor: '#071225',
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  backBtnDark: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  heroBadgeText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  heroTitle: { marginTop: 14, fontSize: 30, fontWeight: '900', color: '#fff' },
  heroSub: { marginTop: 6, fontSize: 13, lineHeight: 19, color: 'rgba(255,255,255,0.76)' },
  heroStatsRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  heroStat: { flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 16, paddingVertical: 12, paddingHorizontal: 12 },
  heroStatValue: { color: '#fff', fontSize: 20, fontWeight: '900' },
  heroStatLabel: { color: 'rgba(255,255,255,0.72)', fontSize: 11, fontWeight: '700', marginTop: 2 },
  panel: {
    backgroundColor: '#fff',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E8EDF5',
    padding: 12,
    shadowColor: '#102042',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 2,
  },
  sectionTitle: { marginTop: 8, marginBottom: 2, color: Colors.text, fontSize: 13, fontWeight: '800' },
  sectionHeaderRow: { marginTop: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  filterRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' },
  filterChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: '#F2F5FA', borderWidth: 1, borderColor: '#EEF2F7' },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterChipText: { color: Colors.textMuted, fontSize: 12, fontWeight: '800' },
  filterChipTextActive: { color: '#fff' },
  primaryCard: { backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: '#E8EDF5', padding: 14, flexDirection: 'row', alignItems: 'center' },
  iconWrap: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: `${Colors.primary}12` },
  cardBody: { flex: 1, marginLeft: 10 },
  cardTitle: { color: Colors.text, fontWeight: '800', fontSize: 14 },
  cardSub: { color: Colors.textMuted, fontSize: 12, marginTop: 4 },
  emptyCard: { backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: '#E8EDF5', padding: 16 },
  emptyText: { color: Colors.textMuted, fontSize: 12, lineHeight: 18 },
  activityItem: { backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: '#E8EDF5', paddingVertical: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'flex-start', marginTop: 10 },
  activityItemUnread: { borderColor: '#BFD4FF', backgroundColor: '#F7FBFF' },
  activityAccent: { width: 4, borderRadius: 999, marginRight: 10, alignSelf: 'stretch' },
  activityIconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  activityBody: { flex: 1, marginLeft: 10 },
  activityHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  activityTime: { color: Colors.textLight, fontSize: 11, fontWeight: '600' },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.info, marginLeft: 10, marginTop: 8 },
  activityActionPill: { alignSelf: 'center', backgroundColor: '#EEF4FF', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, marginLeft: 8 },
  activityActionText: { color: Colors.primary, fontSize: 11, fontWeight: '800' },
  feedItem: { backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: '#E8EDF5', paddingVertical: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  feedAccent: { width: 4, borderRadius: 999, marginRight: 10, alignSelf: 'stretch' },
  feedIconWrap: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: `${Colors.primary}12` },
  feedIconWrapRead: { backgroundColor: `${Colors.textMuted}12` },
  feedBody: { flex: 1, marginLeft: 10 },
  feedTitle: { color: Colors.text, fontWeight: '700', fontSize: 13 },
  feedTitleRead: { color: Colors.textMuted, fontWeight: '600' },
  feedSub: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  feedBadge: { minWidth: 20, paddingHorizontal: 6, height: 20, borderRadius: 10, backgroundColor: Colors.secondary, color: '#fff', fontSize: 11, fontWeight: '800', textAlign: 'center', textAlignVertical: 'center', overflow: 'hidden' },
});
