import { useEffect, useRef, useState } from 'react';
import { AppState, BackHandler } from 'react-native';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { Ionicons as IoniconsBase } from '@expo/vector-icons';
import { RoleColors } from '@/constants/theme';
import { lawFirmApi } from '@/services/api';
import { useNotifications } from '@/context/notifications';
import RequireRole from '@/components/RequireRole';
import AnimatedTabIcon from '@/components/navigation/AnimatedTabIcon';
import AnimatedTabBarButton from '@/components/navigation/AnimatedTabBarButton';

const Ionicons = IoniconsBase as any;

export default function LawFirmLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const {
    unreadLawFirm,
    setUnreadLawFirm,
    refreshLawFirmUnreadTick,
  } = useNotifications();
  const unreadCount = unreadLawFirm > 0 ? unreadLawFirm : undefined;
  const [consultationAlertCount, setConsultationAlertCount] = useState(0);
  const consultationBadge = consultationAlertCount > 0 ? consultationAlertCount : undefined;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchUnread = async () => {
    try {
      const [messagesResult, consultationsResult] = await Promise.allSettled([
        lawFirmApi.conversations(),
        lawFirmApi.consultations(),
      ]);

      const messageData = messagesResult.status === 'fulfilled' ? messagesResult.value.data : [];
      const convs: { unread?: number }[] = Array.isArray(messageData)
        ? messageData
        : Array.isArray((messageData as any)?.data)
        ? (messageData as any).data
        : [];
      const total = convs.reduce((sum, c) => sum + Number(c.unread ?? 0), 0);
      setUnreadLawFirm(total);

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
  }, [refreshLawFirmUnreadTick]);

  useEffect(() => {
    const isDashboard = pathname === '/'
      || pathname === '/index'
      || pathname === '/(lawfirm)'
      || pathname === '/(lawfirm)/'
      || pathname === '/(lawfirm)/index';
    const isSettings = pathname === '/settings' || pathname === '/(lawfirm)/settings';
    const isProfile = pathname === '/profile' || pathname === '/(lawfirm)/profile';

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isDashboard) return false;
      if (isSettings) {
        router.replace('/(lawfirm)/profile' as any);
        return true;
      }
      if (isProfile) {
        router.replace('/(lawfirm)' as any);
        return true;
      }
      router.replace('/(lawfirm)' as any);
      return true;
    });

    return () => subscription.remove();
  }, [pathname, router]);

  return (
    <RequireRole allowed={['law_firm']}>
      <Tabs
        backBehavior="none"
        screenOptions={{
          headerShown: false,
          tabBarHideOnKeyboard: true,
          tabBarStyle: {
            backgroundColor: RoleColors.lawFirm.shell,
            borderTopWidth: 0,
            borderRadius: 26,
            height: 74,
            left: 12,
            right: 12,
            bottom: 12,
            position: 'absolute',
            paddingTop: 8,
            paddingBottom: 10,
            paddingHorizontal: 8,
            elevation: 16,
            shadowColor: '#091226',
            shadowOpacity: 0.24,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 10 },
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.1)',
          },
          tabBarActiveTintColor: RoleColors.lawFirm.accent,
          tabBarInactiveTintColor: 'rgba(255,255,255,0.5)',
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
              <AnimatedTabIcon focused={focused} name="business" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="team"
          options={{
            title: 'Team',
            tabBarIcon: ({ focused, color, size }) => (
              <AnimatedTabIcon focused={focused} name="people" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="consultations"
          options={{
            title: 'Consultations',
            tabBarBadge: consultationBadge,
            tabBarBadgeStyle: { backgroundColor: RoleColors.lawFirm.accent, color: '#fff', fontSize: 10 },
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
            tabBarBadgeStyle: { backgroundColor: RoleColors.lawFirm.accent, color: '#fff', fontSize: 10 },
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
          name="profile"
          options={{
            title: 'Firm Profile',
            tabBarIcon: ({ focused, color, size }) => (
              <AnimatedTabIcon focused={focused} name="business" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen name="notifications" options={{ href: null, headerShown: false }} />
        <Tabs.Screen name="settings" options={{ href: null, headerShown: false }} />
      </Tabs>
    </RequireRole>
  );
}
