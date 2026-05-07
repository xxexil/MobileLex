// Group member list with roles
import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';

export default function GroupMemberList({ members, admins }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Group Members</Text>
      <FlatList
        data={members}
        keyExtractor={item => item.id.toString()}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text>{item.name}</Text>
            {admins.some(a => a.id === item.id) && <Text style={styles.admin}>Admin</Text>}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 16, backgroundColor: '#f9f9f9', borderRadius: 8, padding: 12 },
  title: { fontWeight: 'bold', fontSize: 16, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  admin: { color: 'green', fontWeight: 'bold' },
});
