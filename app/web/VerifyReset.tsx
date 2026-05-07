import { Redirect } from 'expo-router';

export default function VerifyResetNativeFallback() {
  return <Redirect href="/(auth)/verify-reset" />;
}
