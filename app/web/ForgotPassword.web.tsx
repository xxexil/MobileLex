import React, { useState } from 'react';
import { CHAT_API_BASE } from '@/services/endpoints';

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function isValidPhone(phone: string) {
  return /^\+?\d{10,15}$/.test(phone.replace(/\D/g, ''));
}

export default function ForgotPassword() {
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const emailRef = React.useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
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
          isMobile: false,
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
      <div style={{ textAlign: 'center', marginTop: 40 }}>
        <div style={{ color: 'green', fontSize: 18, marginBottom: 16 }}>If that account exists, we've sent a code.</div>
        <a href="/login" style={{ display: 'inline-block', marginTop: 16, color: '#007AFF' }} aria-label="Back to Login">Back to Login</a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} aria-label="Forgot Password Form">
      <div style={{ marginBottom: 16 }}>
        <label htmlFor="email-or-phone" style={{ fontWeight: 'bold' }}>Email or Phone</label>
        <input
          ref={emailRef}
          id="email-or-phone"
          value={emailOrPhone}
          onChange={e => setEmailOrPhone(e.target.value)}
          placeholder="Email or Phone"
          type="text"
          aria-required="true"
          aria-label="Email or Phone"
          autoFocus
        />
      </div>
      {error && <div style={{ color: '#B00020', marginBottom: 8 }} role="alert" aria-live="polite">{error}</div>}
      <button type="submit" disabled={loading} aria-label="Send Reset Code">{loading ? 'Sending...' : 'Send Reset Code'}</button>
      <a href="/login" style={{ display: 'inline-block', marginTop: 16, color: '#007AFF' }} aria-label="Back to Login">Back to Login</a>
    </form>
  );
}
