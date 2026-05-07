import React, { useState } from 'react';
import { CHAT_API_BASE } from '@/services/endpoints';

function passwordStrength(password: string) {
  return /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/.test(password);
}

export default function ResetPassword({ emailOrPhone, token }: { emailOrPhone: string, token: string }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const passwordRef = React.useRef<HTMLInputElement>(null);
  const confirmRef = React.useRef<HTMLInputElement>(null);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
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
    if (!passwordStrength(newPassword)) {
      setError('Password must be at least 8 characters and contain a number.');
      passwordRef.current?.focus();
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${CHAT_API_BASE}/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          emailOrPhone,
          token,
          newPassword,
        }),
      });
      if (!res.ok) throw new Error('Request failed');
      setSuccess(true);
    } catch {
      setError('Reset failed. Try again.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div style={{ textAlign: 'center', marginTop: 40 }}>
        <div style={{ color: 'green', fontSize: 18, marginBottom: 16 }}>Password reset! You can now log in.</div>
        <a href="/login">
          <button style={{ marginTop: 12 }}>Go to Login</button>
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleReset} aria-label="Reset Password Form">
      <div style={{ marginBottom: 16 }}>
        <label htmlFor="new-password" style={{ fontWeight: 'bold' }}>New Password</label>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <input
            ref={passwordRef}
            id="new-password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            placeholder="New Password"
            type={showPassword ? 'text' : 'password'}
            disabled={loading}
            aria-required="true"
            aria-label="New Password"
            autoFocus
            style={{ flex: 1 }}
            autoComplete="new-password"
          />
          <button type="button" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'} style={{ marginLeft: 8 }}>
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <label htmlFor="confirm-password" style={{ fontWeight: 'bold' }}>Confirm Password</label>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <input
            ref={confirmRef}
            id="confirm-password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder="Confirm Password"
            type={showConfirm ? 'text' : 'password'}
            disabled={loading}
            aria-required="true"
            aria-label="Confirm Password"
            autoComplete="new-password"
            style={{ flex: 1 }}
          />
          <button type="button" onClick={() => setShowConfirm(v => !v)} aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'} style={{ marginLeft: 8 }}>
            {showConfirm ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>
      <div style={{ marginBottom: 8 }}>Password must be at least 8 characters and contain a number.</div>
      {error && <div style={{ color: '#B00020', marginBottom: 8 }} role="alert" aria-live="polite">{error}</div>}
      {loading && <div>Resetting...</div>}
      <button type="submit" disabled={loading} aria-label="Reset Password">{loading ? 'Resetting...' : 'Reset Password'}</button>
      <a href="/login" style={{ display: 'inline-block', marginTop: 16, color: '#007AFF' }} aria-label="Back to Login">Back to Login</a>
    </form>
  );
}
