import { useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, Platform } from 'react-native';
import { Tabs, useRouter, useSegments } from 'expo-router';
import { RoleColors } from '@/constants/theme';
import { lawyerApi } from '@/services/api';
import { useNotifications } from '@/context/notifications';
import RequireRole from '@/components/RequireRole';
import AnimatedTabIcon from '@/components/navigation/AnimatedTabIcon';
import AnimatedTabBarButton from '@/components/navigation/AnimatedTabBarButton';

export default function LawyerLayout() {
  const router = useRouter();
  const segments = useSegments();
  const {
    unreadLawyer,
    setUnreadLawyer,
    refreshLawyerUnreadTick,
  } = useNotifications();
  const unreadCount = unreadLawyer > 0 ? unreadLawyer : undefined;
  const [consultationAlertCount, setConsultationAlertCount] = useState(0);
  const consultationBadge = consultationAlertCount > 0 ? consultationAlertCount : undefined;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchUnread = async () => {
    try {
      const [messagesResult, consultationsResult] = await Promise.allSettled([
        lawyerApi.unreadCount(),
        lawyerApi.consultations(),
      ]);

      const messageData = messagesResult.status === 'fulfilled' ? messagesResult.value.data : [];
      const convs: { unread?: number }[] = Array.isArray(messageData) ? messageData : [];
      const total = convs.reduce((sum, c) => sum + (c.unread ?? 0), 0);
      setUnreadLawyer(total);

      if (consultationsResult.status === 'fulfilled') {
        const payload = consultationsResult.value?.data;
        const consultations: { status?: string }[] = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
        const active = consultations.reduce((sum, item) => {
          const status = String(item?.status ?? '').toLowerCase();
          return status === 'pending' || status === 'upcoming' ? sum + 1 : sum;
        }, 0);
        setConsultationAlertCount(active);
      }
    } catch {
      // silently ignore
    }
  };

  useEffect(() => {
    fetchUnread();
    intervalRef.current = setInterval(fetchUnread, 15_000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') fetchUnread();
    });
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      sub.remove();
    };
  }, [refreshLawyerUnreadTick]);

  useEffect(() => {
    const activeRoute = segments[0] === '(lawyer)' ? segments[1] ?? 'index' : segments[0] ?? 'index';
    const isDashboard = activeRoute === 'index';

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isDashboard) return false;
      if (activeRoute === 'settings') {
        router.replace('/(lawyer)/profile' as any);
        return true;
      }
      router.replace('/(lawyer)' as any);
      return true;
    });

    return () => subscription.remove();
  }, [router, segments]);

  return (
    <RequireRole allowed={['lawyer']}>
      <Tabs
        backBehavior="firstRoute"
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: RoleColors.lawyer.accent,
          tabBarInactiveTintColor: 'rgba(255,255,255,0.5)',
          tabBarStyle: {
            backgroundColor: RoleColors.lawyer.shell,
            borderTopWidth: 0,
            borderRadius: 26,
            left: 12,
            right: 12,
            bottom: 12,
            position: 'absolute',
            paddingBottom: Platform.OS === 'ios' ? 12 : 10,
            paddingTop: 8,
            paddingHorizontal: 8,
            height: Platform.OS === 'ios' ? 86 : 74,
            elevation: 16,
            shadowColor: '#091226',
            shadowOpacity: 0.24,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 10 },
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.1)',
          },
          tabBarHideOnKeyboard: true,
          tabBarLabelStyle: { fontWeight: '800', fontSize: 10.5, marginBottom: 2 },
          tabBarItemStyle: { paddingVertical: 2 },
          tabBarButton: (props) => <AnimatedTabBarButton {...props} />,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Dashboard',
            tabBarIcon: ({ focused, color, size }) => (
              <AnimatedTabIcon focused={focused} name="home" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="consultations"
          options={{
            title: 'Cases',
            tabBarBadge: consultationBadge,
            tabBarBadgeStyle: { backgroundColor: RoleColors.lawyer.accent, color: '#fff', fontSize: 10 },
            tabBarIcon: ({ focused, color, size }) => (
              <AnimatedTabIcon focused={focused} name="briefcase" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="messages"
          listeners={({ navigation }) => ({
            tabPress: () => {
              if (!navigation.isFocused()) return;
              router.setParams({ resetThreadAt: String(Date.now()) });
            },
          })}
          options={{
            title: 'Messages',
            tabBarBadge: unreadCount,
            tabBarBadgeStyle: { backgroundColor: RoleColors.lawyer.accent, color: '#fff', fontSize: 10 },
            tabBarIcon: ({ focused, color, size }) => (
              <AnimatedTabIcon focused={focused} name="chatbubbles" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="earnings"
          options={{
            title: 'Earnings',
            tabBarIcon: ({ focused, color, size }) => (
              <AnimatedTabIcon focused={focused} name="cash" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="firm"
          options={{
            title: 'My Firm',
            tabBarIcon: ({ focused, color, size }) => (
              <AnimatedTabIcon focused={focused} name="business" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ focused, color, size }) => (
              <AnimatedTabIcon focused={focused} name="person" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen name="notifications" options={{ href: null, headerShown: false }} />
        <Tabs.Screen name="settings" options={{ href: null, headerShown: false }} />
        <Tabs.Screen name="availability" options={{ href: null, headerShown: false }} />
        {/* Hidden screens — accessible via push, not shown in tab bar */}
        <Tabs.Screen name="video-call" options={{ href: null, headerShown: false, tabBarStyle: { display: 'none' } }} />
      </Tabs>
    </RequireRole>
  );
}
