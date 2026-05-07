import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as Device from 'expo-device';
import { Alert, AppState, AppStateStatus, DeviceEventEmitter } from 'react-native';
import bcrypt from 'bcryptjs';
import { authApi } from '@/services/api';
import { LARAVEL_API_BASE, resolveStorageUrl } from '@/services/endpoints';

interface User {
  id: number;
  name: string;
  email: string;
  role: 'client' | 'lawyer' | 'law_firm' | 'admin';
  avatar_url?: string | null;
  phone?: string | null;
  bio?: string | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  kickedOut: boolean;
  securityLocked: boolean;
  securityPinEnabled: boolean;
  securityLockReason: string | null;
  securityDeviceTrusted: boolean;
  dismissKickedOut: () => void;
  login: (email: string, password: string) => Promise<void>;
  setSession: (sessionToken: string, sessionUser: User, sessionKey?: string | null) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (userData: Partial<User>) => void;
  lockApp: (reason?: string) => Promise<void>;
  unlockWithPin: (pin: string) => Promise<boolean>;
  setSecurityPin: (pin: string) => Promise<void>;
  disableSecurityPin: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);
const AUTH_TOKEN_KEY = 'auth_token';
const AUTH_USER_KEY = 'auth_user';
const AUTH_BACKEND_KEY = 'auth_backend_base';
const AUTH_SESSION_KEY = 'auth_session_key';
const AUTH_LAST_ACTIVE_KEY = 'auth_last_active_at';
const SECURITY_PIN_HASH_KEY = 'security_pin_hash';
const SECURITY_PIN_ENABLED_KEY = 'security_pin_enabled';
const SECURITY_LOCKED_KEY = 'security_locked';
const SECURITY_LOCK_REASON_KEY = 'security_lock_reason';
const SESSION_IDLE_TIMEOUT_MS = 15 * 60 * 1000;

function normalizeRole(role: unknown): User['role'] {
  const value = String(role ?? '').trim().toLowerCase();
  if (value === 'lawfirm' || value === 'law_firm') return 'law_firm';
  if (value === 'attorney') return 'lawyer';
  if (value === 'admin') return 'admin';
  if (value === 'client') return 'client';
  return 'lawyer';
}

function normalizeUserRole(user: User): User {
  return {
    ...user,
    role: normalizeRole(user.role),
    avatar_url: user?.avatar_url ? resolveStorageUrl(String(user.avatar_url)) : user?.avatar_url,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [kickedOut, setKickedOut] = useState(false);
  const [securityLocked, setSecurityLocked] = useState(false);
  const [securityPinEnabled, setSecurityPinEnabled] = useState(false);
  const [securityLockReason, setSecurityLockReason] = useState<string | null>(null);
  const securityDeviceTrusted = Device.isDevice;

  useEffect(() => {
    loadStoredAuth();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      handleAppStateChange(nextState);
    });

    return () => {
      subscription.remove();
    };
  }, [token]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('session_kicked', async () => {
      await clearAuth();
      setKickedOut(true);
    });
    return () => sub.remove();
  }, []);

  async function handleAppStateChange(nextState: AppStateStatus) {
    if (nextState === 'inactive' || nextState === 'background') {
      await SecureStore.setItemAsync(AUTH_LAST_ACTIVE_KEY, String(Date.now()));
      if (securityPinEnabled) {
        await SecureStore.setItemAsync(SECURITY_LOCKED_KEY, 'true');
        if (securityLockReason) {
          await SecureStore.setItemAsync(SECURITY_LOCK_REASON_KEY, securityLockReason);
        }
        setSecurityLocked(true);
      }
      return;
    }

    if (nextState !== 'active') return;

    const storedToken = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
    if (token && !storedToken) {
      // Token was revoked by API interceptor or external state cleanup.
      setToken(null);
      setUser(null);
      return;
    }

    const storedLastActiveAt = await SecureStore.getItemAsync(AUTH_LAST_ACTIVE_KEY);
    if (!storedLastActiveAt || !storedToken) {
      await SecureStore.setItemAsync(AUTH_LAST_ACTIVE_KEY, String(Date.now()));
      return;
    }

    const idleMs = Date.now() - Number(storedLastActiveAt);
    if (Number.isFinite(idleMs) && idleMs > SESSION_IDLE_TIMEOUT_MS) {
      await clearAuth();
      Alert.alert('Session expired', 'For your security, please log in again.');
      return;
    }

    await SecureStore.setItemAsync(AUTH_LAST_ACTIVE_KEY, String(Date.now()));
  }

  async function loadStoredAuth() {
    try {
      const storedBackendBase = await SecureStore.getItemAsync(AUTH_BACKEND_KEY);
      const storedSecurityPinEnabled = await SecureStore.getItemAsync(SECURITY_PIN_ENABLED_KEY);
      const storedSecurityLocked = await SecureStore.getItemAsync(SECURITY_LOCKED_KEY);
      const storedSecurityLockReason = await SecureStore.getItemAsync(SECURITY_LOCK_REASON_KEY);
      setSecurityPinEnabled(storedSecurityPinEnabled === 'true');
      setSecurityLocked(storedSecurityPinEnabled === 'true' && storedSecurityLocked === 'true');
      setSecurityLockReason(storedSecurityPinEnabled === 'true' ? storedSecurityLockReason || null : null);
      if (storedBackendBase && storedBackendBase !== LARAVEL_API_BASE) {
        await clearAuth();
        await SecureStore.setItemAsync(AUTH_BACKEND_KEY, LARAVEL_API_BASE);
        return;
      }

      const storedToken = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
      const storedUser = await SecureStore.getItemAsync(AUTH_USER_KEY);
      if (storedToken && storedUser) {
        const storedLastActiveAt = await SecureStore.getItemAsync(AUTH_LAST_ACTIVE_KEY);
        if (storedLastActiveAt) {
          const idleMs = Date.now() - Number(storedLastActiveAt);
          if (Number.isFinite(idleMs) && idleMs > SESSION_IDLE_TIMEOUT_MS) {
            await clearAuth();
            return;
          }
        }

        setToken(storedToken);
        setUser(JSON.parse(storedUser));
        // Refresh user data from server
        try {
          const { data } = await authApi.me();
          setUser(data.user);
          await SecureStore.setItemAsync(AUTH_USER_KEY, JSON.stringify(data.user));
          if (data?.session_key) {
            await SecureStore.setItemAsync(AUTH_SESSION_KEY, String(data.session_key));
          }
          await SecureStore.setItemAsync(AUTH_BACKEND_KEY, LARAVEL_API_BASE);
          await SecureStore.setItemAsync(AUTH_LAST_ACTIVE_KEY, String(Date.now()));
        } catch {
          // Token may be expired; clear stored auth
          await clearAuth();
        }
      } else {
        await SecureStore.setItemAsync(AUTH_BACKEND_KEY, LARAVEL_API_BASE);
        await SecureStore.setItemAsync(AUTH_LAST_ACTIVE_KEY, String(Date.now()));
      }
    } catch {
      await clearAuth();
    } finally {
      setIsLoading(false);
    }
  }

  async function login(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    try {
      const { data } = await authApi.login(normalizedEmail, password);
      await setSession(data.token, normalizeUserRole(data.user), data?.session_key);
    } catch (error: any) {
      const status = error?.response?.status;
      const message = error?.response?.data?.message || error?.response?.data?.error || '';
      if (
        __DEV__
        && status === 403
        && typeof message === 'string'
        && message.toLowerCase().includes('admin access is not available on mobile')
      ) {
        await setSession(`dev-admin-preview-${Date.now()}`, {
          id: 0,
          name: 'Admin Preview',
          email: normalizedEmail,
          role: 'admin',
        });
        Alert.alert('Admin Preview Mode', 'Backend still blocks admin mobile login. Opened local admin preview so you can test dashboard features.');
        return;
      }
      throw error;
    }
  }

  async function setSession(sessionToken: string, sessionUser: User, sessionKey?: string | null) {
    // Trust server identity bound to token, not stale local payload.
    let resolvedUser: User = normalizeUserRole(sessionUser);
    let resolvedSessionKey = String(sessionKey ?? '');
    try {
      const res = await fetch(`${LARAVEL_API_BASE}/auth/me`, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${sessionToken}`,
          ...(resolvedSessionKey ? { 'X-Session-Key': resolvedSessionKey } : {}),
        },
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.user?.id) {
          resolvedUser = normalizeUserRole(json.user as User);
        }
        if (json?.session_key) {
          resolvedSessionKey = String(json.session_key);
        }
      }
    } catch {
      // Keep login responsive even if /auth/me check fails transiently.
    }

    await SecureStore.setItemAsync(AUTH_TOKEN_KEY, sessionToken);
    await SecureStore.setItemAsync(AUTH_USER_KEY, JSON.stringify(resolvedUser));
    if (resolvedSessionKey) {
      await SecureStore.setItemAsync(AUTH_SESSION_KEY, resolvedSessionKey);
    }
    await SecureStore.setItemAsync(AUTH_BACKEND_KEY, LARAVEL_API_BASE);
    await SecureStore.setItemAsync(AUTH_LAST_ACTIVE_KEY, String(Date.now()));
    await SecureStore.deleteItemAsync(SECURITY_LOCKED_KEY);
    await SecureStore.deleteItemAsync(SECURITY_LOCK_REASON_KEY);
    setSecurityLocked(false);
    setSecurityLockReason(null);
    setToken(sessionToken);
    setUser(resolvedUser);
  }

  async function logout() {
    try {
      await authApi.logout();
    } catch {
      // Silently ignore logout errors
    }
    await clearAuth();
  }

  async function clearAuth() {
    await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
    await SecureStore.deleteItemAsync(AUTH_USER_KEY);
    await SecureStore.deleteItemAsync(AUTH_BACKEND_KEY);
    await SecureStore.deleteItemAsync(AUTH_SESSION_KEY);
    await SecureStore.deleteItemAsync(AUTH_LAST_ACTIVE_KEY);
    await SecureStore.deleteItemAsync(SECURITY_LOCKED_KEY);
    await SecureStore.deleteItemAsync(SECURITY_LOCK_REASON_KEY);
    setToken(null);
    setUser(null);
    setSecurityLocked(false);
    setSecurityLockReason(null);
  }

  async function lockApp(reason?: string) {
    await SecureStore.setItemAsync(SECURITY_LOCKED_KEY, 'true');
    if (reason) {
      await SecureStore.setItemAsync(SECURITY_LOCK_REASON_KEY, reason);
      setSecurityLockReason(reason);
    }
    setSecurityLocked(true);
  }

  async function unlockWithPin(pin: string) {
    const trimmed = pin.trim();
    if (!securityPinEnabled || trimmed.length < 4) return false;
    const storedHash = await SecureStore.getItemAsync(SECURITY_PIN_HASH_KEY);
    if (!storedHash) return false;
    const ok = bcrypt.compareSync(trimmed, storedHash);
    if (!ok) return false;

    await SecureStore.deleteItemAsync(SECURITY_LOCKED_KEY);
    await SecureStore.deleteItemAsync(SECURITY_LOCK_REASON_KEY);
    await SecureStore.setItemAsync(AUTH_LAST_ACTIVE_KEY, String(Date.now()));
    setSecurityLocked(false);
    setSecurityLockReason(null);
    return true;
  }

  async function setSecurityPin(pin: string) {
    const trimmed = pin.trim();
    if (!/^\d{4,8}$/.test(trimmed)) {
      throw new Error('Enter a 4 to 8 digit PIN.');
    }
    const hash = bcrypt.hashSync(trimmed, 10);
    await SecureStore.setItemAsync(SECURITY_PIN_HASH_KEY, hash);
    await SecureStore.setItemAsync(SECURITY_PIN_ENABLED_KEY, 'true');
    await SecureStore.deleteItemAsync(SECURITY_LOCKED_KEY);
    await SecureStore.deleteItemAsync(SECURITY_LOCK_REASON_KEY);
    setSecurityPinEnabled(true);
    setSecurityLocked(false);
    setSecurityLockReason(null);
  }

  async function disableSecurityPin() {
    await SecureStore.deleteItemAsync(SECURITY_PIN_HASH_KEY);
    await SecureStore.deleteItemAsync(SECURITY_PIN_ENABLED_KEY);
    await SecureStore.deleteItemAsync(SECURITY_LOCKED_KEY);
    await SecureStore.deleteItemAsync(SECURITY_LOCK_REASON_KEY);
    setSecurityPinEnabled(false);
    setSecurityLocked(false);
    setSecurityLockReason(null);
  }

  function updateUser(userData: Partial<User>) {
    if (!user) return;
    const updated = normalizeUserRole({ ...user, ...userData } as User);
    setUser(updated);
    SecureStore.setItemAsync(AUTH_USER_KEY, JSON.stringify(updated));
  }

  function dismissKickedOut() {
    setKickedOut(false);
  }

  return (
    <AuthContext.Provider value={{
      user,
      token,
      isLoading,
      kickedOut,
      securityLocked,
      securityPinEnabled,
      securityLockReason,
      securityDeviceTrusted,
      dismissKickedOut,
      login,
      setSession,
      logout,
      updateUser,
      lockApp,
      unlockWithPin,
      setSecurityPin,
      disableSecurityPin,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
