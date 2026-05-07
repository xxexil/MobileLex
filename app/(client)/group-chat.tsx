import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  RefreshControl,
  Alert,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/context/auth';
import { Colors } from '@/constants/theme';
import EmptyState from '@/components/EmptyState';
import AnimatedBorderCard from '@/components/AnimatedBorderCard';
import { groupApi } from '@/services/api';
import { createReverbEcho, isReverbConfigured } from '@/services/realtime';
import { encodeCallSignal, parseCallSignal, toDisplayMessage } from '@/services/call-signals';

type Group = {
  id: number;
  name: string;
  last_message?: string;
  last_at?: string;
  unread?: number;
};

type GroupMessage = {
  id: number;
  sender_id: number;
  group_id: number;
  content: string;
  created_at: string;
};

export default function GroupChatScreen() {
  const { user, token } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ openCreate?: string; groupId?: string }>();
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [newMsg, setNewMsg] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [creating, setCreating] = useState(false);
  const [realtimeTick, setRealtimeTick] = useState(0);

  const listRef = useRef<FlatList>(null);
  const handledCallSignalMessageIdRef = useRef<number | null>(null);

  const appendIncomingMessage = useCallback((incoming: GroupMessage) => {
    if (!incoming?.id) return;
    setMessages((prev) => (prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]));
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
  }, []);

  const visibleGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => g.name.toLowerCase().includes(q));
  }, [groups, search]);

  const loadGroups = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data } = await groupApi.groups(user.id);
      setGroups(Array.isArray(data?.groups) ? data.groups : []);
    } catch {
      setGroups([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  const loadMessages = useCallback(async (groupId: number) => {
    try {
      const { data } = await groupApi.messages(groupId);
      const payload = Array.isArray(data?.messages) ? data.messages : [];
      setMessages(payload);
    } catch {
      setMessages([]);
    }
  }, []);

  const sendGroupCallDecline = useCallback(async () => {
    if (!user?.id || !selectedGroup) return;
    try {
      const text = encodeCallSignal({
        type: 'decline',
        mode: 'group',
        groupId: selectedGroup.id,
        title: selectedGroup.name,
        fromName: user?.name,
      });
      const { data } = await groupApi.sendMessage(selectedGroup.id, user.id, text);
      const msg = data?.message;
      if (msg) {
        appendIncomingMessage({
          id: Number(msg.id),
          sender_id: Number(msg.sender_id),
          group_id: Number(msg.group_id),
          content: String(msg.content ?? text),
          created_at: msg.created_at ?? new Date().toISOString(),
        });
      }
      loadGroups();
    } catch {
      // best effort
    }
  }, [appendIncomingMessage, loadGroups, selectedGroup, user?.id, user?.name]);

  const startGroupCallWithInvite = useCallback(async () => {
    if (!user?.id || !selectedGroup) return;

    try {
      const text = encodeCallSignal({
        type: 'invite',
        mode: 'group',
        groupId: selectedGroup.id,
        title: selectedGroup.name,
        fromName: user?.name,
      });
      const { data } = await groupApi.sendMessage(selectedGroup.id, user.id, text);
      const msg = data?.message;
      if (msg) {
        appendIncomingMessage({
          id: Number(msg.id),
          sender_id: Number(msg.sender_id),
          group_id: Number(msg.group_id),
          content: String(msg.content ?? text),
          created_at: msg.created_at ?? new Date().toISOString(),
        });
      }
      loadGroups();
    } catch {
      Alert.alert('Call invite failed', 'Unable to send group call invite right now.');
      return;
    }

    router.push({
      pathname: '/(client)/video-call',
      params: {
        mode: 'group',
        title: selectedGroup.name,
        groupId: String(selectedGroup.id),
      },
    });
  }, [appendIncomingMessage, loadGroups, router, selectedGroup, user?.id, user?.name]);

  const confirmStartGroupCall = useCallback(() => {
    if (!selectedGroup) return;

    Alert.alert(
      'Start group call?',
      `Call ${selectedGroup.name} now?`,
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Call group',
          onPress: () => {
            void startGroupCallWithInvite();
          },
        },
      ]
    );
  }, [selectedGroup, startGroupCallWithInvite]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    if (params?.openCreate === '1') {
      setShowCreate(true);
    }
  }, [params?.openCreate]);

  useEffect(() => {
    const targetGroupId = Number(params?.groupId ?? 0);
    if (!targetGroupId || groups.length === 0) return;

    const targetGroup = groups.find((group) => Number(group.id) === targetGroupId);
    if (!targetGroup) return;
    if (selectedGroup?.id === targetGroup.id) return;

    setSelectedGroup(targetGroup);
  }, [groups, params?.groupId, selectedGroup?.id]);

  useFocusEffect(
    useCallback(() => {
      loadGroups();
      if (selectedGroup) {
        loadMessages(selectedGroup.id);
        setRealtimeTick((value) => value + 1);
      }
    }, [loadGroups, loadMessages, selectedGroup])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') return;
      loadGroups();
      if (selectedGroup) {
        loadMessages(selectedGroup.id);
        setRealtimeTick((value) => value + 1);
      }
    });

    return () => subscription.remove();
  }, [loadGroups, loadMessages, selectedGroup]);

  useEffect(() => {
    if (selectedGroup) {
      loadMessages(selectedGroup.id);
    }
  }, [selectedGroup, loadMessages]);

  useEffect(() => {
    if (selectedGroup) return;

    const intervalId = setInterval(() => {
      loadGroups();
    }, 5000);

    return () => clearInterval(intervalId);
  }, [loadGroups, selectedGroup]);

  useEffect(() => {
    if (!selectedGroup) return;

    const intervalId = setInterval(() => {
      loadMessages(selectedGroup.id);
      loadGroups();
    }, 8000);

    return () => clearInterval(intervalId);
  }, [loadGroups, loadMessages, selectedGroup]);

  useEffect(() => {
    if (!selectedGroup || !token || !isReverbConfigured()) return;

    const echo = createReverbEcho(token);
    const channelName = `group.${selectedGroup.id}`;
    const channel = echo.private(channelName);

    const onIncoming = (event: any) => {
      const payload = event?.message ?? event;
      if (!payload?.id) return;

      const senderId = Number(payload.sender_id);
      const signal = parseCallSignal(payload.content ?? '');

      appendIncomingMessage({
        id: Number(payload.id),
        sender_id: senderId,
        group_id: Number(payload.group_id),
        content: String(payload.content ?? ''),
        created_at: payload.created_at ?? new Date().toISOString(),
      });

      if (signal && senderId !== Number(user?.id) && handledCallSignalMessageIdRef.current !== Number(payload.id)) {
        handledCallSignalMessageIdRef.current = Number(payload.id);

        if (signal.type === 'invite') {
          Alert.alert(
            'Incoming group call',
            `${signal.fromName || 'Someone'} is calling the group.`,
            [
              {
                text: 'Decline',
                style: 'destructive',
                onPress: () => {
                  void sendGroupCallDecline();
                },
              },
              {
                text: 'Join',
                onPress: () =>
                  router.push({
                    pathname: '/(client)/video-call',
                    params: {
                      mode: 'group',
                      title: signal.title || selectedGroup.name,
                      groupId: String(signal.groupId ?? selectedGroup.id),
                    },
                  }),
              },
            ]
          );
        }

        if (signal.type === 'decline') {
          Alert.alert('Group call update', `${signal.fromName || 'A participant'} declined the group call.`);
        }
      }

      loadGroups();
    };

    channel.listen('.GroupMessageSent', onIncoming);

    return () => {
      try {
        channel.stopListening('.GroupMessageSent');
        echo.leave(channelName);
        echo.leave(`private-${channelName}`);
        echo.disconnect();
      } catch {
        // ignore cleanup races
      }
    };
  }, [appendIncomingMessage, loadGroups, selectedGroup?.id, token, realtimeTick]);

  async function sendMessage() {
    if (!user?.id || !selectedGroup || !newMsg.trim()) return;
    setSending(true);
    const content = newMsg.trim();
    try {
      const { data } = await groupApi.sendMessage(selectedGroup.id, user.id, content);
      const msg = data?.message;
      if (msg) {
        appendIncomingMessage({
          id: Number(msg.id),
          sender_id: Number(msg.sender_id),
          group_id: Number(msg.group_id),
          content: String(msg.content ?? content),
          created_at: msg.created_at ?? new Date().toISOString(),
        });
      }
      loadGroups();
      setNewMsg('');
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
    } catch {
      Alert.alert('Error', 'Failed to send message.');
    } finally {
      setSending(false);
    }
  }

  async function createGroup() {
    if (!user?.id || !groupName.trim()) return;
    setCreating(true);
    try {
      const { data } = await groupApi.createGroup({
        name: groupName.trim(),
        user_ids: [user.id],
      });
      if (data?.group) {
        setGroups((prev) => [...prev, data.group]);
      }
      setGroupName('');
      setShowCreate(false);
    } catch (error: any) {
      const message = error?.response?.data?.message
        || error?.response?.data?.error
        || error?.message
        || 'Failed to create group.';
      Alert.alert('Error', String(message));
    } finally {
      setCreating(false);
    }
  }

  if (!user) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (selectedGroup) {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
          <View style={styles.chatHeader}>
            <TouchableOpacity onPress={() => setSelectedGroup(null)}>
              <Ionicons name="arrow-back" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.chatHeaderTitle}>{selectedGroup.name}</Text>
            <View style={styles.chatHeaderActions}>
              <TouchableOpacity onPress={confirmStartGroupCall}>
                <Ionicons name="videocam-outline" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id.toString()}
            contentContainerStyle={styles.messageList}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={<Text style={styles.noMessages}>No messages yet.</Text>}
            renderItem={({ item }) => {
              const mine = item.sender_id === user.id;
              return (
                <View style={[styles.msgBubble, mine ? styles.msgMine : styles.msgTheirs]}>
                  <Text style={[styles.msgText, mine && { color: '#fff' }]}>{toDisplayMessage(item.content)}</Text>
                  <Text style={[styles.msgTime, mine && { color: 'rgba(255,255,255,0.75)' }]}>
                    {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              );
            }}
          />

          <View style={styles.inputRow}>
            <TextInput
              style={styles.msgInput}
              value={newMsg}
              onChangeText={setNewMsg}
              placeholder="Type a message..."
              placeholderTextColor={Colors.textLight}
              multiline
            />
            <TouchableOpacity style={styles.sendBtn} onPress={sendMessage} disabled={sending || !newMsg.trim()}>
              {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={18} color="#fff" />}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <AnimatedBorderCard
        style={styles.heroCardShell}
        contentStyle={styles.heroCard}
        borderRadius={18}
        borderWidth={1.2}
        borderBaseColor="rgba(130, 174, 232, 0.62)"
        contentBackgroundColor={Colors.primaryDark}
      >
        <View style={styles.heroTopRow}>
          <View>
            <Text style={styles.heroEyebrow}>CLIENT SPACE</Text>
            <Text style={styles.heroTitle}>Group Chats</Text>
            <Text style={styles.heroSub}>Collaborate with legal teams and peers in real time.</Text>
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowCreate(true)}>
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={Colors.textLight} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search group names"
            placeholderTextColor={Colors.textLight}
          />
        </View>
      </AnimatedBorderCard>

      <FlatList
        data={visibleGroups}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadGroups(); }} />}
        contentContainerStyle={visibleGroups.length ? styles.groupList : styles.emptyWrap}
        ListEmptyComponent={<EmptyState message="No group chats found." />}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.groupCard} onPress={() => setSelectedGroup(item)}>
            <View style={styles.groupAvatar}>
              <Text style={styles.groupAvatarText}>{item.name.charAt(0).toUpperCase()}</Text>
            </View>

            <View style={{ flex: 1 }}>
              <View style={styles.groupTop}>
                <Text style={styles.groupName}>{item.name}</Text>
                <Text style={styles.groupTime}>{item.last_at || ''}</Text>
              </View>
              <Text style={styles.groupLast} numberOfLines={1}>{item.last_message || 'No messages yet'}</Text>
            </View>

            {!!item.unread && item.unread > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{item.unread}</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      />

      <Modal visible={showCreate} transparent animationType="fade" onRequestClose={() => setShowCreate(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Create Group</Text>
            <TextInput
              style={styles.modalInput}
              value={groupName}
              onChangeText={setGroupName}
              placeholder="Group name"
              placeholderTextColor={Colors.textLight}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowCreate(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalCreate} onPress={createGroup} disabled={creating || !groupName.trim()}>
                {creating ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.modalCreateText}>Create</Text>}
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },

  heroCardShell: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 10,
  },

  heroCard: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: Colors.primaryDark,
  },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  heroEyebrow: { color: '#D7E1F4', fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  heroTitle: { color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 4 },
  heroSub: { color: '#D7E1F4', fontSize: 13, marginTop: 4, lineHeight: 18, maxWidth: 250 },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: `${Colors.primary}AA`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchWrap: {
    marginTop: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: { flex: 1, color: Colors.text, fontSize: 14, paddingVertical: 0 },

  groupList: { paddingHorizontal: 16, paddingBottom: 120 },
  emptyWrap: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 16, paddingBottom: 120 },
  groupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E8EDF5',
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
  },
  groupAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupAvatarText: { color: '#fff', fontWeight: '800', fontSize: 18 },
  groupTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  groupName: { color: Colors.text, fontWeight: '800', fontSize: 15, flex: 1, marginRight: 8 },
  groupTime: { color: Colors.textMuted, fontSize: 11 },
  groupLast: { color: Colors.textMuted, marginTop: 4, fontSize: 13 },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadText: { color: '#fff', fontWeight: '800', fontSize: 11 },

  chatHeader: {
    backgroundColor: Colors.primaryDark,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  chatHeaderActions: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 12 },
  chatHeaderTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  messageList: { padding: 14, paddingBottom: 10 },
  noMessages: { color: Colors.textMuted, textAlign: 'center', marginTop: 20 },
  msgBubble: {
    maxWidth: '82%',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  msgMine: { alignSelf: 'flex-end', backgroundColor: Colors.primary },
  msgTheirs: { alignSelf: 'flex-start', backgroundColor: '#fff', borderWidth: 1, borderColor: '#E8EDF5' },
  msgText: { color: Colors.text, fontSize: 14 },
  msgTime: { color: Colors.textMuted, fontSize: 10, marginTop: 4, textAlign: 'right' },
  inputRow: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 10,
  },
  msgInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: Colors.text,
    fontSize: 14,
    maxHeight: 120,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  modalOverlay: { flex: 1, backgroundColor: '#0007', alignItems: 'center', justifyContent: 'center' },
  modalCard: { width: '88%', backgroundColor: '#fff', borderRadius: 16, padding: 16 },
  modalTitle: { color: Colors.text, fontSize: 18, fontWeight: '800', marginBottom: 10 },
  modalInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.text,
  },
  modalActions: { marginTop: 14, flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  modalCancel: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: '#EFF3F9' },
  modalCancelText: { color: Colors.textMuted, fontWeight: '700' },
  modalCreate: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: Colors.primary },
  modalCreateText: { color: '#fff', fontWeight: '700' },
});
