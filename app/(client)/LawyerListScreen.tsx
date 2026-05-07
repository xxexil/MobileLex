// This screen is superseded by app/(client)/lawyers.tsx which uses the live API.
// Redirect to the active lawyers screen so any lingering navigation links still work.
import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { Colors } from '@/constants/theme';

export default function LawyerListScreen() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/(client)/lawyers');
  }, []);
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
      <ActivityIndicator size="large" color={Colors.primary} />
    </View>
  );
}
