import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, View, Platform } from 'react-native';
import HomeScreen from '../app/(tabs)/index';
import ExploreScreen from '../app/(tabs)/explore';
// Import other main screens as needed

const Tab = createBottomTabNavigator();

export default function BottomTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: true,
        tabBarStyle: styles.tabBar,
        tabBarIcon: ({ focused, color, size }) => {
          if (route.name === 'Home') {
            return <Ionicons name={focused ? 'home' : 'home-outline'} size={24} color={color} />;
          } else if (route.name === 'Explore') {
            return <MaterialCommunityIcons name={focused ? 'compass' : 'compass-outline'} size={24} color={color} />;
          }
          return null;
        },
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarActiveTintColor: '#2B6CB0',
        tabBarInactiveTintColor: '#A0AEC0',
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Explore" component={ExploreScreen} />
      {/* Add more main routes here, remove any extra/hidden tabs */}
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    height: 72,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
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
  tabBarLabel: {
    fontSize: 12,
    marginBottom: 4,
    fontWeight: '600',
  },
});
