import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Colors } from '@/constants/theme';

interface OtpModalProps {
  visible: boolean;
  title: string;
  subtitle: string;
  /** Called with the code the user typed. Throw to show an error. */
  onVerify: (code: string) => Promise<void>;
  /** Called when the user taps "Resend". Throw to show an error. */
  onResend: () => Promise<void>;
  onClose: () => void;
}

const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN = 60; // seconds

export default function OtpModal({
  visible,
  title,
  subtitle,
  onVerify,
  onResend,
  onClose,
}: OtpModalProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockedSeconds, setLockedSeconds] = useState(0);
  const [resendSeconds, setResendSeconds] = useState(RESEND_COOLDOWN);
  const inputRef = useRef<TextInput>(null);
  const lockTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resendTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset everything when modal opens
  useEffect(() => {
    if (visible) {
      setCode('');
      setError('');
      setVerifying(false);
      setAttempts(0);
      setLockedSeconds(0);
      setResendSeconds(RESEND_COOLDOWN);
      startResendTimer();
      setTimeout(() => inputRef.current?.focus(), 300);
    } else {
      clearAllTimers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function clearAllTimers() {
    if (lockTimerRef.current) { clearInterval(lockTimerRef.current); lockTimerRef.current = null; }
    if (resendTimerRef.current) { clearInterval(resendTimerRef.current); resendTimerRef.current = null; }
  }

  function startResendTimer() {
    setResendSeconds(RESEND_COOLDOWN);
    if (resendTimerRef.current) clearInterval(resendTimerRef.current);
    resendTimerRef.current = setInterval(() => {
      setResendSeconds((s) => {
        if (s <= 1) { clearInterval(resendTimerRef.current!); resendTimerRef.current = null; return 0; }
        return s - 1;
      });
    }, 1000);
  }

  function startLockTimer(seconds: number) {
    setLockedSeconds(seconds);
    if (lockTimerRef.current) clearInterval(lockTimerRef.current);
    lockTimerRef.current = setInterval(() => {
      setLockedSeconds((s) => {
        if (s <= 1) {
          clearInterval(lockTimerRef.current!);
          lockTimerRef.current = null;
          setAttempts(0);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }

  const handleVerify = useCallback(async () => {
    if (lockedSeconds > 0) return;
    const trimmed = code.trim();
    if (trimmed.length < 4) { setError('Please enter the full verification code.'); return; }
    setError('');
    setVerifying(true);
    try {
      await onVerify(trimmed);
      clearAllTimers();
    } catch (err: any) {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      const msg = err?.response?.data?.error || err?.message || 'Incorrect code. Please try again.';
      setError(msg);
      if (newAttempts >= MAX_ATTEMPTS) {
        startLockTimer(30);
        setError(`Too many attempts. Locked for 30 seconds.`);
      }
      setCode('');
    } finally {
      setVerifying(false);
    }
  }, [attempts, code, lockedSeconds, onVerify]);

  const handleResend = useCallback(async () => {
    if (resendSeconds > 0 || resending) return;
    setError('');
    setResending(true);
    try {
      await onResend();
      setAttempts(0);
      setLockedSeconds(0);
      setCode('');
      startResendTimer();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to resend. Try again later.');
    } finally {
      setResending(false);
    }
  }, [onResend, resendSeconds, resending]);

  const isLocked = lockedSeconds > 0;
  const canResend = resendSeconds === 0 && !resending;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.iconWrap}>
            <Text style={styles.iconText}>🔐</Text>
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          {/* Code input */}
          <TextInput
            ref={inputRef}
            style={[styles.input, isLocked && styles.inputDisabled]}
            value={code}
            onChangeText={(t) => { setCode(t.replace(/\D/g, '').slice(0, 6)); setError(''); }}
            placeholder="_ _ _ _ _ _"
            placeholderTextColor={Colors.textLight}
            keyboardType="number-pad"
            maxLength={6}
            editable={!isLocked && !verifying}
            accessibilityLabel="Verification code"
          />

          {/* Error */}
          {!!error && <Text style={styles.error}>{error}</Text>}

          {/* Lock countdown */}
          {isLocked && (
            <Text style={styles.lockMsg}>Retry in {lockedSeconds}s</Text>
          )}

          {/* Verify button */}
          <TouchableOpacity
            style={[styles.btn, (verifying || isLocked) && styles.btnDisabled]}
            onPress={handleVerify}
            disabled={verifying || isLocked}
          >
            {verifying
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>Verify Code</Text>}
          </TouchableOpacity>

          {/* Resend */}
          <TouchableOpacity
            style={[styles.resendBtn, !canResend && styles.resendBtnDisabled]}
            onPress={handleResend}
            disabled={!canResend}
          >
            {resending
              ? <ActivityIndicator size="small" color={Colors.primary} />
              : <Text style={[styles.resendText, !canResend && styles.resendTextDisabled]}>
                  {resendSeconds > 0 ? `Resend code in ${resendSeconds}s` : 'Resend code'}
                </Text>}
          </TouchableOpacity>

          {/* Cancel */}
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 28,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: `${Colors.primary}18`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  iconText: { fontSize: 28 },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: 22,
    lineHeight: 19,
  },
  input: {
    width: '100%',
    borderWidth: 2,
    borderColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 10,
    textAlign: 'center',
    color: Colors.text,
    backgroundColor: `${Colors.primary}08`,
    marginBottom: 6,
  },
  inputDisabled: {
    borderColor: Colors.border,
    backgroundColor: '#f5f5f5',
    color: Colors.textMuted,
  },
  error: {
    color: '#B00020',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 4,
  },
  lockMsg: {
    color: '#D97706',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 4,
  },
  btn: {
    backgroundColor: Colors.primary,
    borderRadius: 13,
    paddingVertical: 15,
    width: '100%',
    alignItems: 'center',
    marginTop: 16,
  },
  btnDisabled: { opacity: 0.55 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  resendBtn: {
    marginTop: 14,
    paddingVertical: 8,
    alignItems: 'center',
    width: '100%',
  },
  resendBtnDisabled: {},
  resendText: { color: Colors.primary, fontSize: 14, fontWeight: '700' },
  resendTextDisabled: { color: Colors.textMuted },
  cancelBtn: { marginTop: 6, paddingVertical: 10, alignItems: 'center', width: '100%' },
  cancelText: { color: Colors.textMuted, fontSize: 14 },
});
