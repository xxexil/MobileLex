import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';

// Example wallet/earnings data
const earnings = [
  { id: '1', date: '2026-03-20', client: 'Client A', amount: 85, status: 'Paid' },
  { id: '2', date: '2026-03-18', client: 'Client B', amount: 120, status: 'Pending' },
  // ...more
];

export default function WalletScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.header}>My Wallet</Text>
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Current Balance</Text>
        <Text style={styles.balanceAmount}>$205.00</Text>
      </View>
      <Text style={styles.sectionTitle}>Earnings History</Text>
      <FlatList
        data={earnings}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={styles.earningRow}>
            <Text style={styles.earningDate}>{item.date}</Text>
            <Text style={styles.earningClient}>{item.client}</Text>
            <Text style={styles.earningAmount}>${item.amount}</Text>
            <Text style={[styles.earningStatus, item.status === 'Paid' ? styles.paid : styles.pending]}>{item.status}</Text>
          </View>
        )}
        contentContainerStyle={{ paddingBottom: 24 }}
      />
      <TouchableOpacity style={styles.payoutBtn} accessibilityRole="button" accessibilityLabel="Request Payout">
        <Text style={styles.payoutBtnText}>Request Payout</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 20 },
  header: { fontSize: 22, fontWeight: 'bold', marginBottom: 16 },
  balanceCard: { backgroundColor: '#f8f8f8', borderRadius: 10, padding: 16, marginBottom: 20, alignItems: 'center' },
  balanceLabel: { color: '#888', fontSize: 14 },
  balanceAmount: { fontSize: 28, fontWeight: 'bold', color: '#007AFF', marginTop: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  earningRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  earningDate: { flex: 1, color: '#666' },
  earningClient: { flex: 1, color: '#333' },
  earningAmount: { flex: 1, color: '#007AFF', fontWeight: 'bold' },
  earningStatus: { flex: 1, textAlign: 'right', fontWeight: 'bold' },
  paid: { color: 'green' },
  pending: { color: 'orange' },
  payoutBtn: { backgroundColor: '#007AFF', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 24 },
  payoutBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});
