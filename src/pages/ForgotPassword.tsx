import React, { useState, useEffect, useRef } from 'react';
import { Navbar } from '../components/navigation/Navbar';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { formatFriendlyErrorMessage } from '../lib/supabase/profile';

type ForgotPasswordPageProps = {
  onNavigate?: (path: string) => void;
};

type Step = 'email' | 'otp' | 'new-password' | 'success';

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  if (local.length <= 2) {
    return `${local[0]}***@${domain}`;
  }
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

async function callEdgeFunction(functionName: string, body: object) {
  const rawUrl = import.meta.env.VITE_SUPABASE_URL || 'https://czpcaffwtmlxvplpanon.supabase.co';
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const supabase = getSupabaseBrowserClient();

  let primaryError: string | null = null;

  if (supabase) {
    try {
      const { data, error } = await supabase.functions.invoke(functionName, {
        body,
      });
      if (!error) {
        return { data, error: null };
      }

      console.error(`Supabase Edge Function '${functionName}' invoke error:`, error);

      let errorMessage = error.message || '';
      if ((error as any).context && typeof (error as any).context.json === 'function') {
        try {
          const jsonErr = await (error as any).context.json();
          if (jsonErr && jsonErr.message) {
            errorMessage = jsonErr.message;
          }
        } catch (_) {
          // ignore
        }
      }

      if (errorMessage && !errorMessage.includes('Failed to send a request')) {
        return { data: null, error: { message: formatFriendlyErrorMessage(errorMessage) } };
      }
      primaryError = errorMessage;
    } catch (err: any) {
      console.error(`Exception invoking Edge Function '${functionName}':`, err);
      primaryError = formatFriendlyErrorMessage(err);
    }
  }

  // Fallback to direct HTTP fetch
  if (rawUrl && supabaseAnonKey && (rawUrl.startsWith('http://') || rawUrl.startsWith('https://'))) {
    try {
      const endpoint = `${rawUrl.replace(/\/+$/, '')}/functions/v1/${functionName}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify(body),
      });

      const resData: any = await response.json().catch(() => ({}));
      if (!response.ok) {
        const msg = resData?.message
          ? formatFriendlyErrorMessage(resData.message)
          : primaryError || "We couldn't send the verification code. Please check your email address and try again.";
        return { data: null, error: { message: msg } };
      }
      return { data: resData, error: null };
    } catch (fetchErr: any) {
      console.error(`Direct fetch to Edge Function '${functionName}' failed:`, fetchErr);
    }
  }

  const userFriendlyError =
    primaryError && !primaryError.includes('Failed to send a request')
      ? formatFriendlyErrorMessage(primaryError)
      : "We couldn't send the verification code right now. Please check your email address and try again.";

  return { data: null, error: { message: userFriendlyError } };
}

export function ForgotPasswordPage({ onNavigate }: ForgotPasswordPageProps) {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [recoveryToken, setRecoveryToken] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Cooldown timer effect
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // Focus first OTP input when reaching OTP step
  useEffect(() => {
    if (step === 'otp') {
      setTimeout(() => {
        otpInputRefs.current[0]?.focus();
      }, 100);
    }
  }, [step]);

  // Password strength calculator
  const calculateStrength = (pwd: string) => {
    if (!pwd) return { score: 0, label: '', color: '' };
    let score = 0;
    if (pwd.length >= 8) score += 1;
    if (pwd.length >= 12) score += 1;
    if (/[A-Z]/.test(pwd)) score += 1;
    if (/[0-9]/.test(pwd)) score += 1;
    if (/[^A-Za-z0-9]/.test(pwd)) score += 1;

    if (score <= 1) return { score: 1, label: 'Weak', color: '#e53e3e' };
    if (score <= 3) return { score: 2, label: 'Medium', color: '#dd6b20' };
    return { score: 3, label: 'Strong', color: '#38a169' };
  };

  const strength = calculateStrength(newPassword);

  // Validate Email Step
  const validateEmailFormat = () => {
    if (!email.trim()) {
      setEmailError('Please enter your email address.');
      return false;
    }
    if (!/\S+@\S+\.\S+/.test(email.trim())) {
      setEmailError('Please enter a valid email address.');
      return false;
    }
    setEmailError(null);
    return true;
  };

  // Step 1: Request 6-digit OTP via Edge Function
  const handleRequestOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!validateEmailFormat()) return;

    setLoading(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const { data, error } = await callEdgeFunction('request-password-reset', { email: cleanEmail });

      if (error) {
        setErrorMessage(formatFriendlyErrorMessage(error.message));
        return;
      }

      setStep('otp');
      setCooldown(45);
      setSuccessMessage(data?.message || "We've sent a 6-digit verification code to your email if an account exists.");
    } catch (err: any) {
      setErrorMessage(formatFriendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Handle OTP digit changes
  const handleOtpChange = (index: number, value: string) => {
    const cleaned = value.replace(/\D/g, '');
    if (!cleaned) {
      const updated = [...otpDigits];
      updated[index] = '';
      setOtpDigits(updated);
      return;
    }

    if (cleaned.length > 1) {
      // Pasting multi-digit code
      const pastedDigits = cleaned.slice(0, 6).split('');
      const updated = [...otpDigits];
      for (let i = 0; i < 6; i++) {
        if (pastedDigits[i]) {
          updated[i] = pastedDigits[i];
        }
      }
      setOtpDigits(updated);
      const nextIndex = Math.min(pastedDigits.length, 5);
      otpInputRefs.current[nextIndex]?.focus();
      return;
    }

    const updated = [...otpDigits];
    updated[index] = cleaned;
    setOtpDigits(updated);

    if (index < 5 && cleaned) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  // Handle OTP keyboard navigation & Backspace
  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!otpDigits[index] && index > 0) {
        otpInputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  // Handle OTP Paste
  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pastedData) return;

    const digits = pastedData.split('');
    const updated = ['', '', '', '', '', ''];
    digits.forEach((digit, idx) => {
      if (idx < 6) updated[idx] = digit;
    });
    setOtpDigits(updated);

    const targetIdx = Math.min(digits.length, 5);
    otpInputRefs.current[targetIdx]?.focus();
  };

  // Step 2: Verify OTP via Edge Function
  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const fullCode = otpDigits.join('');
    if (fullCode.length !== 6) {
      setErrorMessage('Please enter all 6 digits of your verification code.');
      return;
    }

    setLoading(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const { data, error } = await callEdgeFunction('verify-password-reset-otp', {
        email: cleanEmail,
        otp: fullCode,
      });

      if (error) {
        setErrorMessage(formatFriendlyErrorMessage(error.message));
        return;
      }

      if (!data?.recoveryToken) {
        setErrorMessage('Verification failed. Please try again.');
        return;
      }

      setRecoveryToken(data.recoveryToken);
      setSuccessMessage('Code verified successfully. Please enter your new password.');
      setStep('new-password');
    } catch (err: any) {
      setErrorMessage(formatFriendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Resend OTP
  const handleResendOTP = async () => {
    if (cooldown > 0 || resending) return;
    setErrorMessage(null);
    setSuccessMessage(null);
    setResending(true);

    try {
      const cleanEmail = email.trim().toLowerCase();
      const { data, error } = await callEdgeFunction('request-password-reset', { email: cleanEmail });

      if (error) {
        setErrorMessage(formatFriendlyErrorMessage(error.message));
      } else {
        setSuccessMessage(`A new 6-digit verification code has been sent to ${cleanEmail}.`);
        setCooldown(45);
      }
    } catch (err: any) {
      setErrorMessage(formatFriendlyErrorMessage(err));
    } finally {
      setResending(false);
    }
  };

  // Step 3: Set New Password via Edge Function
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setPasswordError(null);
    setConfirmPasswordError(null);

    let hasError = false;
    if (!newPassword) {
      setPasswordError('Please enter a new password.');
      hasError = true;
    } else if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters long.');
      hasError = true;
    }

    if (!confirmPassword) {
      setConfirmPasswordError('Please confirm your new password.');
      hasError = true;
    } else if (newPassword !== confirmPassword) {
      setConfirmPasswordError('Passwords do not match.');
      hasError = true;
    }

    if (hasError) return;

    if (!recoveryToken) {
      setErrorMessage('Recovery session expired. Please verify your verification code again.');
      setStep('otp');
      return;
    }

    setLoading(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const { data, error } = await callEdgeFunction('complete-password-reset', {
        email: cleanEmail,
        recoveryToken,
        newPassword,
      });

      if (error) {
        setErrorMessage(formatFriendlyErrorMessage(error.message));
      } else {
        setStep('success');
      }
    } catch (err: any) {
      setErrorMessage(formatFriendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const currentStepNumber = step === 'email' ? 1 : step === 'otp' ? 2 : 3;

  return (
    <div className="page-shell">
      <Navbar onNavigate={onNavigate} />
      <main className="auth-layout-grid" style={{ gridTemplateColumns: '1fr', maxWidth: '580px', margin: '0 auto' }}>
        <section className="auth-card-container">
          {/* Step Progress Bar */}
          {step !== 'success' && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '1.75rem',
                paddingBottom: '1rem',
                borderBottom: '1px solid var(--shell-border, rgba(255, 255, 255, 0.1))',
                flexWrap: 'wrap',
                gap: '0.5rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontSize: '0.85rem',
                  fontWeight: currentStepNumber === 1 ? 600 : 400,
                  opacity: currentStepNumber >= 1 ? 1 : 0.5,
                  color: currentStepNumber === 1 ? '#d6a64a' : 'inherit',
                  whiteSpace: 'nowrap',
                }}
              >
                <span
                  style={{
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    backgroundColor: currentStepNumber >= 1 ? '#d6a64a' : 'rgba(255,255,255,0.2)',
                    color: '#11161c',
                    flexShrink: 0,
                  }}
                >
                  1
                </span>
                <span>Email</span>
              </div>

              <div style={{ flex: 1, minWidth: '12px', height: '2px', backgroundColor: currentStepNumber >= 2 ? '#d6a64a' : 'rgba(255,255,255,0.1)' }} />

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontSize: '0.85rem',
                  fontWeight: currentStepNumber === 2 ? 600 : 400,
                  opacity: currentStepNumber >= 2 ? 1 : 0.5,
                  color: currentStepNumber === 2 ? '#d6a64a' : 'inherit',
                  whiteSpace: 'nowrap',
                }}
              >
                <span
                  style={{
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    backgroundColor: currentStepNumber >= 2 ? '#d6a64a' : 'rgba(255,255,255,0.2)',
                    color: '#11161c',
                    flexShrink: 0,
                  }}
                >
                  2
                </span>
                <span>Verify</span>
              </div>

              <div style={{ flex: 1, minWidth: '12px', height: '2px', backgroundColor: currentStepNumber >= 3 ? '#d6a64a' : 'rgba(255,255,255,0.1)' }} />

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontSize: '0.85rem',
                  fontWeight: currentStepNumber === 3 ? 600 : 400,
                  opacity: currentStepNumber >= 3 ? 1 : 0.5,
                  color: currentStepNumber === 3 ? '#d6a64a' : 'inherit',
                  whiteSpace: 'nowrap',
                }}
              >
                <span
                  style={{
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    backgroundColor: currentStepNumber >= 3 ? '#d6a64a' : 'rgba(255,255,255,0.2)',
                    color: '#11161c',
                    flexShrink: 0,
                  }}
                >
                  3
                </span>
                <span>New Password</span>
              </div>
            </div>
          )}

          <div className="auth-card-header">
            <h2 className="auth-card-title">
              {step === 'email' && 'Forgot your password?'}
              {step === 'otp' && 'Verify your email'}
              {step === 'new-password' && 'Create a new password'}
              {step === 'success' && 'Password updated successfully.'}
            </h2>
            <p className="auth-card-subtitle">
              {step === 'email' && "Enter the email associated with your SkillSwap account and we'll send you a 6-digit verification code."}
              {step === 'otp' && (
                <>
                  Enter the 6-digit code sent to your email (
                  <strong style={{ color: '#d6a64a' }}>{maskEmail(email)}</strong>).
                </>
              )}
              {step === 'new-password' && 'Create a strong new password for your SkillSwap account.'}
              {step === 'success' && 'Your password has been successfully reset. Please log in with your new password.'}
            </p>
          </div>

          {errorMessage && (
            <div className="auth-alert auth-alert--error" role="alert" style={{ marginBottom: '1.25rem' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && step !== 'success' && (
            <div className="auth-alert auth-alert--success" role="status" style={{ marginBottom: '1.25rem' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <span>{successMessage}</span>
            </div>
          )}

          {/* STEP 1: EMAIL */}
          {step === 'email' && (
            <form onSubmit={handleRequestOTP} noValidate>
              <div className="auth-form-group">
                <label htmlFor="forgot-email" className="auth-label">
                  Email Address
                </label>
                <input
                  id="forgot-email"
                  type="email"
                  autoComplete="email"
                  className={`auth-input ${emailError ? 'input-error' : ''}`}
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (emailError) setEmailError(null);
                  }}
                  disabled={loading}
                  autoFocus
                />
                {emailError && (
                  <p className="error-message" style={{ color: '#e53e3e', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                    {emailError}
                  </p>
                )}
              </div>

              <button type="submit" className="auth-submit-btn" disabled={loading}>
                {loading ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                    <svg className="spinner" viewBox="0 0 24 24" width="16" height="16" style={{ animation: 'spin 1s linear infinite' }}>
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.25" />
                      <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" opacity="0.75" />
                    </svg>
                    Sending verification code...
                  </span>
                ) : (
                  'Send verification code →'
                )}
              </button>
            </form>
          )}

          {/* STEP 2: 6-DIGIT OTP VERIFICATION */}
          {step === 'otp' && (
            <form onSubmit={handleVerifyOTP} noValidate>
              <div className="auth-form-group">
                <label className="auth-label" style={{ textAlign: 'center', display: 'block', marginBottom: '0.75rem' }}>
                  6-Digit Verification Code
                </label>
                <div
                  style={{
                    display: 'flex',
                    gap: '0.5rem',
                    justifyContent: 'center',
                    marginBottom: '1rem',
                  }}
                >
                  {otpDigits.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => {
                        otpInputRefs.current[index] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={digit}
                      onChange={(e) => handleOtpChange(index, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(index, e)}
                      onPaste={handleOtpPaste}
                      disabled={loading}
                      aria-label={`Digit ${index + 1} of 6`}
                      className="auth-input"
                      style={{
                        width: '46px',
                        height: '52px',
                        textAlign: 'center',
                        fontSize: '1.3rem',
                        fontWeight: '700',
                        letterSpacing: '0',
                        padding: 0,
                      }}
                    />
                  ))}
                </div>
              </div>

              <button type="submit" className="auth-submit-btn" disabled={loading || otpDigits.join('').length !== 6}>
                {loading ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                    <svg className="spinner" viewBox="0 0 24 24" width="16" height="16" style={{ animation: 'spin 1s linear infinite' }}>
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.25" />
                      <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" opacity="0.75" />
                    </svg>
                    Verifying code...
                  </span>
                ) : (
                  'Verify code →'
                )}
              </button>

              <div
                style={{
                  marginTop: '1.5rem',
                  paddingTop: '1rem',
                  borderTop: '1px solid var(--shell-border, rgba(255, 255, 255, 0.1))',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  textAlign: 'center',
                }}
              >
                <p style={{ fontSize: '0.9rem', opacity: 0.85 }}>
                  Didn't receive a code?{' '}
                  <button
                    type="button"
                    className="auth-link"
                    onClick={handleResendOTP}
                    disabled={cooldown > 0 || resending}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: cooldown > 0 || resending ? 'not-allowed' : 'pointer',
                      opacity: cooldown > 0 || resending ? 0.6 : 1,
                      fontWeight: 600,
                    }}
                  >
                    {resending ? 'Sending...' : cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
                  </button>
                </p>

                <p style={{ fontSize: '0.85rem', opacity: 0.75 }}>
                  <button
                    type="button"
                    className="auth-link"
                    onClick={() => {
                      setStep('email');
                      setErrorMessage(null);
                      setSuccessMessage(null);
                      setOtpDigits(['', '', '', '', '', '']);
                    }}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                  >
                    Use a different email address
                  </button>
                </p>
              </div>
            </form>
          )}

          {/* STEP 3: NEW PASSWORD */}
          {step === 'new-password' && (
            <form onSubmit={handleUpdatePassword} noValidate>
              <div className="auth-form-group">
                <label htmlFor="new-password-input" className="auth-label">
                  New Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="new-password-input"
                    type={showNewPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    className={`auth-input ${passwordError ? 'input-error' : ''}`}
                    placeholder="At least 8 characters"
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      if (passwordError) setPasswordError(null);
                    }}
                    disabled={loading}
                    autoFocus
                    style={{ paddingRight: '2.5rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    style={{
                      position: 'absolute',
                      right: '0.75rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: 'inherit',
                      opacity: 0.7,
                      cursor: 'pointer',
                      padding: '0.25rem',
                    }}
                    aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                  >
                    {showNewPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
                {newPassword && (
                  <div style={{ marginTop: '0.4rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>Password Strength:</span>
                    <span style={{ color: strength.color, fontWeight: 600 }}>{strength.label}</span>
                  </div>
                )}
                <p style={{ fontSize: '0.78rem', opacity: 0.75, marginTop: '0.35rem' }}>
                  Password requirements: Minimum 8 characters.
                </p>
                {passwordError && (
                  <p className="error-message" style={{ color: '#e53e3e', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                    {passwordError}
                  </p>
                )}
              </div>

              <div className="auth-form-group">
                <label htmlFor="confirm-password-input" className="auth-label">
                  Confirm New Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="confirm-password-input"
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    className={`auth-input ${confirmPasswordError ? 'input-error' : ''}`}
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (confirmPasswordError) setConfirmPasswordError(null);
                    }}
                    disabled={loading}
                    style={{ paddingRight: '2.5rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    style={{
                      position: 'absolute',
                      right: '0.75rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: 'inherit',
                      opacity: 0.7,
                      cursor: 'pointer',
                      padding: '0.25rem',
                    }}
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
                {confirmPasswordError && (
                  <p className="error-message" style={{ color: '#e53e3e', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                    {confirmPasswordError}
                  </p>
                )}
              </div>

              <button type="submit" className="auth-submit-btn" disabled={loading}>
                {loading ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                    <svg className="spinner" viewBox="0 0 24 24" width="16" height="16" style={{ animation: 'spin 1s linear infinite' }}>
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.25" />
                      <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" opacity="0.75" />
                    </svg>
                    Updating password...
                  </span>
                ) : (
                  'Update password →'
                )}
              </button>
            </form>
          )}

          {/* STEP 4: SUCCESS */}
          {step === 'success' && (
            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
              <div
                style={{
                  width: '60px',
                  height: '60px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(56, 161, 105, 0.15)',
                  color: '#38a169',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '1.25rem',
                }}
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>

              <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                Password updated successfully.
              </h3>

              <p style={{ opacity: 0.8, fontSize: '0.95rem', marginBottom: '1.75rem' }}>
                Your account password has been reset. Please log in with your new password to continue.
              </p>

              <button
                type="button"
                className="auth-submit-btn"
                onClick={() => {
                  if (onNavigate) {
                    onNavigate('/login');
                  } else {
                    window.location.href = '/login';
                  }
                }}
              >
                Log In Now →
              </button>
            </div>
          )}

          {step !== 'success' && (
            <p className="auth-footer-text">
              Remembered your password?{' '}
              <a
                href="/login"
                className="auth-link"
                onClick={(e) => {
                  e.preventDefault();
                  if (onNavigate) onNavigate('/login');
                }}
              >
                Back to log in
              </a>
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
