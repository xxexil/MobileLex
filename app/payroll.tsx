import React, { useEffect, useMemo, useRef, useState } from 'react';
import { clientApi } from '@/services/api';
import { LARAVEL_API_BASE } from '@/services/endpoints';
import * as ExpoLinking from 'expo-linking';
import Constants from 'expo-constants';
import { openAuthSessionAsync } from 'expo-web-browser';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { formatPhp } from '@/constants/currency';
import { Ionicons as IoniconsBase } from '@expo/vector-icons';
import { useAuth } from '@/context/auth';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';

const Ionicons = IoniconsBase as any;

const PAYMENT_GROUPS = [
  {
    title: 'Cards',
    subtitle: 'Standard debit and credit card checkout.',
    items: [
      { key: 'card', label: 'Cards', icon: 'card-outline', accent: '#1B3A6B' },
    ],
  },
  {
    title: 'E-Wallets',
    subtitle: 'Let clients complete payment with their mobile wallet.',
    items: [
      { key: 'gcash', label: 'GCash', icon: 'wallet-outline', accent: '#2563EB' },
      { key: 'paymaya', label: 'Maya', icon: 'phone-portrait-outline', accent: '#0F766E' },
      { key: 'grab_pay', label: 'GrabPay', icon: 'car-outline', accent: '#15803D' },
      { key: 'shopee_pay', label: 'ShopeePay', icon: 'bag-handle-outline', accent: '#EA580C' },
    ],
  },
  {
    title: 'Online Banking',
    subtitle: 'Direct online banking via PayMongo supported banks.',
    items: [
      { key: 'dob', label: 'Direct Online Banking', icon: 'business-outline', accent: '#7C3AED' },
    ],
  },
] as const;

const DEFAULT_METHODS = PAYMENT_GROUPS.flatMap((group) => group.items.map((item) => item.key));
const WEB_APP_BASE_URL = LARAVEL_API_BASE.replace(/\/api\/?$/, '');

function getMobileCallbackUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (Constants.appOwnership === 'expo') {
    const owner = Constants.expoConfig?.owner || process.env.EXPO_PUBLIC_EXPO_OWNER;
    const slug = Constants.expoConfig?.slug || process.env.EXPO_PUBLIC_EXPO_SLUG;
    if (owner && slug) {
      return `https://auth.expo.io/@${owner}/${slug}`;
    }

    const target = ExpoLinking.createURL(normalizedPath);
    return `${WEB_APP_BASE_URL}/mobile-return?target=${encodeURIComponent(target)}`;
  }

  return ExpoLinking.createURL(normalizedPath, {
    scheme: 'lexconnectmobile',
    isTripleSlashed: true,
  });
}

export default function PayrollScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ backTo?: string }>();
  const backHandledRef = useRef(false);
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedMethods, setSelectedMethods] = useState<string[]>(DEFAULT_METHODS);
  const [receiptEmail, setReceiptEmail] = useState((user?.email || '').trim().toLowerCase());
  const [verifiedDetails, setVerifiedDetails] = useState(false);

  const numericAmount = useMemo(() => Number(amount), [amount]);
  const callbackUrl = useMemo(() => getMobileCallbackUrl('/payroll'), []);
  const fallbackRoute = useMemo(() => resolveClientBackRoute(params.backTo), [params.backTo]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (backHandledRef.current) return;
      const actionType = event.data.action.type;
      if (actionType !== 'GO_BACK' && actionType !== 'POP' && actionType !== 'POP_TO_TOP') {
        return;
      }

      event.preventDefault();
      backHandledRef.current = true;
      router.replace(fallbackRoute as any);
    });

    return unsubscribe;
  }, [fallbackRoute, navigation, router]);

  function toggleMethod(methodKey: string) {
    setSelectedMethods((current) =>
      current.includes(methodKey)
        ? current.filter((item) => item !== methodKey)
        : [...current, methodKey]
    );
  }

  async function pollPaymentStatus(paymentId: number) {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const { data } = await clientApi.paymentStatus(paymentId);
      const payment = data?.payment;

      if (payment?.status === 'paid' || payment?.status === 'downpayment_paid') {
        return payment;
      }

      if (payment?.status === 'failed') {
        return payment;
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    return null;
  }

  async function handlePay() {
    if (!amount || Number.isNaN(numericAmount) || numericAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount in PHP.');
      return;
    }

    if (!selectedMethods.length) {
      Alert.alert('Select a Method', 'Choose at least one payment option before continuing.');
      return;
    }

    const normalizedEmail = receiptEmail.trim().toLowerCase();
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      Alert.alert('Invalid Email', 'Please enter a valid receipt email before continuing.');
      return;
    }

    if (!verifiedDetails) {
      Alert.alert('Verification Needed', 'Please confirm the payroll details before proceeding to checkout.');
      return;
    }

    // Show the callback URL for debugging before loading and navigation
    Alert.alert('Callback URL', callbackUrl);
    // Wait for user to dismiss the alert before proceeding
    await new Promise((resolve) => setTimeout(resolve, 500));
    setLoading(true);
    try {
      const response = await clientApi.payrollPay({
        amount: numericAmount,
        cancelUrl: callbackUrl,
        description: 'LexConnect payroll payment',
        email: normalizedEmail,
        name: user?.name,
        paymentMethodTypes: selectedMethods,
        successUrl: callbackUrl,
      });

      const checkoutUrl = response.data?.checkout_url || response.data?.checkoutUrl || response.data?.checkoutSession?.data?.attributes?.checkout_url;
      const paymentId = Number(response.data?.payment?.id || 0);
      if (!checkoutUrl) {
        Alert.alert('Unavailable', 'Checkout URL was not returned by the server.');
        return;
      }

      const result = await openAuthSessionAsync(checkoutUrl, callbackUrl);
      if (result.type === 'success') {
        if (paymentId > 0) {
          const payment = await pollPaymentStatus(paymentId);
          if (payment?.status === 'paid' || payment?.status === 'downpayment_paid') {
            Alert.alert('Payment Confirmed', 'Your payroll payment has been confirmed.', [
              {
                text: 'View Payments',
                onPress: () => router.push({ pathname: '/(client)/payments', params: { backTo: 'payroll' } } as any),
              },
            ]);
            return;
          }

          if (payment?.status === 'failed') {
            Alert.alert('Payment Failed', 'The payment did not complete successfully.');
            return;
          }
        }

        Alert.alert('Processing', 'Your payment is still being confirmed. You can check the Payments screen in a moment.');
        return;
      }

      if (result.type === 'cancel') {
        Alert.alert('Checkout Cancelled', 'The payment flow was closed before completion.');
      }
    } catch (err: any) {
      const message = err?.response?.data?.error || err?.response?.data?.details?.errors?.[0]?.detail || 'Failed to initiate payment.';
      Alert.alert('Payment Error', message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>PAYROLL</Text>
          <Text style={styles.heroTitle}>Pay with card, e-wallet, or bank</Text>
          <Text style={styles.heroSub}>
            Launch a hosted PayMongo checkout and limit the payment methods shown to what you enable below.
          </Text>
          <TouchableOpacity
            style={styles.historyBtn}
            onPress={() => router.push({ pathname: '/(client)/payments', params: { backTo: 'payroll' } } as any)}
          >
            <Ionicons name="receipt-outline" size={15} color="#fff" />
            <Text style={styles.historyBtnText}>Payment History</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Payment Amount</Text>
          <Text style={styles.sectionSub}>Enter the payroll amount in Philippine pesos.</Text>
          <View style={styles.amountRow}>
            <View style={styles.currencyBadge}>
              <Text style={styles.currencyBadgeText}>PHP</Text>
            </View>
            <TextInput
              style={styles.amountInput}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={Colors.textLight}
              value={amount}
              onChangeText={setAmount}
            />
          </View>
        </View>

        {PAYMENT_GROUPS.map((group) => (
          <View key={group.title} style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{group.title}</Text>
            <Text style={styles.sectionSub}>{group.subtitle}</Text>
            <View style={styles.methodList}>
              {group.items.map((method) => {
                const active = selectedMethods.includes(method.key);
                return (
                  <TouchableOpacity
                    key={method.key}
                    style={[
                      styles.methodCard,
                      active && styles.methodCardActive,
                      active && { borderColor: method.accent, backgroundColor: `${method.accent}12` },
                    ]}
                    onPress={() => toggleMethod(method.key)}
                  >
                    <View style={[styles.methodIconWrap, { backgroundColor: `${method.accent}16` }]}>
                      <Ionicons name={method.icon as any} size={18} color={method.accent} />
                    </View>
                    <View style={styles.methodTextWrap}>
                      <Text style={styles.methodLabel}>{method.label}</Text>
                      <Text style={styles.methodHint}>{active ? 'Included in checkout' : 'Tap to enable'}</Text>
                    </View>
                    <View style={[styles.checkPill, active && { backgroundColor: method.accent }]}>
                      <Ionicons name={active ? 'checkmark' : 'add'} size={14} color="#fff" />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}

        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Checkout Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Amount</Text>
            <Text style={styles.summaryValue}>{formatPhp(numericAmount, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Enabled methods</Text>
            <Text style={styles.summaryValue}>{selectedMethods.length}</Text>
          </View>
          <Text style={[styles.summaryLabel, { marginTop: 10 }]}>Receipt email</Text>
          <TextInput
            style={styles.summaryInput}
            placeholder="you@example.com"
            placeholderTextColor={Colors.textLight}
            value={receiptEmail}
            onChangeText={setReceiptEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <View style={styles.verifyRow}>
            <Switch value={verifiedDetails} onValueChange={setVerifiedDetails} />
            <Text style={styles.verifyText}>I verified the amount, payment methods, and receipt email.</Text>
          </View>
          <Text style={styles.summaryNote}>
            Your PayMongo secret key remains on the server. The app only receives a hosted checkout URL.
          </Text>
        </View>

        <TouchableOpacity style={[styles.payBtn, loading && styles.payBtnDisabled]} onPress={handlePay} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="lock-closed-outline" size={18} color="#fff" />
              <Text style={styles.payBtnText}>Continue to PayMongo Checkout</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 },
  heroCard: {
    backgroundColor: Colors.primaryDark,
    borderRadius: 22,
    padding: 18,
    marginBottom: 12,
  },
  heroEyebrow: { color: '#D7E1F4', fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  heroTitle: { color: '#fff', fontSize: 27, fontWeight: '800', marginTop: 6, lineHeight: 32 },
  heroSub: { color: '#D7E1F4', fontSize: 13, lineHeight: 19, marginTop: 8 },
  historyBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  historyBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E8EDF5',
    padding: 14,
    marginBottom: 12,
  },
  sectionTitle: { color: Colors.text, fontSize: 17, fontWeight: '800' },
  sectionSub: { color: Colors.textMuted, fontSize: 13, lineHeight: 18, marginTop: 4, marginBottom: 12 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  currencyBadge: {
    backgroundColor: `${Colors.primary}12`,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  currencyBadgeText: { color: Colors.primary, fontWeight: '800', fontSize: 13 },
  amountInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 18,
    fontWeight: '700',
    backgroundColor: '#fff',
    color: Colors.text,
  },
  methodList: { gap: 10 },
  methodCard: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  methodCardActive: {
    shadowColor: '#122951',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  methodIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodTextWrap: { flex: 1 },
  methodLabel: { color: Colors.text, fontSize: 14, fontWeight: '800' },
  methodHint: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  checkPill: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.textLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCard: {
    backgroundColor: '#EEF4FF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#D8E5FB',
    marginBottom: 14,
  },
  summaryTitle: { color: Colors.primaryDark, fontSize: 16, fontWeight: '800', marginBottom: 8 },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  summaryLabel: { color: Colors.textMuted, fontSize: 12, fontWeight: '700' },
  summaryValue: { color: Colors.text, fontSize: 14, fontWeight: '800' },
  summaryNote: { color: Colors.primaryDark, fontSize: 12, lineHeight: 18, marginTop: 8 },
  summaryInput: {
    borderWidth: 1,
    borderColor: '#D8E5FB',
    backgroundColor: '#fff',
    borderRadius: 12,
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  verifyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  verifyText: { color: Colors.primaryDark, fontSize: 12, flex: 1, lineHeight: 17 },
  payBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  payBtnDisabled: { opacity: 0.7 },
  payBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});

function resolveClientBackRoute(backTo?: string) {
  if (backTo === 'payroll') return '/payroll';
  return '/(client)/consultations';
}
