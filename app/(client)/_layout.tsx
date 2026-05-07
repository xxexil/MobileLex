import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, BackHandler } from 'react-native';
import { Tabs, useRouter, useSegments } from 'expo-router';
import { RoleColors } from '@/constants/theme';
import { clientApi } from '@/services/api';
import { useNotifications } from '@/context/notifications';
import RequireRole from '@/components/RequireRole';
import AnimatedTabIcon from '@/components/navigation/AnimatedTabIcon';
import AnimatedTabBarButton from '@/components/navigation/AnimatedTabBarButton';

export default function ClientLayout() {
  const router = useRouter();
  const segments = useSegments();
  const {
    unreadClient,
    setUnreadClient,
    refreshClientUnreadTick,
  } = useNotifications();
  const unreadCount = unreadClient > 0 ? unreadClient : undefined;
  const [consultationAlertCount, setConsultationAlertCount] = useState(0);
  const consultationBadge = consultationAlertCount > 0 ? consultationAlertCount : undefined;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchNavBadges = useCallback(async () => {
    const [messagesResult, consultationsResult] = await Promise.allSettled([
      clientApi.unreadCount(),
      clientApi.consultations(),
    ]);

    if (messagesResult.status === 'fulfilled') {
      const { data } = messagesResult.value;
      const convs: { unread?: number }[] = Array.isArray(data) ? data : [];
      const total = convs.reduce((sum, c) => sum + (c.unread ?? 0), 0);
      setUnreadClient(total);
    }

    if (consultationsResult.status === 'fulfilled') {
      const data = consultationsResult.value?.data;
      const consultations: { status?: string }[] = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      const activeCount = consultations.reduce((sum, item) => {
        const status = String(item?.status ?? '').toLowerCase();
        return status === 'pending' || status === 'upcoming' ? sum + 1 : sum;
      }, 0);
      setConsultationAlertCount(activeCount);
    }
  }, [setUnreadClient]);

  useEffect(() => {
    fetchNavBadges();
    intervalRef.current = setInterval(fetchNavBadges, 15_000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') fetchNavBadges();
    });
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      sub.remove();
    };
  }, [fetchNavBadges, refreshClientUnreadTick]);

  useEffect(() => {
    const activeRoute = segments[0] === '(client)' ? segments[1] ?? 'index' : segments[0] ?? 'index';
    const isDashboard = activeRoute === 'index';

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isDashboard) return false;
      if (activeRoute === 'settings') {
        router.replace('/(client)/profile' as any);
        return true;
      }
      router.replace('/(client)' as any);
      return true;
    });

    return () => subscription.remove();
  }, [router, segments]);

  return (
    <RequireRole allowed={['client']}>
      <Tabs
        backBehavior="firstRoute"
        screenOptions={{
          headerShown: false,
          tabBarHideOnKeyboard: true,
          tabBarStyle: {
            backgroundColor: RoleColors.client.shell,
            borderTopWidth: 0,
            borderRadius: 22,
            height: 66,
            left: 12,
            right: 12,
            bottom: 10,
            position: 'absolute',
            paddingBottom: 8,
            paddingTop: 6,
            paddingHorizontal: 8,
            elevation: 12,
            shadowColor: '#091226',
            shadowOpacity: 0.22,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 8 },
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.1)',
          },
          tabBarActiveTintColor: RoleColors.client.accent,
          tabBarInactiveTintColor: 'rgba(255,255,255,0.5)',
          tabBarShowLabel: true,
          tabBarLabelStyle: { fontWeight: '800', fontSize: 10, marginBottom: 0 },
          tabBarItemStyle: { paddingVertical: 0 },
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
          name="lawyers"
          options={{
            title: 'Find Lawyer',
            tabBarIcon: ({ focused, color, size }) => (
              <AnimatedTabIcon focused={focused} name="search" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="consultations"
          options={{
            title: 'Consultations',
            tabBarBadge: consultationBadge,
            tabBarBadgeStyle: { backgroundColor: RoleColors.client.accent, color: '#fff', fontSize: 10 },
            tabBarIcon: ({ focused, color, size }) => (
              <AnimatedTabIcon focused={focused} name="calendar" size={size} color={color} />
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
            tabBarBadgeStyle: { backgroundColor: RoleColors.client.accent, color: '#fff', fontSize: 10 },
            tabBarIcon: ({ focused, color, size }) => (
              <AnimatedTabIcon focused={focused} name="chatbubbles" size={size} color={color} />
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

        {/* Keep secondary screens in the client stack but out of the bottom tab bar. */}
        <Tabs.Screen name="notifications" options={{ href: null }} />
        <Tabs.Screen name="BookingConfirmationScreen" options={{ href: null }} />
        <Tabs.Screen name="group-chat" options={{ href: null }} />
        <Tabs.Screen name="group-chats-tab" options={{ href: null }} />
        <Tabs.Screen name="LawyerListScreen" options={{ href: null }} />
        <Tabs.Screen name="payments" options={{ href: null }} />
        <Tabs.Screen name="PaymentScreen" options={{ href: null }} />
        <Tabs.Screen name="WalletScreen" options={{ href: null }} />
        <Tabs.Screen name="availability-tracker" options={{ href: null }} />
        <Tabs.Screen name="video-call" options={{ href: null, tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
      </Tabs>
    </RequireRole>
  );
}
