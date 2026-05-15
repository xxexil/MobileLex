import { Tabs } from 'expo-router';
import RequireRole from '@/components/RequireRole';
import { RoleColors } from '@/constants/theme';
import AnimatedTabIcon from '@/components/navigation/AnimatedTabIcon';
import AnimatedTabBarButton from '@/components/navigation/AnimatedTabBarButton';

export default function AdminLayout() {
  return (
    <RequireRole allowed={['admin']} redirectTo="/(auth)/login">
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: RoleColors.admin.shell,
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
          tabBarActiveTintColor: RoleColors.admin.accent,
          tabBarInactiveTintColor: 'rgba(255,255,255,0.52)',
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
              <AnimatedTabIcon focused={focused} name="grid-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="all-users"
          options={{
            title: 'All Users',
            tabBarIcon: ({ focused, color, size }) => (
              <AnimatedTabIcon focused={focused} name="people-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="lawyers"
          options={{
            title: 'Lawyers',
            tabBarIcon: ({ focused, color, size }) => (
              <AnimatedTabIcon focused={focused} name="briefcase-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="law-firms"
          options={{
            title: 'Law Firms',
            tabBarIcon: ({ focused, color, size }) => (
              <AnimatedTabIcon focused={focused} name="business-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="consultations"
          options={{
            title: 'Consultations',
            tabBarIcon: ({ focused, color, size }) => (
              <AnimatedTabIcon focused={focused} name="calendar-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="fraud-review"
          options={{
            title: 'Fraud Review',
            tabBarIcon: ({ focused, color, size }) => (
              <AnimatedTabIcon focused={focused} name="shield-checkmark-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="utility"
          options={{
            title: 'Utility',
            tabBarIcon: ({ focused, color, size }) => (
              <AnimatedTabIcon focused={focused} name="construct-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen name="users" options={{ href: null }} />
        <Tabs.Screen name="system" options={{ href: null }} />
      </Tabs>
    </RequireRole>
  );
}
