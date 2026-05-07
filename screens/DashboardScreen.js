function getGreetingTime() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Morning';
  if (hour < 18) return 'Afternoon';
  return 'Evening';
}
import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/auth';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity } from 'react-native';
import { clientApi } from '../services/api';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';
import ChatInput from '../components/ChatInput';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

export default function DashboardScreen() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ totalConsultations: 0, lawyers: 0, unreadMessages: 0 });
  const [totalSpent, setTotalSpent] = useState(0);
  const ws = useRef(null);
  useEffect(() => {
    clientApi.dashboard().then(res => {
      setTotalSpent(res.data?.total_spent ?? 0);
      setStats({
        totalConsultations: res.data?.stats?.total ?? 0,
        lawyers: res.data?.stats?.lawyers ?? 0,
        unreadMessages: res.data?.unread_messages ?? 0,
      });
    });
  }, []);

  // RENDER DASHBOARD UI
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContentMain} showsVerticalScrollIndicator={false}>
        {/* Header Banner and Stats */}
        <View style={styles.heroBanner}>
          <View style={styles.heroTextWrap}>
            <Text style={styles.heroWelcome}>Welcome back,</Text>
            <Text style={styles.heroName}>{user?.name || 'User'}</Text>
            <Text style={styles.heroSub}>Here's your legal services overview for today</Text>
          </View>
          <View style={styles.heroBadgeCard}>
            <Text style={styles.heroBadgeAmount}>₱{Number(totalSpent).toLocaleString()}</Text>
            <Text style={styles.heroBadgeLabel}>Total Spent</Text>
            <Text style={styles.heroBadgeSub}>this month</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <View style={styles.statIconWrap}>
              <Ionicons name="videocam" size={22} color={Colors.primary} />
            </View>
            <View style={styles.statTextBlock}>
              <Text style={styles.statValue}>{stats.totalConsultations}</Text>
              <Text style={styles.statLabel} numberOfLines={1} ellipsizeMode="tail">Total Consultations</Text>
            </View>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIconWrap, { backgroundColor: '#FDF6EC' }] }>
              <Ionicons name="person" size={22} color={Colors.secondary} />
            </View>
            <View style={styles.statTextBlock}>
              <Text style={styles.statValue}>{stats.lawyers}</Text>
              <Text style={styles.statLabel} numberOfLines={1} ellipsizeMode="tail">Lawyers</Text>
            </View>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIconWrap, { backgroundColor: '#ECFDF5' }] }>
              <Ionicons name="chatbubble-ellipses" size={22} color={Colors.success} />
            </View>
            <View style={styles.statTextBlock}>
              <Text style={styles.statValue}>{stats.unreadMessages}</Text>
              <Text style={styles.statLabel} numberOfLines={1} ellipsizeMode="tail">Unread Messages</Text>
            </View>
          </View>
        </View>
              <View style={styles.searchBarWrap}>
                <Ionicons name="search" size={20} color="#AEB1B7" style={{ marginRight: 8 }} />
                <Text style={styles.searchBarText}>Find a lawyer, topic, or service...</Text>
              </View>

              {/* Service Cards (no images) */}
              <View style={styles.card}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>Chat With a Lawyer</Text>
                  <Text style={styles.cardDesc}>Connect instantly with an attorney</Text>
                  <TouchableOpacity style={styles.cardButton}>
                    <Ionicons name="chatbubble-ellipses-outline" size={18} color="#2D3A70" />
                    <Text style={styles.cardButtonText}>Start Chat</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.card}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>Schedule a Consultation</Text>
                  <Text style={styles.cardDesc}>Book a video consultation with a lawyer</Text>
                  <TouchableOpacity style={styles.cardButton}>
                    <Ionicons name="calendar-outline" size={18} color="#2D3A70" />
                    <Text style={styles.cardButtonText}>Schedule</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Recent Topics */}
              <Text style={styles.sectionTitle}>Recent Topics</Text>
              <View style={styles.topicsRow}>
                <TopicPill label="Landlord & Tenants" icon="home-outline" />
                <TopicPill label="Employment Law" icon="briefcase-outline" />
                <TopicPill label="Divorce & Family Law" icon="people-outline" />
              </View>
            </ScrollView>
          </SafeAreaView>
        );
}

function TopicPill({ label, icon }) {
  return (
    <TouchableOpacity style={styles.topicPill}>
      <Ionicons name={icon} size={16} color="#2D3A70" style={{ marginRight: 6 }} />
      <Text style={styles.topicText}>{label}</Text>
    </TouchableOpacity>
  );
}

function NavIcon({ icon, label, active }) {
  return (
    <TouchableOpacity style={[styles.navIcon, active && styles.navIconActive]}>
      <Ionicons name={icon} size={22} color={active ? '#fff' : '#2D3A70'} />
      <Text style={[styles.navLabel, active && { color: '#fff' }]}>{label}</Text>
    </TouchableOpacity>
  );
}

async function handleFileUpload(file) {
  const formData = new FormData();
  formData.append('file', {
    uri: file.uri,
    name: file.name,
    type: file.mimeType || 'application/octet-stream',
  });
  try {
    const response = await fetch('http://192.168.110.138:8000/api/upload', {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    const data = await response.json();
    if (response.ok) {
      alert('File uploaded and encrypted!');
    } else {
      alert(data.error || 'Upload failed');
    }
  } catch (err) {
    alert('Upload error: ' + err.message);
  }
}

async function handleFileDownload(filename) {
  const url = `http://192.168.110.138:8000/api/download/${filename}`;
  const fileUri = FileSystem.documentDirectory + filename.replace('.enc', '');
  try {
    const downloadResumable = FileSystem.createDownloadResumable(url, fileUri);
    const { uri } = await downloadResumable.downloadAsync();
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      await Sharing.shareAsync(uri);
    } else {
      alert('Downloaded to: ' + uri);
    }
  } catch (err) {
    alert('Download error: ' + err.message);
  }
}

// WebSocket connection (replace with your server IP)
const ws = useRef(null);
if (!ws.current) {
  ws.current = new WebSocket('ws://192.168.110.138:4050');
}

function sendFileRealtime(file, recipientId) {
  const chunkSize = 32 * 1024; // 32KB
  const reader = new FileReader();
  let offset = 0;
  function readChunk() {
    const slice = file.slice(offset, offset + chunkSize);
    reader.readAsArrayBuffer(slice);
  }
  reader.onload = () => {
    const chunk = reader.result;
    ws.current.send(JSON.stringify({
      type: 'file',
      file: {
        name: file.name,
        size: file.size,
        type: file.type,
        chunk: Buffer.from(chunk).toString('base64'),
        chunkIndex: Math.floor(offset / chunkSize),
        totalChunks: Math.ceil(file.size / chunkSize),
      },
      recipientId,
    }));
    offset += chunkSize;
    if (offset < file.size) readChunk();
  };
  readChunk();
}

// File chunk buffer for incoming files
const fileChunks = useRef({}); // { [fileName]: { chunks: [], totalChunks, received, type } }
const [fileProgress, setFileProgress] = useState({}); // { [fileName]: percent }

useEffect(() => {
  if (!ws.current) return;
  ws.current.onmessage = async (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'file' && data.file) {
      const { name, chunk, chunkIndex, totalChunks, type } = data.file;
      if (!fileChunks.current[name]) {
        fileChunks.current[name] = { chunks: [], totalChunks, received: 0, type };
      }
      fileChunks.current[name].chunks[chunkIndex] = chunk;
      fileChunks.current[name].received += 1;
      // Update progress
      setFileProgress(prev => ({
        ...prev,
        [name]: Math.round((fileChunks.current[name].received / totalChunks) * 100)
      }));
      // When all chunks are received
      if (fileChunks.current[name].received === totalChunks) {
        const allChunks = fileChunks.current[name].chunks.map(c => Buffer.from(c, 'base64'));
        const blob = new Blob(allChunks, { type });
        const fileUri = FileSystem.documentDirectory + name;
        const arrayBuffer = await blob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        await FileSystem.writeAsStringAsync(fileUri, Buffer.from(uint8Array).toString('base64'), { encoding: FileSystem.EncodingType.Base64 });
        await Sharing.shareAsync(fileUri);
          // Only schedule notification if not running in Expo Go
          if (!Constants.appOwnership || Constants.appOwnership !== 'expo') {
            await Notifications.scheduleNotificationAsync({
              content: {
                title: 'File Transfer Complete',
                body: `${name} has been received and saved.`,
              },
              trigger: null,
            });
          }
        delete fileChunks.current[name];
        setFileProgress(prev => {
          const updated = { ...prev };
          delete updated[name];
          return updated;
        });
      }
    }
    if (data.type === 'message' && data.message) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'New Message',
          body: data.message.text || 'You have a new message.',
        },
        trigger: null,
      });
    }
  };
}, []);

// To send: sendFileRealtime(file, recipientId)
// To receive: handle 'file' type in ws.onmessage

const styles = StyleSheet.create({
  searchBarWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginHorizontal: 20,
    marginBottom: 18,
    marginTop: 2,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  searchBarText: {
    color: '#AEB1B7',
    fontSize: 15,
    fontWeight: '500',
    flex: 1,
  },
  statTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  headerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    marginBottom: 2,
  },
  headerTextBlock: {
    flex: 1,
  },
  greetingMain: {
    fontSize: 22,
    fontWeight: '700',
    color: '#2D3A70',
    marginBottom: 0,
    letterSpacing: 0.1,
  },
  greetingName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#25345D',
    marginBottom: 2,
    letterSpacing: 0.2,
  },
  subtextMain: {
    fontSize: 14,
    color: '#6B7A90',
    marginBottom: 0,
  },
  headerNotifBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#EAF0F8',
    marginLeft: 10,
  },
  headlineMain: {
    fontSize: 24,
    fontWeight: '800',
    color: '#2D3A70',
    marginLeft: 20,
    marginTop: 8,
    marginBottom: 16,
    letterSpacing: 0.1,
  },
  scrollContentMain: {
    paddingBottom: 120,
    paddingTop: 2,
  },
  heroBanner: {
    backgroundColor: '#25345D',
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 24,
    margin: 16,
    marginBottom: 18,
  },
  heroTextWrap: {
    flex: 1,
  },
  heroWelcome: {
    color: '#B6C2DF',
    fontSize: 15,
    marginBottom: 2,
  },
  heroName: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  heroSub: {
    color: '#B6C2DF',
    fontSize: 15,
  },
  heroBadgeCard: {
    backgroundColor: '#31416B',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 28,
    alignItems: 'center',
    minWidth: 150,
    borderWidth: 1,
    borderColor: '#4B5A7A',
  },
  heroBadgeAmount: {
    color: '#fff',
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  heroBadgeLabel: {
    color: '#B6C2DF',
    fontSize: 16,
    marginBottom: 2,
  },
  heroBadgeSub: {
    color: '#34D399',
    fontSize: 14,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 18,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginHorizontal: 4,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  statIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#EEF2F8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  statValue: {
    color: '#25345D',
    fontSize: 22,
    fontWeight: 'bold',
  },
  statLabel: {
    color: '#25345D',
    fontSize: 14,
    marginTop: 2,
    fontWeight: '500',
  },
  statSub: {
    color: '#34D399',
    fontSize: 13,
    marginTop: 2,
    fontWeight: '600',
  },
  container: { flex: 1, backgroundColor: '#F6F8F7' },
  // ...existing code...
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EAF0F8', borderRadius: 18, padding: 18, marginHorizontal: 20, marginBottom: 18, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: '#2D3A70', marginBottom: 4 },
  cardDesc: { fontSize: 13, color: '#6B7A90', marginBottom: 10 },
  cardButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 20, paddingVertical: 7, paddingHorizontal: 18, alignSelf: 'flex-start', marginTop: 2, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 },
  cardButtonText: { color: '#2D3A70', fontWeight: '700', fontSize: 14, marginLeft: 6 },
  cardImage: { width: 60, height: 60, borderRadius: 16, marginLeft: 18 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#2D3A70', marginLeft: 20, marginBottom: 10 },
  topicsRow: { flexDirection: 'row', gap: 10, marginHorizontal: 20, marginBottom: 30 },
  topicPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 18, paddingVertical: 8, paddingHorizontal: 14, marginRight: 8, shadowColor: '#000', shadowOpacity: 0.02, shadowRadius: 2, elevation: 1 },
  topicText: { color: '#2D3A70', fontWeight: '600', fontSize: 13 },
  bottomNav: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', height: 64, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E6E6E6', position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 18, borderTopRightRadius: 18, elevation: 8 },
  navIcon: { alignItems: 'center', flex: 1, paddingVertical: 8 },
  navIconActive: { backgroundColor: '#2D3A70', borderRadius: 16 },
  navLabel: { fontSize: 11, color: '#2D3A70', marginTop: 2, fontWeight: '600' },
  progressContainer: { margin: 8 },
  progressText: { color: '#2D3A70', fontSize: 13, marginBottom: 2 },
  progressBarBg: { height: 8, backgroundColor: '#eee', borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: 8, backgroundColor: '#5f5a7d', borderRadius: 4 },
  notificationBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#FF3B30',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    zIndex: 10,
  },
  notificationBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
});
