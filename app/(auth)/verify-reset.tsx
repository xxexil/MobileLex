import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { CHAT_API_BASE } from '@/services/endpoints';

const MAX_ATTEMPTS = 5;
const LOCK_SECONDS = 30;

function isValidEmail(email: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
function isValidPhone(phone: string) { return /^\+?\d{10,15}$/.test(phone.replace(/\D/g, '')); }
function isValidCode(code: string) { return /^\d{4,8}$/.test(code); }

export default function VerifyResetScreen() {
  const params = useLocalSearchParams<{ emailOrPhone?: string }>();
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockSeconds, setLockSeconds] = useState(0);
  const router = useRouter();
  const emailRef = useRef<TextInput>(null);
  const codeRef = useRef<TextInput>(null);
  const lockTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (typeof params?.emailOrPhone === 'string' && params.emailOrPhone.trim()) {
      setEmailOrPhone(params.emailOrPhone.trim());
    }
  }, [params?.emailOrPhone]);

  useEffect(() => { return () => { if (lockTimerRef.current) clearInterval(lockTimerRef.current); }; }, []);

  function startLock() {
    setLockSeconds(LOCK_SECONDS);
    if (lockTimerRef.current) clearInterval(lockTimerRef.current);
    lockTimerRef.current = setInterval(() => {
      setLockSeconds((s) => { if (s <= 1) { clearInterval(lockTimerRef.current!); lockTimerRef.current = null; setAttempts(0); return 0; } return s - 1; });
    }, 1000);
  }

  const isLocked = lockSeconds > 0;

  const handleVerify = async () => {
    if (isLocked) return;
    setError('');
    if (!emailOrPhone.trim()) { setError('Please enter your email or phone number.'); emailRef.current?.focus(); return; }
    if (!isValidEmail(emailOrPhone) && !isValidPhone(emailOrPhone)) { setError('Enter a valid email or phone number.'); emailRef.current?.focus(); return; }
    if (!token.trim()) { setError('Please enter the code you received.'); codeRef.current?.focus(); return; }
    if (!isValidCode(token)) { setError('Enter a valid 4-8 digit code.'); codeRef.current?.focus(); return; }
    setLoading(true);
    try {
      const res = await fetch(`${CHAT_API_BASE}/auth/verify-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ emailOrPhone, token }),
      });
      if (!res.ok) throw new Error('Request failed');
      router.push({ pathname: '/(auth)/reset-password', params: { emailOrPhone, token } } as any);
    } catch {
      const n = attempts + 1;
      setAttempts(n);
      if (n >= MAX_ATTEMPTS) { startLock(); setError(`Too many incorrect attempts. Locked for ${LOCK_SECONDS}s.`); }
      else { setError(`Invalid or expired code. ${MAX_ATTEMPTS - n} attempt(s) remaining.`); }
      setToken('');
    } finally { setLoading(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: Colors.primary }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={[s.container, { flexGrow: 1 }]} keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <View style={s.logoCircle}><Text style={s.logoText}>LC</Text></View>
          <Text style={s.appName}>LexConnect</Text>
          <Text style={s.tagline}>Legal Services at Your Fingertips</Text>
        </View>
        <View style={s.card}>
          <Text style={s.cardTitle} accessibilityRole="header">Verify Your Identity</Text>
          <Text style={s.cardSubtitle}>Enter the code sent to your email or phone number.</Text>
          <Text style={s.label}>Email or Phone</Text>
          <TextInput ref={emailRef} style={[s.input, isLocked && s.inputDisabled]} value={emailOrPhone}
            onChangeText={(v) => { setEmailOrPhone(v); setError(''); }} placeholder="Email or Phone"
            placeholderTextColor={Colors.textLight} autoCapitalize="none" keyboardType="email-address"
            editable={!loading && !isLocked} autoFocus accessibilityLabel="Email or Phone" />
          <Text style={s.label}>Verification Code</Text>
          <TextInput ref={codeRef} style={[s.input, s.codeInput, isLocked && s.inputDisabled]} value={token}
            onChangeText={(v) => { setToken(v.replace(/\D/g, '').slice(0, 8)); setError(''); }}
            placeholder="_ _ _ _ _ _" placeholderTextColor={Colors.textLight} keyboardType="number-pad"
            maxLength={8} editable={!loading && !isLocked} accessibilityLabel="Verification code" />
          {!!error && <Text style={s.errorText} accessibilityLiveRegion="polite" accessibilityRole="alert">{error}</Text>}
          {isLocked && <Text style={s.lockText}>Retry in {lockSeconds}s</Text>}
          <TouchableOpacity style={[s.button, (loading || isLocked) && s.buttonDisabled]} onPress={handleVerify} disabled={loading || isLocked}>
            {loading ? <ActivityIndicator color="#fff" /> : isLocked ? <Text style={s.buttonText}>Locked ({lockSeconds}s)</Text> : <Text style={s.buttonText}>Verify Code</Text>}
          </TouchableOpacity>
          <View style={s.footer}>
            <TouchableOpacity onPress={() => router.replace('/(auth)/login')} accessibilityRole="button">
              <Text style={s.footerLink}>Back to Login</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { justifyContent: 'center', padding: 24 },
  header: { alignItems: 'center', marginBottom: 32 },
  logoCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.secondary, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  logoText: { fontSize: 32, fontWeight: '800', color: Colors.primary },
  appName: { fontSize: 28, fontWeight: '800', color: '#fff', letterSpacing: 1 },
  tagline: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  card: { backgroundColor: Colors.card, borderRadius: 20, padding: 28, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 8 },
  cardTitle: { fontSize: 22, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  cardSubtitle: { fontSize: 14, color: Colors.textMuted, marginBottom: 24 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.text, marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1.5, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: Colors.text, backgroundColor: Colors.background },
  inputDisabled: { backgroundColor: '#f5f5f5', color: Colors.textMuted },
  codeInput: { fontSize: 22, fontWeight: '800', letterSpacing: 8, textAlign: 'center' },
  errorText: { color: '#B00020', marginTop: 12, fontSize: 14, fontWeight: '600' },
  lockText: { color: '#D97706', fontSize: 13, fontWeight: '700', marginTop: 6 },
  button: { backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 24 },
  buttonDisabled: { opacity: 0.65 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  footer: { alignItems: 'center', marginTop: 20 },
  footerLink: { color: Colors.primary, fontSize: 14, fontWeight: '700' },
});
