import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

export default function LexiAIConsultant() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Image
          source={{ uri: 'https://cdn.dribbble.com/userupload/14228241/file/original-2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e.png?resize=400x0' }}
          style={styles.avatar}
        />
        <Text style={styles.title}>LexiAI</Text>
        <Text style={styles.subtitle}>Legal Consultant</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>How can I help you today?</Text>
        <TouchableOpacity style={styles.button}>
          <Text style={styles.buttonText}>Ask a Legal Question</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.secondaryButton]}>
          <Text style={[styles.buttonText, styles.secondaryButtonText]}>Browse Topics</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.footer}>
        <Text style={styles.footerText}>Powered by AI • Secure & Confidential</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F6F7FB',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    marginBottom: 16,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#E0E4EA',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#2B2D42',
  },
  subtitle: {
    fontSize: 18,
    color: '#8D99AE',
    marginTop: 4,
  },
  card: {
    width: width - 48,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
    marginBottom: 32,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2B2D42',
    marginBottom: 24,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#2B2D42',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginBottom: 16,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#F6F7FB',
    borderWidth: 1,
    borderColor: '#E0E4EA',
  },
  secondaryButtonText: {
    color: '#2B2D42',
  },
  footer: {
    position: 'absolute',
    bottom: 32,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  footerText: {
    color: '#8D99AE',
    fontSize: 14,
  },
});
