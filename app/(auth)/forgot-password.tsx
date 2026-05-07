
import React, { useState, useRef } from 'react';
import { View, TextInput, Text, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import AppButton from '@/components/AppButton';
import { Link, useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { CHAT_API_BASE } from '@/services/endpoints';

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function isValidPhone(phone: string) {
  return /^\+?\d{10,15}$/.test(phone.replace(/\D/g, ''));
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  logoText: {
    fontSize: 32,
    fontWeight: '800',
    color: Colors.primary,
  },
  appName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 1,
  },
  tagline: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    padding: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    marginBottom: 24,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.text,
    backgroundColor: Colors.background,
  },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  errorText: {
    color: '#B00020',
    marginTop: 12,
    fontSize: 14,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
  },
  footerText: {
    color: Colors.textMuted,
    fontSize: 14,
  },
  footerLink: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
});

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const emailRef = useRef(null);

  const handleSubmit = async () => {
    setError('');
    if (!emailOrPhone.trim()) {
      setError('Please enter your email or phone number.');
      emailRef.current?.focus();
      return;
    }
    if (!isValidEmail(emailOrPhone) && !isValidPhone(emailOrPhone)) {
      setError('Enter a valid email address or phone number.');
      emailRef.current?.focus();
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${CHAT_API_BASE}/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          emailOrPhone,
          isMobile: true,
        }),
      });
      if (!res.ok) throw new Error('Request failed');
      setSubmitted(true);
    } catch (e) {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: Colors.primary }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[styles.container, { flexGrow: 1 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoText}>LC</Text>
            </View>
            <Text style={styles.appName}>LexConnect</Text>
            <Text style={styles.tagline}>Legal Services at Your Fingertips</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Check Your Email or SMS</Text>
            <Text style={styles.cardSubtitle}>If that account exists, we've sent a reset code.</Text>
            <AppButton
              label="Verify Code"
              onPress={() => router.push({ pathname: '/(auth)/verify-reset', params: { emailOrPhone } } as any)}
            />
            <Link href="/(auth)/login" asChild>
              <TouchableOpacity style={{ marginTop: 14, alignItems: 'center' }} accessibilityRole="button" accessibilityLabel="Back to Login">
                <Text style={styles.footerLink}>Back to Login</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.primary }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[styles.container, { flexGrow: 1 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoText}>LC</Text>
          </View>
          <Text style={styles.appName}>LexConnect</Text>
          <Text style={styles.tagline}>Legal Services at Your Fingertips</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Forgot Password</Text>
          <Text style={styles.cardSubtitle}>Enter your email or phone number to receive a reset code.</Text>
          <Text style={styles.label}>Email or Phone</Text>
          <TextInput
            ref={emailRef}
            value={emailOrPhone}
            onChangeText={setEmailOrPhone}
            placeholder="Email or Phone"
            placeholderTextColor={Colors.textLight}
            style={styles.input}
            autoCapitalize="none"
            keyboardType="email-address"
            accessibilityLabel="Email or Phone"
            autoFocus
          />
          {error ? <Text style={styles.errorText} accessibilityLiveRegion="polite">{error}</Text> : null}
          <AppButton label="Send Reset Code" onPress={handleSubmit} loading={loading} />
          <View style={styles.footer}>
            <Text style={styles.footerText}>Remembered your password? </Text>
            <Link href="/(auth)/login" asChild>
              <TouchableOpacity>
                <Text style={styles.footerLink}>Back to Login</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
