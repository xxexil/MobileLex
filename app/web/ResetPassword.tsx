import { Redirect } from 'expo-router';

export default function ResetPasswordNativeFallback() {
  return <Redirect href="/(auth)/reset-password" />;
}
