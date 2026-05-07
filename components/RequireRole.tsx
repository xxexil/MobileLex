import { ReactNode, useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { useAuth } from '@/context/auth';
import { Colors } from '@/constants/theme';

type AllowedRole = 'client' | 'lawyer' | 'law_firm' | 'admin';

type RequireRoleProps = {
  allowed: AllowedRole[];
  redirectTo?: '/(auth)/login';
  children: ReactNode;
};

function getHomeRouteByRole(role: AllowedRole): '/(client)' | '/(lawyer)' | '/(lawfirm)' | '/(admin)' {
  if (role === 'client') return '/(client)';
  if (role === 'lawyer') return '/(lawyer)';
  if (role === 'law_firm') return '/(lawfirm)';
  return '/(admin)';
}

export default function RequireRole({
  allowed,
  redirectTo = '/(auth)/login',
  children,
}: RequireRoleProps) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (isLoading) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!user) {
      if (!inAuthGroup) router.replace(redirectTo);
      return;
    }
    if (!allowed.includes(user.role)) {
      router.replace(getHomeRouteByRole(user.role));
    }
  }, [allowed, isLoading, redirectTo, router, segments, user]);

  if (isLoading || !user || !allowed.includes(user.role)) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.primary }}>
        <ActivityIndicator size="large" color={Colors.secondary} />
      </View>
    );
  }

  return <>{children}</>;
}
