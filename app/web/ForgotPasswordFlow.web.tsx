import React, { useState } from 'react';
import ForgotPassword from './ForgotPassword.web';
import VerifyReset from './VerifyReset.web';
import ResetPassword from './ResetPassword.web';

export default function ForgotPasswordFlow() {
  const [step, setStep] = useState<'request' | 'verify' | 'reset'>('request');
  const [params, setParams] = useState<{ emailOrPhone?: string; token?: string }>({});

  if (step === 'request') {
    return <ForgotPassword />;
  }
  if (step === 'verify') {
    return <VerifyReset onVerified={(p: { emailOrPhone: string; token: string }) => { setParams(p); setStep('reset'); }} />;
  }
  if (step === 'reset' && params.emailOrPhone && params.token) {
    return <ResetPassword emailOrPhone={params.emailOrPhone} token={params.token} />;
  }
  return null;
}
