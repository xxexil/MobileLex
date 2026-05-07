import { Redirect } from 'expo-router';

export default function ForgotPasswordNativeFallback() {
  return <Redirect href="/(auth)/forgot-password" />;
}
