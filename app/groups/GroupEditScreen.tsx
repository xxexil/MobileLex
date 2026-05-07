// Group creation/editing UI with member management and roles
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, RefreshControl, Animated, Image, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { groupApi } from '@/services/api';
import { useAuth } from '@/context/auth';
// import Clipboard from '@react-native-clipboard/clipboard'; // Uncomment if installed

type User = {
  id: number;
  name: string;
  avatar_url?: string;
};

type Group = {
  id: number;
  name: string;
  avatar_url?: string;
  members: User[];
  admins: User[];
};

type Props = {
  route: { params?: { group?: Group } };
  navigation: any;
};

export default function GroupEditScreen({ route, navigation }: Props) {
  const { user } = useAuth();
  const isEdit = !!route.params?.group;
  const groupId = isEdit && route.params && route.params.group ? route.params.group.id : null;
  const [name, setName] = useState<string>(isEdit && route.params && route.params.group && typeof route.params.group.name === 'string' ? route.params.group.name : '');
  const [avatar, setAvatar] = useState<string>(isEdit && route.params && route.params.group && typeof route.params.group.avatar_url === 'string' ? route.params.group.avatar_url : '');
  const [members, setMembers] = useState<User[]>(isEdit && route.params && route.params.group && Array.isArray(route.params.group.members) ? route.params.group.members : []);
  const [admins, setAdmins] = useState<User[]>(isEdit && route.params && route.params.group && Array.isArray(route.params.group.admins) ? route.params.group.admins : []);
  const [search, setSearch] = useState<string>('');
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  // Presence state: { [userId]: 'online' | 'idle' | 'offline' }
  const [presence, setPresence] = useState<Record<number, string>>({});
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [toast, setToast] = useState<string>('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const toastAnim = useRef(new Animated.Value(0)).current;

  // Fetch all users for adding members
  async function fetchUsers() {
    setLoading(true);
    try {
      const { data } = await groupApi.users();
      setAllUsers(data.users || []);
    } finally {
      setLoading(false);
    }
  }

  // Fetch users on mount
  useEffect(() => { fetchUsers(); }, []);

  // Presence is currently derived server-side for group lists; no custom raw socket here.

  // Pull-to-refresh handler
  async function onRefresh() {
    setRefreshing(true);
    await fetchUsers();
    setRefreshing(false);
  }

  // Filter users for search (exclude current members)
  const filteredUsers = allUsers.filter((u: User) => u.name.toLowerCase().includes(search.toLowerCase()) && !members.some((m: User) => m.id === u.id));

  // Add member to group (API)
  async function addMember(user: User): Promise<void> {
    if (!isEdit) {
      setMembers([...members, user]);
      return;
    }
    setLoading(true);
    try {
      await groupApi.addMember(Number(groupId), user.id);
      setMembers((prev) => [...prev, user]);
      showToast('Member added');
    } catch {
      Alert.alert('Error', 'Failed to add member.');
    }
    setLoading(false);
  }

  // Remove member from group (API)
  async function removeMember(user: User): Promise<void> {
    // Prevent removing last admin
    if (admins.some(a => a.id === user.id) && admins.length === 1) {
      Alert.alert('Error', 'Cannot remove the last admin.');
      return;
    }
    if (!isEdit) {
      setMembers(members.filter(m => m.id !== user.id));
      setAdmins(admins.filter(a => a.id !== user.id));
      return;
    }
    setLoading(true);
    try {
      await groupApi.removeMember(Number(groupId), user.id);
      setMembers(members.filter(m => m.id !== user.id));
      setAdmins(admins.filter(a => a.id !== user.id));
    } catch {
      Alert.alert('Error', 'Failed to remove member.');
    }
    setLoading(false);
  }

  // Toggle admin role (API)
  async function toggleAdmin(user: User): Promise<void> {
    if (!isEdit) {
      if (admins.some(a => a.id === user.id)) {
        if (admins.length === 1) {
          Alert.alert('Error', 'Cannot remove the last admin.');
          return;
        }
        setAdmins(admins.filter(a => a.id !== user.id));
      } else {
        setAdmins([...admins, user]);
      }
      return;
    }
    setLoading(true);
    try {
      if (admins.some(a => a.id === user.id)) {
        if (admins.length === 1) {
          Alert.alert('Error', 'Cannot remove the last admin.');
          return;
        }
        await groupApi.removeAdmin(Number(groupId), user.id);
        setAdmins(admins.filter(a => a.id !== user.id));
        showToast('Admin removed');
      } else {
        await groupApi.addAdmin(Number(groupId), user.id);
        setAdmins([...admins, user]);
        showToast('Admin added');
      }
    } catch {
      setError('Failed to update admin role.');
      Alert.alert('Error', 'Failed to update admin role.');
    } finally {
      setLoading(false);
    }
  }

  // Save group (create or update)
  async function saveGroup(): Promise<void> {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (isEdit) {
        await groupApi.updateGroup(Number(groupId), {
          name: name.trim(),
          avatar_url: avatar,
        });
        showToast('Group updated');
      } else {
        // For create, members/admins handled in parent
        // Optionally, could POST here
      }
      navigation.goBack();
    } catch {
      setError('Failed to save group.');
      Alert.alert('Error', 'Failed to save group.');
    } finally {
      setSaving(false);
    }
  }

  // Leave group (API)
  async function leaveGroup(): Promise<void> {
    if (!isEdit) return;
    Alert.alert('Leave Group', 'Are you sure you want to leave this group?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: async () => {
        setLoading(true);
        try {
          if (!user?.id) throw new Error('No authenticated user');
          await groupApi.leave(Number(groupId), user.id);
          showToast('You left the group');
          navigation.goBack();
        } catch {
          setError('Failed to leave group.');
          Alert.alert('Error', 'Failed to leave group.');
        } finally {
          setLoading(false);
        }
      } }
    ]);
  }

  // Delete group (API)
  async function deleteGroup(): Promise<void> {
    if (!isEdit) return;
    Alert.alert('Delete Group', 'Are you sure you want to delete this group? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setLoading(true);
        try {
          await groupApi.deleteGroup(Number(groupId));
          showToast('Group deleted');
          navigation.goBack();
        } catch {
          setError('Failed to delete group.');
          Alert.alert('Error', 'Failed to delete group.');
        } finally {
          setLoading(false);
        }
      } }
    ]);
  }

  // Animated toast
  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast(msg);
    setToastType(type);
    Animated.timing(toastAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    setTimeout(() => {
      Animated.timing(toastAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setToast(''));
    }, 2000);
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={styles.container}>
          <Text style={styles.title}>{isEdit ? 'Edit Group' : 'Create Group'}</Text>
          <TextInput style={styles.input} placeholder="Group Name" value={name} onChangeText={setName} accessibilityLabel="Group Name" />
          <TextInput style={styles.input} placeholder="Avatar URL" value={avatar} onChangeText={setAvatar} accessibilityLabel="Avatar URL" />
          {isEdit && groupId && (
            <TouchableOpacity
              style={{ alignSelf: 'flex-end', marginBottom: 6 }}
              onPress={() => {
                if (typeof navigator !== 'undefined' && navigator.clipboard) {
                  navigator.clipboard.writeText(groupId.toString());
                  showToast('Group ID copied');
                } else {
                  showToast('Clipboard not supported');
                }
              }}
              accessibilityLabel="Copy Group ID"
            >
              <Text style={{ color: '#007bff', fontWeight: '600' }}>Copy Group ID</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.subtitle}>Members</Text>
          {loading ? <ActivityIndicator size="small" color="#888" /> : null}
          <FlatList
            data={members}
            keyExtractor={item => item.id.toString()}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            renderItem={({ item }) => {
              const status = presence[item.id] || 'offline';
              const dotColor = status === 'online' ? '#4caf50' : status === 'idle' ? '#ffc107' : '#bdbdbd';
              return (
                <View style={styles.memberRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {item.avatar_url ? (
                      <Image source={{ uri: item.avatar_url }} style={{ width: 32, height: 32, borderRadius: 16, marginRight: 8 }} />
                    ) : null}
                    <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
                    <Text style={{ marginLeft: 6 }}>{item.name}</Text>
                  </View>
                  <TouchableOpacity onPress={() => toggleAdmin(item)} accessibilityLabel={admins.some(a => a.id === item.id) ? 'Remove Admin' : 'Make Admin'}>
                    <Text style={{ color: admins.some(a => a.id === item.id) ? 'green' : 'gray' }}>{admins.some(a => a.id === item.id) ? 'Admin' : 'Make Admin'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => removeMember(item)} disabled={admins.some(a => a.id === item.id) && admins.length === 1} accessibilityLabel="Remove Member">
                    <Text style={{ color: admins.some(a => a.id === item.id) && admins.length === 1 ? '#ccc' : 'red', marginLeft: 8 }}>Remove</Text>
                  </TouchableOpacity>
                </View>
              );
            }}
            ListFooterComponent={<View style={{ height: 1, backgroundColor: '#eee', marginVertical: 12 }} />} // Divider
          />
          <Text style={styles.subtitle}>Add Members</Text>
          <TextInput style={styles.input} placeholder="Search users..." value={search} onChangeText={setSearch} accessibilityLabel="Search users" />
          <FlatList
            data={filteredUsers}
            keyExtractor={item => item.id.toString()}
            renderItem={({ item }) => {
              const status = presence[item.id] || 'offline';
              const dotColor = status === 'online' ? '#4caf50' : status === 'idle' ? '#ffc107' : '#bdbdbd';
              return (
                <TouchableOpacity style={styles.memberRow} onPress={() => addMember(item)} accessibilityLabel={`Add ${item.name}`}>
                  {item.avatar_url ? (
                    <Image source={{ uri: item.avatar_url }} style={{ width: 32, height: 32, borderRadius: 16, marginRight: 8 }} />
                  ) : null}
                  <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
                  <Text style={{ marginLeft: 6 }}>{item.name}</Text>
                  <Text style={{ color: 'blue', marginLeft: 8 }}>Add</Text>
                </TouchableOpacity>
              );
            }}
          />
          <TouchableOpacity
            style={{ backgroundColor: '#007bff', borderRadius: 8, padding: 12, marginTop: 12, alignItems: 'center', opacity: saving ? 0.7 : 1 }}
            onPress={saveGroup}
            disabled={saving}
            accessibilityLabel={isEdit ? 'Save Changes' : 'Create Group'}
          >
            {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>{isEdit ? 'Save Changes' : 'Create Group'}</Text>}
          </TouchableOpacity>
          {isEdit && <TouchableOpacity style={{ backgroundColor: 'orange', borderRadius: 8, padding: 12, marginTop: 10, alignItems: 'center' }} onPress={leaveGroup} accessibilityLabel="Leave Group"><Text style={{ color: '#fff', fontWeight: '700' }}>Leave Group</Text></TouchableOpacity>}
          {isEdit && <TouchableOpacity style={{ backgroundColor: 'red', borderRadius: 8, padding: 12, marginTop: 10, alignItems: 'center' }} onPress={deleteGroup} accessibilityLabel="Delete Group"><Text style={{ color: '#fff', fontWeight: '700' }}>Delete Group</Text></TouchableOpacity>}
          {/* Loading overlay */}
          {(loading || saving) && (
            <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.5)', justifyContent: 'center', alignItems: 'center', zIndex: 10 }}>
              <ActivityIndicator size="large" color="#888" />
            </View>
          )}
          {/* Animated Toast/snackbar */}
          {!!toast && (
            <Animated.View style={{ position: 'absolute', bottom: 32, left: 0, right: 0, alignItems: 'center', zIndex: 20, opacity: toastAnim, transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }] }}>
              <View style={{ backgroundColor: toastType === 'error' ? '#c00' : '#222', borderRadius: 20, paddingHorizontal: 18, paddingVertical: 10 }}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>{toast}</Text>
              </View>
            </Animated.View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 16 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 8, marginBottom: 12 },
  subtitle: { fontSize: 16, fontWeight: 'bold', marginTop: 16, marginBottom: 8 },
  memberRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginLeft: 2, marginRight: 2, borderWidth: 1, borderColor: '#fff' },
});
