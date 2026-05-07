import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';

const slides = [
  {
    key: 'welcome',
    title: 'Welcome to LexConnect',
    description: 'Connect with lawyers and clients easily, securely, and efficiently.',
    image: require('@/assets/images/icon.png'),
  },
  {
    key: 'chat',
    title: 'Chat & Consult',
    description: 'Message, consult, and manage your legal needs in one place.',
    image: require('@/assets/images/splash-icon.png'),
  },
  {
    key: 'secure',
    title: 'Secure & Private',
    description: 'Your data and conversations are always protected.',
    image: require('@/assets/images/favicon.png'),
  },
];

export default function OnboardingScreen() {
  const [index, setIndex] = React.useState(0);
  const router = useRouter();
  const slide = slides[index];

  return (
    <View style={styles.container}>
      <Image source={slide.image} style={styles.image} resizeMode="contain" />
      <Text style={styles.title}>{slide.title}</Text>
      <Text style={styles.description}>{slide.description}</Text>
      <View style={styles.dots}>
        {slides.map((_, i) => (
          <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>
      <TouchableOpacity
        style={styles.button}
        onPress={() => {
          if (index < slides.length - 1) setIndex(index + 1);
          else router.replace('/(auth)/login');
        }}
        accessibilityLabel={index < slides.length - 1 ? 'Next' : 'Get Started'}
      >
        <Text style={styles.buttonText}>{index < slides.length - 1 ? 'Next' : 'Get Started'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', padding: 24 },
  image: { width: 240, height: 240, marginBottom: 32 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 12, color: Colors.primary, textAlign: 'center' },
  description: { fontSize: 16, color: Colors.textMuted, textAlign: 'center', marginBottom: 32 },
  dots: { flexDirection: 'row', marginBottom: 24 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#eee', marginHorizontal: 4 },
  dotActive: { backgroundColor: Colors.primary },
  button: { backgroundColor: Colors.primary, borderRadius: 8, paddingHorizontal: 32, paddingVertical: 14 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
