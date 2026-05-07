import { useState } from 'react';
// Password strength helper
function getPasswordStrength(password: string) {
  if (!password) return { label: '', color: undefined };
  if (password.length < 6) return { label: 'Weak', color: '#B00020' };
  if (/^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/.test(password)) {
    return { label: 'Strong', color: '#388e3c' };
  }
  if (/^(?=.*[A-Za-z])(?=.*\d).{6,}$/.test(password)) {
    return { label: 'Good', color: '#fbc02d' };
  }
  return { label: 'Weak', color: '#B00020' };
}
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, KeyboardAvoidingView, Platform, StatusBar,
} from 'react-native';
import AppButton from '@/components/AppButton';
import { Link, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { authApi } from '@/services/api';
import { useAuth } from '@/context/auth';
import { Colors } from '@/constants/theme';

type Role = 'client' | 'lawyer' | 'law_firm';

export default function RegisterScreen() {
  const router = useRouter();
  const { setSession } = useAuth();
  const [role, setRole] = useState<Role>('client');
  const [loading, setLoading] = useState(false);

  // Common fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);

  // Client / Law Firm
  const [name, setName] = useState('');

  // Lawyer specific
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [experience, setExperience] = useState('');
  const [location, setLocation] = useState('');

  // Law Firm specific
  const [firmName, setFirmName] = useState('');

  const roles: { value: Role; label: string }[] = [
    { value: 'client', label: 'Client' },
    { value: 'lawyer', label: 'Lawyer' },
    { value: 'law_firm', label: 'Law Firm' },
  ];

  async function handleRegister() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password || !passwordConfirm) {
      Alert.alert('Error', 'Please fill in all required fields.');
      return;
    }
    if (password !== passwordConfirm) {
      Alert.alert('Error', 'Passwords do not match.');
      return;
    }

    const data: Record<string, unknown> = {
      email: normalizedEmail,
      password,
      password_confirmation: passwordConfirm,
      role,
    };

    if (role === 'client') {
      data.name = name;
    } else if (role === 'lawyer') {
      data.first_name = firstName;
      data.last_name = lastName;
      data.specialty = specialty;
      data.hourly_rate = parseFloat(hourlyRate) || 0;
      data.experience_years = parseInt(experience, 10) || 0;
      data.location = location;
    } else if (role === 'law_firm') {
      data.name = name;
      data.firm_name = firmName;
    }

    setLoading(true);
    try {
      const { data: res } = await authApi.register(data);
      await setSession(res.token, res.user);
      router.replace('/');
    } catch (err: any) {
      const errors = err?.response?.data?.errors;
      if (errors) {
        const msg = Object.values(errors).flat().join('\n');
        Alert.alert('Registration Failed', msg);
      } else if (!err?.response) {
        Alert.alert('Registration Failed', 'Cannot reach server. Check Wi-Fi, API URL, and backend server status.');
      } else {
        Alert.alert('Error', err?.response?.data?.message || 'Registration failed.');
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
        <View style={styles.header}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoText}>LC</Text>
          </View>
          <Text style={styles.appName}>LexConnect</Text>
          <Text style={styles.tagline}>Create your account</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sign Up</Text>

          {/* Role Selector */}
          <Text style={styles.label}>I am a...</Text>
          <View style={styles.roleRow}>
            {roles.map((r) => (
              <TouchableOpacity
                key={r.value}
                style={[styles.roleBtn, role === r.value && styles.roleBtnActive]}
                onPress={() => setRole(r.value)}
              >
                <Text style={[styles.roleBtnText, role === r.value && styles.roleBtnTextActive]}>
                  {r.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Client / Law Firm name */}
          {(role === 'client' || role === 'law_firm') && (
            <>
              <Text style={styles.label}>Full Name *</Text>
              <TextInput style={styles.input} placeholder="Your name" placeholderTextColor={Colors.textLight} value={name} onChangeText={setName} />
            </>
          )}

          {/* Lawyer name */}
          {role === 'lawyer' && (
            <>
              <Text style={styles.label}>First Name *</Text>
              <TextInput style={styles.input} placeholder="First name" placeholderTextColor={Colors.textLight} value={firstName} onChangeText={setFirstName} />
              <Text style={styles.label}>Last Name *</Text>
              <TextInput style={styles.input} placeholder="Last name" placeholderTextColor={Colors.textLight} value={lastName} onChangeText={setLastName} />
              <Text style={styles.label}>Specialty *</Text>
              <TextInput style={styles.input} placeholder="e.g. Criminal Law, Family Law" placeholderTextColor={Colors.textLight} value={specialty} onChangeText={setSpecialty} />
              <Text style={styles.label}>Hourly Rate (₱) *</Text>
              <TextInput style={styles.input} placeholder="e.g. 1500" placeholderTextColor={Colors.textLight} value={hourlyRate} onChangeText={setHourlyRate} keyboardType="numeric" />
              <Text style={styles.label}>Years of Experience *</Text>
              <TextInput style={styles.input} placeholder="e.g. 5" placeholderTextColor={Colors.textLight} value={experience} onChangeText={setExperience} keyboardType="numeric" />
              <Text style={styles.label}>Location</Text>
              <TextInput style={styles.input} placeholder="City, Region" placeholderTextColor={Colors.textLight} value={location} onChangeText={setLocation} />
            </>
          )}

          {/* Law Firm name */}
          {role === 'law_firm' && (
            <>
              <Text style={styles.label}>Law Firm Name *</Text>
              <TextInput style={styles.input} placeholder="Your firm name" placeholderTextColor={Colors.textLight} value={firmName} onChangeText={setFirmName} />
            </>
          )}

          {/* Common */}
          <Text style={styles.label}>Email Address *</Text>
          <TextInput style={styles.input} placeholder="you@example.com" placeholderTextColor={Colors.textLight} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />



          <Text style={styles.label}>Password *</Text>
          <View style={{ width: '100%' }}>
            <View
              style={[
                styles.passwordRow,
                {
                  borderColor:
                    getPasswordStrength(password).label === 'Weak'
                      ? '#B00020'
                      : getPasswordStrength(password).label === 'Good'
                      ? '#fbc02d'
                      : getPasswordStrength(password).label === 'Strong'
                      ? '#388e3c'
                      : '#ccc',
                },
              ]}
            >
              <TextInput
                style={[styles.input, styles.passwordInput]}
                placeholder="Min. 6 characters"
                placeholderTextColor={Colors.textLight}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPassword((prev) => !prev)}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            {/* Password strength bar below input */}
            {password.length > 0 && getPasswordStrength(password).label && (
              <>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: '#eee', width: '100%', marginTop: 2, overflow: 'hidden' }}>
                  <View
                    style={{
                      height: 6,
                      borderRadius: 3,
                      width:
                        getPasswordStrength(password).label === 'Weak'
                          ? '33%'
                          : getPasswordStrength(password).label === 'Good'
                          ? '66%'
                          : getPasswordStrength(password).label === 'Strong'
                          ? '100%'
                          : '0%',
                      backgroundColor:
                        getPasswordStrength(password).label === 'Weak'
                          ? '#B00020'
                          : getPasswordStrength(password).label === 'Good'
                          ? '#fbc02d'
                          : getPasswordStrength(password).label === 'Strong'
                          ? '#388e3c'
                          : '#eee',
                    }}
                  />
                </View>
                <Text
                  style={{
                    marginTop: 2,
                    fontWeight: 'bold',
                    color: getPasswordStrength(password).color,
                    fontSize: 13,
                    textAlign: 'left',
                    textTransform: 'lowercase',
                  }}
                >
                  {getPasswordStrength(password).label}
                </Text>
              </>
            )}
          </View>

          <Text style={styles.label}>Confirm Password *</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              placeholder="Repeat password"
              placeholderTextColor={Colors.textLight}
              value={passwordConfirm}
              onChangeText={setPasswordConfirm}
              secureTextEntry={!showPasswordConfirm}
            />
            <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPasswordConfirm((prev) => !prev)}>
              <Ionicons name={showPasswordConfirm ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <AppButton label="Create Account" onPress={handleRegister} loading={loading} />

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <Link href="/(auth)/login" asChild>
              <TouchableOpacity><Text style={styles.footerLink}>Sign In</Text></TouchableOpacity>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  header: { alignItems: 'center', marginBottom: 28 },
  logoCircle: { width: 70, height: 70, borderRadius: 35, backgroundColor: Colors.secondary, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  logoText: { fontSize: 28, fontWeight: '800', color: Colors.primary },
  appName: { fontSize: 26, fontWeight: '800', color: '#fff', letterSpacing: 1 },
  tagline: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  card: { backgroundColor: Colors.card, borderRadius: 20, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 8 },
  cardTitle: { fontSize: 20, fontWeight: '700', color: Colors.text, marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.text, marginBottom: 6, marginTop: 10 },
  input: { borderWidth: 1.5, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: Colors.text, backgroundColor: Colors.background },
  passwordRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: Colors.border, borderRadius: 10, backgroundColor: Colors.background },
  passwordInput: { flex: 1, borderWidth: 0, backgroundColor: 'transparent' },
  eyeBtn: { paddingHorizontal: 12, paddingVertical: 10 },
  roleRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  roleBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center' },
  roleBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  roleBtnText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  roleBtnTextActive: { color: '#fff' },
  button: { backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 24 },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  footerText: { color: Colors.textMuted, fontSize: 14 },
  footerLink: { color: Colors.primary, fontSize: 14, fontWeight: '700' },
});
