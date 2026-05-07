import { useRouter, useLocalSearchParams } from 'expo-router';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AnimatedBorderCard from '@/components/AnimatedBorderCard';

export default function BookingConfirmationScreen() {
  const router = useRouter();
  const { lawyer, date, time, rate } = useLocalSearchParams<{
    lawyer?: string;
    date?: string;
    time?: string;
    rate?: string;
  }>();

  const lawyerName = lawyer ? JSON.parse(lawyer)?.name : undefined;

  return (
    <LinearGradient colors={['#181C24', '#232A36']} style={styles.gradient}>
      <View style={styles.container}>
        <View style={styles.iconCircle}>
          <Ionicons name="checkmark-done" size={40} color="#22c55e" />
        </View>
        <Text style={styles.header}>Booking Confirmed!</Text>
        <Text style={styles.info}>You have successfully booked a consultation.</Text>
        <AnimatedBorderCard
          style={styles.summaryCardShell}
          contentStyle={styles.summaryCard}
          borderRadius={18}
          borderWidth={1.2}
          borderBaseColor="rgba(130, 174, 232, 0.62)"
          contentBackgroundColor="#232A36"
        >
          {lawyerName && <Text style={styles.summaryText}>Lawyer: <Text style={styles.bold}>{lawyerName}</Text></Text>}
          {date && <Text style={styles.summaryText}>Date: <Text style={styles.bold}>{date}</Text></Text>}
          {time && <Text style={styles.summaryText}>Time: <Text style={styles.bold}>{time}</Text></Text>}
          {rate && <Text style={styles.summaryText}>Rate: <Text style={styles.bold}>₱{rate}/hr</Text></Text>}
        </AnimatedBorderCard>
        <TouchableOpacity
          style={styles.doneBtn}
          onPress={() => router.replace('/(client)/')}
          accessibilityRole="button"
          accessibilityLabel="Done"
        >
          <Text style={styles.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  iconCircle: { backgroundColor: '#232A36', borderRadius: 40, width: 80, height: 80, alignItems: 'center', justifyContent: 'center', marginBottom: 18, elevation: 8, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  header: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 10, textAlign: 'center' },
  info: { fontSize: 16, color: '#b0b8c1', marginBottom: 20, textAlign: 'center' },
  summaryCardShell: { marginBottom: 28, width: Dimensions.get('window').width * 0.85, elevation: 8, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  summaryCard: { backgroundColor: '#232A36', borderRadius: 18, padding: 20 },
  summaryText: { fontSize: 16, color: '#fff', marginBottom: 4 },
  bold: { fontWeight: 'bold', color: '#7B61FF' },
  doneBtn: { backgroundColor: '#7B61FF', padding: 16, borderRadius: 10, alignItems: 'center', width: Dimensions.get('window').width * 0.85, marginTop: 10 },
  doneBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});
