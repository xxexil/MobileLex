import React, { useState, useRef } from 'react';
import { View, TextInput, Text, TouchableOpacity, TextInput as RNTextInput, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import AppButton from '@/components/AppButton';

import { Colors } from '@/constants/theme';
import { authApi } from '@/services/api';
import { useLocalSearchParams, useRouter } from 'expo-router';

// Password strength helper
function getPasswordStrength(password: string) {
  if (!password) return { label: '', color: undefined, score: 0 };
  if (password.length < 6) return { label: 'Weak', color: '#B00020', score: 1 };
  if (/^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/.test(password)) {
    return { label: 'Strong', color: '#388e3c', score: 3 };
  }
  if (/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password)) {
    return { label: 'Good', color: '#fbc02d', score: 2 };
  }
  return { label: 'Weak', color: '#B00020', score: 1 };
}

export default function ResetPasswordScreen() {
  const { emailOrPhone, token } = useLocalSearchParams();
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const passwordRef = useRef<RNTextInput>(null);
  const confirmRef = useRef<RNTextInput>(null);
  const router = useRouter();

  const handleReset = async () => {
    setError('');
    if (!newPassword || !confirm) {
      setError('Please fill in both password fields.');
      passwordRef.current?.focus();
      return;
    }
    if (newPassword !== confirm) {
      setError('Passwords do not match');
      confirmRef.current?.focus();
      return;
    }
    if (!getPasswordStrength(newPassword) || getPasswordStrength(newPassword).score < 2) {
      setError('Password must be at least 8 characters and contain a number.');
      passwordRef.current?.focus();
      return;
    }
    setLoading(true);
    try {
      await authApi.resetPassword({
        emailOrPhone,
        token,
        newPassword,
      });
      setSuccess(true);
    } catch (err: any) {
      let msg = 'Reset failed. Try again.';
      if (err?.response?.data?.message) msg = err.response.data.message;
      else if (err?.message) msg = err.message;
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <View style={{ alignItems: 'center', marginTop: 40 }}>
        <Text
          style={{ color: 'green', fontSize: 18, marginBottom: 16 }}
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          accessibilityLabel="Password reset! You can now log in."
        >
          Password reset! You can now log in.
        </Text>
        <AppButton label="Go to Login" onPress={() => router.replace('/(auth)/login' as any)} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.primary }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.primary }}
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, backgroundColor: Colors.primary }}
        keyboardShouldPersistTaps="handled"
      >
        <Text accessibilityRole="header" accessibilityLabel="Enter your new password" style={{ fontWeight: 'bold', fontSize: 18 }}>
          Enter your new password
        </Text>
        <Text style={{ marginTop: 8 }}>Password must be at least 8 characters and contain a number.</Text>
        <View style={{ marginTop: 16 }}>
          <Text style={{ fontWeight: 'bold' }}>New Password</Text>
          <View style={{ width: '100%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TextInput
                ref={passwordRef}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="New Password"
                secureTextEntry={!showPassword}
                editable={!loading}
                accessibilityLabel="New password input"
                accessibilityHint="Enter your new password. Must be at least 8 characters and contain a number."
                style={{
                  flex: 1,
                  borderWidth: 1.5,
                  borderColor:
                    getPasswordStrength(newPassword).label === 'Weak'
                      ? '#B00020'
                      : getPasswordStrength(newPassword).label === 'Good'
                      ? '#fbc02d'
                      : getPasswordStrength(newPassword).label === 'Strong'
                      ? '#388e3c'
                      : '#ccc',
                  borderRadius: 8,
                  fontSize: 16,
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  backgroundColor: '#fff',
                  color: '#222',
                }}
                textContentType="newPassword"
                autoFocus
                importantForAccessibility="yes"
              />
              <TouchableOpacity
                onPress={() => setShowPassword((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                accessibilityHint={showPassword ? 'Hide the password text' : 'Show the password text'}
                style={{ marginLeft: 8 }}
              >
                <Text style={{ color: '#007AFF' }}>{showPassword ? 'Hide' : 'Show'}</Text>
              </TouchableOpacity>
            </View>
            {/* Password strength bar below input */}
            {newPassword.length > 0 && getPasswordStrength(newPassword).label && (
              <>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: '#eee', width: '100%', marginTop: 2, overflow: 'hidden' }}>
                  <View
                    style={{
                      height: 6,
                      borderRadius: 3,
                      width:
                        getPasswordStrength(newPassword).label === 'Weak'
                          ? '33%'
                          : getPasswordStrength(newPassword).label === 'Good'
                          ? '66%'
                          : getPasswordStrength(newPassword).label === 'Strong'
                          ? '100%'
                          : '0%',
                      backgroundColor:
                        getPasswordStrength(newPassword).label === 'Weak'
                          ? '#B00020'
                          : getPasswordStrength(newPassword).label === 'Good'
                          ? '#fbc02d'
                          : getPasswordStrength(newPassword).label === 'Strong'
                          ? '#388e3c'
                          : '#eee',
                    }}
                  />
                </View>
                <Text
                  style={{
                    marginTop: 2,
                    fontWeight: 'bold',
                    color: getPasswordStrength(newPassword).color,
                    fontSize: 13,
                    textAlign: 'left',
                    textTransform: 'lowercase',
                  }}
                >
                  {getPasswordStrength(newPassword).label}
                </Text>
              </>
            )}
          </View>
        </View>
        <View style={{ marginTop: 16 }}>
          <Text style={{ fontWeight: 'bold' }}>Confirm Password</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TextInput
              ref={confirmRef}
              value={confirm}
              onChangeText={setConfirm}
              placeholder="Confirm Password"
              secureTextEntry={!showConfirm}
              editable={!loading}
              accessibilityLabel="Confirm password input"
              accessibilityHint="Re-enter your new password to confirm."
              style={{ flex: 1 }}
              textContentType="password"
              importantForAccessibility="yes"
            />
            <TouchableOpacity
              onPress={() => setShowConfirm((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
              accessibilityHint={showConfirm ? 'Hide the confirm password text' : 'Show the confirm password text'}
              style={{ marginLeft: 8 }}
            >
              <Text style={{ color: '#007AFF' }}>{showConfirm ? 'Hide' : 'Show'}</Text>
            </TouchableOpacity>
          </View>
        </View>
        {error ? (
          <Text
            style={{ color: '#B00020', marginTop: 12 }}
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
            accessibilityLabel={error}
          >
            {error}
          </Text>
        ) : null}
        {loading ? (
          <Text style={{ marginTop: 8 }} accessibilityLiveRegion="polite" accessibilityLabel="Resetting, please wait">Resetting...</Text>
        ) : null}
        <AppButton label="Reset Password" onPress={handleReset} loading={loading} />
        <TouchableOpacity
          onPress={() => router.replace('/(auth)/login')}
          style={{ marginTop: 16 }}
          accessibilityRole="button"
          accessibilityLabel="Back to Login"
          accessibilityHint="Navigate back to the login screen."
        >
          <Text style={{ color: '#007AFF' }}>Back to Login</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
