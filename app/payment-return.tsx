import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Colors } from '@/constants/theme';

export default function PaymentReturnScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ result?: string; consultation_id?: string }>();

  useEffect(() => {
    const timer = setTimeout(() => {
      if (router.canGoBack()) {
        router.back();
        return;
      }

      router.replace({
        pathname: '/(client)/consultations',
        params: {
          ...(params.consultation_id ? { consultationId: String(params.consultation_id) } : {}),
          fromPaymentReturn: params.result || '1',
        },
      } as any);
    }, 150);

    return () => clearTimeout(timer);
  }, [params.consultation_id, params.result, router]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background }}>
      <ActivityIndicator size="large" color={Colors.primary} />
    </View>
  );
}
