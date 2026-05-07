import React, { useState } from 'react';
import { CHAT_API_BASE } from '@/services/endpoints';

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function isValidPhone(phone: string) {
  return /^\+?\d{10,15}$/.test(phone.replace(/\D/g, ''));
}
function isValidCode(code: string) {
  return /^\d{4,8}$/.test(code); // Accepts 4-8 digit codes
}

export default function VerifyReset({ onVerified }: { onVerified: (params: { emailOrPhone: string, token: string }) => void }) {
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const emailRef = React.useRef<HTMLInputElement>(null);
  const codeRef = React.useRef<HTMLInputElement>(null);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
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
    if (!token.trim()) {
      setError('Please enter the code you received.');
      codeRef.current?.focus();
      return;
    }
    if (!isValidCode(token)) {
      setError('Enter a valid code (4-8 digits).');
      codeRef.current?.focus();
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${CHAT_API_BASE}/auth/verify-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          emailOrPhone,
          token,
        }),
      });
      if (!res.ok) throw new Error('Request failed');
      onVerified({ emailOrPhone, token });
    } catch {
      setError('Invalid or expired code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleVerify} aria-label="Verify Reset Form">
      <div style={{ marginBottom: 16 }}>
        <label htmlFor="email-or-phone" style={{ fontWeight: 'bold' }}>Email or Phone</label>
        <input
          ref={emailRef}
          id="email-or-phone"
          value={emailOrPhone}
          onChange={e => setEmailOrPhone(e.target.value)}
          placeholder="Email or Phone"
          type="text"
          disabled={loading}
          aria-required="true"
          aria-label="Email or Phone"
          autoFocus
        />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label htmlFor="verify-code" style={{ fontWeight: 'bold' }}>Code</label>
        <input
          ref={codeRef}
          id="verify-code"
          value={token}
          onChange={e => setToken(e.target.value)}
          placeholder="Code"
          type="text"
          disabled={loading}
          aria-required="true"
          aria-label="Verification Code"
        />
      </div>
      {error && <div style={{ color: '#B00020', marginBottom: 8 }} role="alert" aria-live="polite">{error}</div>}
      {loading && <div>Verifying...</div>}
      <button type="submit" disabled={loading} aria-label="Verify Code">{loading ? 'Verifying...' : 'Verify'}</button>
      <a href="/login" style={{ display: 'inline-block', marginTop: 16, color: '#007AFF' }} aria-label="Back to Login">Back to Login</a>
    </form>
  );
}
