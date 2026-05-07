import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, KeyboardAvoidingView, Platform, StatusBar,
} from 'react-native';
import AppButton from '@/components/AppButton';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/auth';
import { Colors } from '@/constants/theme';
import { LARAVEL_API_BASE } from '@/services/endpoints';
import BrandLogo from '@/components/BrandLogo';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockSeconds, setLockSeconds] = useState(0);
  const lockTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => { if (lockTimerRef.current) clearInterval(lockTimerRef.current); };
  }, []);

  function startLock(seconds: number) {
    setLockSeconds(seconds);
    if (lockTimerRef.current) clearInterval(lockTimerRef.current);
    lockTimerRef.current = setInterval(() => {
      setLockSeconds((s) => {
        if (s <= 1) { clearInterval(lockTimerRef.current!); lockTimerRef.current = null; setFailedAttempts(0); return 0; }
        return s - 1;
      });
    }, 1000);
  }

  async function handleLogin() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password.trim()) {
      Alert.alert('Error', 'Please enter your email and password.');
      return;
    }
    if (lockSeconds > 0) return;
    setLoading(true);
    try {
      await login(normalizedEmail, password);
    } catch (err: any) {
      const status = err?.response?.status;
      const responseData = err?.response?.data;
      const message = responseData?.errors?.email?.[0]
        || responseData?.errors?.password?.[0]
        || responseData?.message
        || responseData?.error
        || '';
      const shouldCountAttempt = status === 401 || status === 422;

      if (shouldCountAttempt) {
        const newAttempts = failedAttempts + 1;
        setFailedAttempts(newAttempts);
        if (newAttempts >= 5) {
          startLock(30);
          Alert.alert('Account Temporarily Locked', 'Too many failed attempts. Please wait 30 seconds before trying again.');
          return;
        }
        const msg = message || `Login failed. ${5 - newAttempts} attempt(s) remaining.`;
        Alert.alert('Login Failed', msg);
        return;
      }

      if (status === 429) {
        Alert.alert('Login Failed', 'Too many requests. Please wait a moment.');
      } else if (!err?.response) {
        Alert.alert('Login Failed', `Cannot reach server.\nAPI: ${LARAVEL_API_BASE}\nCheck your connection and try again.`);
      } else {
        const details = [
          `Status: ${status ?? 'unknown'}`,
          `API: ${LARAVEL_API_BASE}`,
          message ? `Server: ${message}` : null,
        ].filter(Boolean).join('\n');
        Alert.alert('Login Failed', details || 'Unable to sign in right now. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.primary }}
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : -24}
    >
      <StatusBar backgroundColor={Colors.primary} barStyle="light-content" />
      <ScrollView
        style={{ backgroundColor: Colors.primary }}
        contentContainerStyle={[styles.container, { flexGrow: 1 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo / Header */}
        <View style={styles.header}>
          <BrandLogo
            size={96}
            title="LexConnect"
            subtitle="Legal Services at Your Fingertips"
            align="center"
          />
        </View>

        {/* Card */}
        <View style={styles.card}>
          <View style={styles.accessPill}>
            <Ionicons name="shield-checkmark-outline" size={14} color={Colors.primary} />
            <Text style={styles.accessPillText}>One secure sign-in for every role</Text>
          </View>
          <Text style={styles.cardTitle}>Welcome Back</Text>
          <Text style={styles.cardSubtitle}>Clients, lawyers, law firms, and admins all sign in here.</Text>

          <Text style={styles.label}>Email Address</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor={Colors.textLight}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />

          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              placeholder="Password"
              placeholderTextColor={Colors.textLight}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPassword((prev) => !prev)}>
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

            <View style={{ alignItems: 'flex-end', marginTop: 6, marginBottom: 8 }}>
              <Link href="/(auth)/forgot-password" asChild>
                <TouchableOpacity>
                  <Text style={{ color: Colors.primary, fontWeight: '600', fontSize: 13 }}>Forgot Password?</Text>
                </TouchableOpacity>
              </Link>
            </View>

          <AppButton
            label={lockSeconds > 0 ? `Locked (${lockSeconds}s)` : 'Sign In'}
            onPress={handleLogin}
            loading={loading}
            disabled={lockSeconds > 0}
          />

          <View style={styles.roleHintCard}>
            <View style={styles.roleHintIcon}>
              <Ionicons name="git-branch-outline" size={16} color={Colors.primary} />
            </View>
            <Text style={styles.roleHintText}>
              LexConnect will open the correct dashboard automatically after login.
            </Text>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account? </Text>
            <Link href="/(auth)/register" asChild>
              <TouchableOpacity>
                <Text style={styles.footerLink}>Sign Up</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
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
  accessPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 12,
    backgroundColor: `${Colors.primary}12`,
    borderWidth: 1,
    borderColor: `${Colors.primary}26`,
  },
  accessPillText: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '800',
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: '900',
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
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 10,
    backgroundColor: Colors.background,
  },
  passwordInput: {
    flex: 1,
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  eyeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  roleHintCard: {
    marginTop: 14,
    borderRadius: 14,
    padding: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: '#F7FAFF',
    borderWidth: 1,
    borderColor: '#E2EAF7',
  },
  roleHintIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${Colors.primary}12`,
  },
  roleHintText: {
    flex: 1,
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
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
