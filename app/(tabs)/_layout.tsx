import { Tabs } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Platform } from 'react-native';
import React from 'react';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: true,
        tabBarStyle: {
          height: 72,
          backgroundColor: '#fff',
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: 16,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.15,
          shadowRadius: 16,
          elevation: 24,
          borderTopWidth: 0,
          paddingBottom: Platform.OS === 'ios' ? 24 : 16,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          marginBottom: 4,
          fontWeight: '600',
        },
        tabBarActiveTintColor: '#B71C1C',
        tabBarInactiveTintColor: '#A0AEC0',
        tabBarIcon: ({ focused, color, size }) => {
          if (route.name === 'index') {
            return <Ionicons name={focused ? 'home' : 'home-outline'} size={24} color={color} />;
          } else if (route.name === 'lawyers') {
            return <MaterialCommunityIcons name={focused ? 'account-group' : 'account-group-outline'} size={24} color={color} />;
          } else if (route.name === 'appointment') {
            return <MaterialCommunityIcons name={focused ? 'calendar-check' : 'calendar-check-outline'} size={24} color={color} />;
          } else if (route.name === 'chat') {
            return <Ionicons name={focused ? 'chatbubble' : 'chatbubble-outline'} size={24} color={color} />;
          } else if (route.name === 'profile') {
            return <Ionicons name={focused ? 'person' : 'person-outline'} size={24} color={color} />;
          }
          return null;
        },
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="lawyers" options={{ title: 'Lawyers' }} />
      <Tabs.Screen name="appointment" options={{ title: 'Appointment' }} />
      <Tabs.Screen name="chat" options={{ title: 'Chat' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
