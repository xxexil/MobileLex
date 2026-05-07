
import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { FontAwesome5 } from '@expo/vector-icons';

const quickActions = [
  { label: 'Lawyers', icon: (color: string) => <Ionicons name="people" size={28} color={color || '#E53935'} />, color: '#E53935', onPress: () => {} },
  { label: 'Top Rated Lawyers', icon: (color: string) => <MaterialCommunityIcons name="star-circle" size={28} color={color || '#FBC02D'} />, color: '#FBC02D', onPress: () => {} },
  { label: 'Category', icon: (color: string) => <MaterialCommunityIcons name="apps" size={28} color={color || '#FB8C00'} />, color: '#FB8C00', onPress: () => {} },
  { label: 'Favorites', icon: (color: string) => <MaterialCommunityIcons name="heart" size={28} color={color || '#E53935'} />, color: '#E53935', onPress: () => {} },
  { label: 'Appointment', icon: (color: string) => <FontAwesome5 name="calendar-check" size={26} color={color || '#43A047'} />, color: '#43A047', onPress: () => {} },
  { label: 'Chat', icon: (color: string) => <Ionicons name="chatbubble-ellipses" size={28} color={color || '#1E88E5'} />, color: '#1E88E5', onPress: () => {} },
];


export default function HomeScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={styles.avatarCircle}>
          <Ionicons name="person" size={28} color="#B0B0B0" />
        </View>
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={styles.welcomeText}>Welcome Back,</Text>
          <Text style={styles.usernameText}>testing</Text>
        </View>
        <TouchableOpacity style={styles.iconButton}>
          <Ionicons name="notifications-outline" size={26} color="#B0B0B0" />
        </TouchableOpacity>
      </View>

      {/* Banner */}
      <View style={styles.bannerCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerTitle}>Hello Lawyer</Text>
          <Text style={styles.bannerDesc}>Connect with professional lawyers instantly and book online consultations at a budget, anytime and anywhere.</Text>
        </View>
        <View style={styles.bannerImagePlaceholder} />
      </View>

      {/* Quick Actions */}
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.quickActionsGrid}>
        {quickActions.map((action, idx) => (
          <TouchableOpacity
            key={action.label}
            style={styles.quickActionCard}
            activeOpacity={0.85}
            onPress={action.onPress}
          >
            <View style={[styles.quickActionIconCircle, { backgroundColor: action.color + '22' }]}> {/* subtle tint */}
              {action.icon(action.color)}
            </View>
            <Text style={styles.quickActionLabel}>{action.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Top Rated Lawyers */}
      <View style={styles.topRatedHeader}>
        <Text style={styles.sectionTitle}>Top Rated Lawyers</Text>
        <TouchableOpacity activeOpacity={0.7}>
          <Text style={styles.viewAll}>View All</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.lawyerCard}>
        <View style={styles.lawyerAvatarPlaceholder} />
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={styles.lawyerName}>Elisabeth</Text>
          <Text style={styles.lawyerSpec}>Immigration Law</Text>
        </View>
        <TouchableOpacity style={styles.bookButton} activeOpacity={0.8}>
          <Text style={styles.bookButtonText}>Book</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F8FA',
    paddingHorizontal: 18,
    paddingTop: 28,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 22,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  welcomeText: {
    color: '#888',
    fontSize: 13,
    marginBottom: 2,
  },
  usernameText: {
    color: '#222',
    fontWeight: '700',
    fontSize: 17,
    letterSpacing: 0.1,
  },
  iconButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  bannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181A1B',
    borderRadius: 18,
    padding: 20,
    marginBottom: 22,
    minHeight: 100,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.13,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  bannerImagePlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 12,
    marginLeft: 12,
    backgroundColor: '#333',
  },
  bannerTitle: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 18,
    marginBottom: 5,
    letterSpacing: 0.1,
  },
  bannerDesc: {
    color: '#fff',
    fontSize: 13,
    opacity: 0.85,
    lineHeight: 18,
  },
  // bannerImage removed
  sectionTitle: {
    fontWeight: '700',
    fontSize: 15.5,
    marginBottom: 12,
    color: '#222',
    letterSpacing: 0.1,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 22,
    gap: 8,
  },
  quickActionCard: {
    width: '30%',
    aspectRatio: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.09,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    padding: 8,
  },
  quickActionIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  quickActionLabel: {
    fontSize: 13,
    color: '#222',
    fontWeight: '500',
    textAlign: 'center',
    letterSpacing: 0.05,
  },
  topRatedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    marginTop: 2,
  },
  viewAll: {
    color: '#B71C1C',
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 0.05,
  },
  lawyerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 22,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.09,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  lawyerAvatarPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#ccc',
    marginRight: 2,
  },
  lawyerAvatar: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#eee',
  },
  lawyerName: {
    fontWeight: '700',
    fontSize: 15.5,
    color: '#222',
    letterSpacing: 0.05,
  },
  lawyerSpec: {
    color: '#888',
    fontSize: 13,
    marginTop: 2,
    letterSpacing: 0.03,
  },
  bookButton: {
    backgroundColor: '#B71C1C',
    borderRadius: 9,
    paddingVertical: 9,
    paddingHorizontal: 22,
    marginLeft: 8,
  },
  bookButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 0.05,
  },
});
