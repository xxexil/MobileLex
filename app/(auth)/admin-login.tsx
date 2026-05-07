import { Redirect } from 'expo-router';

export default function AdminLoginRedirect() {
  return <Redirect href="/(auth)/login" />;
}
