import { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { formatPhp } from '@/constants/currency';
import AnimatedBorderCard from '@/components/AnimatedBorderCard';
import FeedbackModal from '@/components/FeedbackModal';

const paymentMethods = [
  { key: 'card', label: 'Credit or Debit Card', icon: 'card-outline' },
  { key: 'ewallet', label: 'E-Wallet', icon: 'phone-portrait-outline' },
  { key: 'bank', label: 'Bank Transfer', icon: 'business-outline' },
] as const;

export default function PaymentScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    lawyerName?: string;
    lawyer?: string;
    date?: string;
    time?: string;
    rate?: string;
  }>();

  const lawyerName = useMemo(() => params.lawyerName || params.lawyer || 'Selected Lawyer', [params.lawyerName, params.lawyer]);
  const date = useMemo(() => params.date || 'Not selected', [params.date]);
  const time = useMemo(() => params.time || 'Not selected', [params.time]);
  const rateNumber = useMemo(() => Number(params.rate || 0), [params.rate]);

  const [selectedMethod, setSelectedMethod] = useState<(typeof paymentMethods)[number]['key']>('card');
  const [cardNumber, setCardNumber] = useState('');
  const [processing, setProcessing] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);

  function finishSuccess() {
    setSuccessVisible(false);
    router.replace('/(client)/consultations');
  }

  async function handlePay() {
    if (selectedMethod === 'card' && cardNumber.trim().length < 12) {
      Alert.alert('Invalid Card', 'Please enter a valid card number.');
      return;
    }

    setProcessing(true);
    setTimeout(() => {
      setProcessing(false);
      setSuccessVisible(true);
    }, 1400);
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <AnimatedBorderCard
          style={styles.heroCardShell}
          contentStyle={styles.heroCard}
          borderRadius={18}
          borderWidth={1.2}
          borderBaseColor="rgba(130, 174, 232, 0.62)"
          contentBackgroundColor={Colors.primaryDark}
        >
          <Text style={styles.heroEyebrow}>CHECKOUT</Text>
          <Text style={styles.heroTitle}>Secure Payment</Text>
          <Text style={styles.heroSub}>Complete your consultation booking in a few taps.</Text>
        </AnimatedBorderCard>

        <AnimatedBorderCard style={styles.sectionCardShell} contentStyle={styles.sectionCard} borderRadius={16} borderWidth={1.1}>
          <Text style={styles.sectionTitle}>Booking Summary</Text>
          <SummaryRow icon="person-outline" label="Lawyer" value={lawyerName} />
          <SummaryRow icon="calendar-outline" label="Date" value={date} />
          <SummaryRow icon="time-outline" label="Time" value={time} />
          <SummaryRow icon="cash-outline" label="Rate" value={`${formatPhp(rateNumber)}/hr`} />
        </AnimatedBorderCard>

        <AnimatedBorderCard style={styles.sectionCardShell} contentStyle={styles.sectionCard} borderRadius={16} borderWidth={1.1}>
          <Text style={styles.sectionTitle}>Payment Method</Text>
          <View style={styles.methodsWrap}>
            {paymentMethods.map((method) => {
              const active = selectedMethod === method.key;
              return (
                <TouchableOpacity
                  key={method.key}
                  style={[styles.methodBtn, active && styles.methodBtnActive]}
                  onPress={() => setSelectedMethod(method.key)}
                >
                  <Ionicons name={method.icon as any} size={16} color={active ? '#fff' : Colors.primary} />
                  <Text style={[styles.methodText, active && styles.methodTextActive]}>{method.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {selectedMethod === 'card' && (
            <TextInput
              style={styles.input}
              placeholder="Card Number"
              placeholderTextColor={Colors.textLight}
              keyboardType="number-pad"
              value={cardNumber}
              onChangeText={setCardNumber}
            />
          )}
        </AnimatedBorderCard>

        <TouchableOpacity style={[styles.payBtn, processing && { opacity: 0.7 }]} onPress={handlePay} disabled={processing}>
          {processing ? <ActivityIndicator color="#fff" /> : <Text style={styles.payBtnText}>Pay and Confirm</Text>}
        </TouchableOpacity>
      </ScrollView>
      <FeedbackModal
        visible={successVisible}
        title="Payment confirmed"
        message="Your booking has been confirmed. You can review the consultation details anytime."
        tone="success"
        primaryLabel="Go to consultations"
        onPrimary={finishSuccess}
        onClose={finishSuccess}
      />
    </SafeAreaView>
  );
}

function SummaryRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <View style={styles.summaryIconWrap}>
        <Ionicons name={icon as any} size={15} color={Colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.summaryLabel}>{label}</Text>
        <Text style={styles.summaryValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 120 },
  heroCardShell: {
    marginBottom: 12,
  },
  heroCard: {
    backgroundColor: Colors.primaryDark,
    borderRadius: 18,
    padding: 16,
  },
  heroEyebrow: { color: '#D7E1F4', fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  heroTitle: { color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 4 },
  heroSub: { color: '#D7E1F4', fontSize: 13, marginTop: 4, lineHeight: 18 },
  sectionCardShell: {
    marginBottom: 10,
  },
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8EDF5',
    padding: 14,
  },
  sectionTitle: { color: Colors.text, fontSize: 17, fontWeight: '800', marginBottom: 8 },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: '#EDF1F7',
  },
  summaryIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: `${Colors.primary}14`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryLabel: { color: Colors.textMuted, fontSize: 11, fontWeight: '700' },
  summaryValue: { color: Colors.text, fontSize: 14, fontWeight: '800', marginTop: 2 },
  methodsWrap: { gap: 8, marginTop: 2 },
  methodBtn: {
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  methodBtnActive: { backgroundColor: Colors.primary },
  methodText: { color: Colors.primary, fontWeight: '700', fontSize: 13 },
  methodTextActive: { color: '#fff' },
  input: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.text,
    fontSize: 14,
    backgroundColor: '#fff',
  },
  payBtn: {
    marginTop: 6,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 14,
  },
  payBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
