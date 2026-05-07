import { Redirect } from 'expo-router';

export default function ForgotPasswordFlowNativeFallback() {
  return <Redirect href="/(auth)/forgot-password" />;
}
