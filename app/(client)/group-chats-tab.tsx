import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Platform, Pressable, Modal, ActivityIndicator, KeyboardAvoidingView, ScrollView
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import EmptyState from '@/components/EmptyState';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { groupApi } from '@/services/api';

// Presence dot colors
const PRESENCE_COLORS: Record<string, string> = {
  online: '#4caf50',
  idle: '#ffc107',
  offline: '#bdbdbd',
};

export default function GroupChatsTab({ onOpenGroup, onEditGroup }: { onOpenGroup: (group: any) => void, onEditGroup?: (group: any) => void }) {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [groups, setGroups] = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const insets = useSafeAreaInsets();

  // Presence state: { [groupId]: 'online' | 'idle' | 'offline' }
  const [presence, setPresence] = useState<Record<string, string>>({});
  // Presence is optional in this list; realtime group message sync runs via Reverb in chat screens.

  // Fetch groups and users (simulate API)
  useEffect(() => {
    async function fetchData() {
      if (!user?.id) {
        setGroups([]);
        setUsers([]);
        setFiltered([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const [groupsRes, usersRes] = await Promise.all([
          groupApi.groups(user.id),
          groupApi.users(),
        ]);
        setGroups(groupsRes.data.groups || []);
        setUsers(usersRes.data.users || []);
        setFiltered(groupsRes.data.groups || []);
      } catch (e) {
        setGroups([]);
        setUsers([]);
        setFiltered([]);
      }
      setLoading(false);
    }
    fetchData();
  }, [user?.id]);

  // Filter groups by search
  useEffect(() => {
    if (!search.trim()) {
      setFiltered(groups);
    } else {
      setFiltered(
        groups.filter(g => g.name.toLowerCase().includes(search.trim().toLowerCase()))
      );
    }
  }, [search, groups]);

  // Group creation handler
  async function handleCreateGroup() {
    if (!groupName.trim() || selectedUsers.length < 1 || !user) return;
    setCreating(true);
    try {
      const { data } = await groupApi.createGroup({
        name: groupName.trim(),
        user_ids: [user.id, ...selectedUsers],
      });
      setShowCreate(false);
      setGroupName('');
      setSelectedUsers([]);
      setGroups((prev) => [...prev, data.group]);
    } catch (e) {}
    setCreating(false);
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={[styles.container, { paddingBottom: insets.bottom + 80 }]}> {/* extra for FAB */}
          {/* Tabs */}
          <View style={styles.tabsRow} accessible accessibilityRole="tablist" accessibilityLabel="Chat type tabs">
            <View style={[styles.tab, styles.tabInactive]} accessibilityRole="tab" accessibilityLabel="1 to 1 Chats" accessibilityState={{ selected: false }}>
              <Ionicons name="chatbubble-ellipses-outline" size={18} color={Colors.textMuted} />
              <Text style={styles.tabTextInactive}>1:1 Chats</Text>
            </View>
            <View style={[styles.tab, styles.tabActive]} accessibilityRole="tab" accessibilityLabel="Group Chats" accessibilityState={{ selected: true }}>
              <Ionicons name="people" size={18} color={Colors.primary} />
              <Text style={styles.tabTextActive}>Group Chats</Text>
            </View>
          </View>
          {/* Search Bar */}
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color={Colors.textMuted} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search groups..."
              placeholderTextColor={Colors.textMuted}
              accessibilityLabel="Search groups input"
              accessibilityHint="Type to filter group chats by name."
              importantForAccessibility="yes"
            />
          </View>
          {/* Group List */}
          {loading ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          ) : filtered.length === 0 ? (
            <EmptyState message="No group chats found" />
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={g => g.id.toString()}
              contentContainerStyle={{ padding: 8 }}
              keyboardShouldPersistTaps="handled"
              accessible={true}
              accessibilityLabel="Group chats list"
              accessibilityHint="Swipe up or down to review your group chats."
              renderItem={({ item, index }) => {
                const renderRightActions = () => (
                  <TouchableOpacity
                    style={styles.swipeEditBtn}
                    onPress={() => onEditGroup && onEditGroup(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit group ${item.name} (swipe)`}
                    accessibilityHint="Edit this group chat."
                  >
                    <Ionicons name="create-outline" size={22} color="#fff" />
                    <Text style={styles.swipeEditText}>Edit</Text>
                  </TouchableOpacity>
                );
                return (
                  <Animated.View entering={FadeInUp.delay(index * 40)}>
                    <Swipeable renderRightActions={renderRightActions} overshootRight={false}>
                      <Pressable
                        style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
                        onPress={() => onOpenGroup(item)}
                        onLongPress={() => onEditGroup && onEditGroup(item)}
                        accessibilityRole="button"
                        accessibilityLabel={`Open group chat: ${item.name}`}
                        accessibilityHint={item.unread > 0 ? `${item.unread} unread messages` : 'No unread messages'}
                      >
                        <View style={styles.avatarWrap}>
                          <View style={[styles.avatar, { backgroundColor: '#4fc3f7', position: 'relative' }]}> {/* TODO: avatar_url */}
                            <Text style={styles.avatarText} accessibilityLabel={`Avatar for group ${item.name}`}>{item.name[0]}</Text>
                            {/* Presence dot */}
                            <View style={[styles.statusDot, { backgroundColor: PRESENCE_COLORS[presence[item.id] || 'offline'] }]} accessibilityLabel={`Status: ${presence[item.id] || 'offline'}`} />
                          </View>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={styles.cardTop}>
                            <Text style={styles.groupName}>{item.name}</Text>
                            <Text style={styles.time}>{item.last_at || ''}</Text>
                          </View>
                          <Text style={styles.lastMsg} numberOfLines={1}>{item.last_message || ''}</Text>
                        </View>
                        {item.unread > 0 && (
                          <View style={styles.unreadBadge}>
                            <Text style={styles.unreadText} accessibilityLabel={`${item.unread} unread messages`}>{item.unread}</Text>
                          </View>
                        )}
                        {/* Edit icon button */}
                        {onEditGroup && (
                          <TouchableOpacity
                            style={styles.editBtn}
                            onPress={() => onEditGroup(item)}
                            accessibilityRole="button"
                            accessibilityLabel={`Edit group ${item.name}`}
                            accessibilityHint="Edit this group chat."
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Ionicons name="create-outline" size={22} color={Colors.primary} />
                          </TouchableOpacity>
                        )}
                      </Pressable>
                    </Swipeable>
                  </Animated.View>
                );
              }}
            />
          )}

          {/* FAB */}
          <TouchableOpacity
            style={[styles.fab, Platform.OS === 'ios' ? styles.fabIOS : styles.fabAndroid]}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Create new group"
            accessibilityHint="Open the create group dialog."
            onPress={() => setShowCreate(true)}
          >
            <MaterialIcons name="group-add" size={28} color="#fff" />
          </TouchableOpacity>

          {/* Create Group Modal */}
          <Modal
            visible={showCreate}
            animationType="slide"
            transparent
            onRequestClose={() => setShowCreate(false)}
            accessible={true}
            accessibilityViewIsModal={true}
            accessibilityLabel="Create group dialog"
          >
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' }}>
              <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 24, width: '90%' }}>
                <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 12 }} accessibilityRole="header" accessibilityLabel="Create Group">Create Group</Text>
                <TextInput
                  style={[styles.searchInput, { marginBottom: 12, borderWidth: 1, borderColor: Colors.border, borderRadius: 8 }]}
                  value={groupName}
                  onChangeText={setGroupName}
                  placeholder="Group name"
                  placeholderTextColor={Colors.textMuted}
                  accessibilityLabel="Group name input"
                  accessibilityHint="Enter the name for your new group."
                  importantForAccessibility="yes"
                />
                <Text style={{ fontWeight: '600', marginBottom: 8 }}>Add Participants</Text>
                <FlatList
                  data={users}
                  keyExtractor={u => u.id.toString()}
                  style={{ maxHeight: 180, marginBottom: 12 }}
                  accessible={true}
                  accessibilityLabel="Participants list"
                  accessibilityHint="Select users to add to the group."
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}
                      onPress={() => setSelectedUsers(sel => sel.includes(item.id) ? sel.filter(id => id !== item.id) : [...sel, item.id])}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selectedUsers.includes(item.id) }}
                      accessibilityLabel={`Select ${item.name}`}
                      accessibilityHint={selectedUsers.includes(item.id) ? 'Deselect user' : 'Select user'}
                    >
                      <Ionicons name={selectedUsers.includes(item.id) ? 'checkbox' : 'square-outline'} size={22} color={Colors.primary} style={{ marginRight: 8 }} />
                      <Text style={{ fontSize: 15 }}>{item.name}</Text>
                    </TouchableOpacity>
                  )}
                />
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
                  <TouchableOpacity
                    onPress={() => setShowCreate(false)}
                    style={{ padding: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel group creation"
                    accessibilityHint="Close the create group dialog."
                  >
                    <Text style={{ color: Colors.textMuted, fontWeight: '600' }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleCreateGroup}
                    style={{ backgroundColor: Colors.primary, borderRadius: 8, paddingHorizontal: 18, paddingVertical: 10 }}
                    disabled={creating || !groupName.trim() || selectedUsers.length < 1}
                    accessibilityRole="button"
                    accessibilityLabel="Create group"
                    accessibilityHint="Create the group with the selected users."
                  >
                    {creating ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Create</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// --- Styles ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  tabsRow: {
    flexDirection: 'row',
    marginTop: 8,
    marginBottom: 8,
    marginHorizontal: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: '#e3f2fd',
  },
  tabInactive: {
    backgroundColor: '#f5f5f5',
    marginRight: 8,
  },
  tabTextActive: {
    color: Colors.primary,
    fontWeight: '700',
    marginLeft: 6,
  },
  tabTextInactive: {
    color: Colors.textMuted,
    fontWeight: '600',
    marginLeft: 6,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    height: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: Colors.text,
    paddingVertical: 0,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  avatarWrap: {
    marginRight: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  statusDot: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#fff',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  groupName: {
    fontWeight: '700',
    fontSize: 16,
    flex: 1,
    color: Colors.text,
  },
  time: {
    color: Colors.textMuted,
    fontSize: 12,
    marginLeft: 8,
  },
  lastMsg: {
    color: Colors.textMuted,
    fontSize: 14,
    marginTop: 2,
  },
  unreadBadge: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    paddingHorizontal: 4,
  },
  unreadText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  editBtn: {
    marginLeft: 8,
    padding: 4,
  },
  swipeEditBtn: {
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    width: 70,
    borderRadius: 12,
    marginVertical: 4,
    marginRight: 4,
    height: 60,
  },
  swipeEditText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
    marginTop: 2,
  },
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 24,
    backgroundColor: Colors.primary,
    borderRadius: 28,
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  fabIOS: {
    bottom: 36,
  },
  fabAndroid: {
    bottom: 24,
  },
});


