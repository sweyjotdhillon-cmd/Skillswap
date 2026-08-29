import React, { useState, useEffect } from 'react';
import { Navbar } from '../components/navigation/Navbar';
import { getSupabaseBrowserClient } from '../lib/supabase/client';

type ForgotPasswordPageProps = {
  onNavigate?: (path: string) => void;
};

export function ForgotPasswordPage({ onNavigate }: ForgotPasswordPageProps) {
  const [step, setStep] = useState<'request' | 'verify'>('request');
  const [email, setEmail] = useState('');
  const [otpToken, setOtpToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ email?: string; otpToken?: string }>({});
  const [cooldown, setCooldown] = useState(0);

  // Handle cooldown timer for resend
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const validateRequest = () => {
    const newErrors: { email?: string } = {};
    if (!email.trim()) {
      newErrors.email = 'Please enter your email address.';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'Please enter a valid email address.';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateVerify = () => {
    const newErrors: { otpToken?: string } = {};
    if (!otpToken.trim()) {
      newErrors.otpToken = 'Please enter the 6-digit recovery code.';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSendRecoveryCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!validateRequest()) return;

    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setErrorMessage('Supabase is not configured.');
        return;
      }
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim());

      if (error) {
        if (error.status === 429 || error.message.includes('rate limit')) {
          setErrorMessage('Too many requests. Please wait before requesting another code.');
        } else {
          setErrorMessage(error.message);
        }
      } else {
        setSuccessMessage(`A 6-digit recovery code has been sent to ${email}.`);
        setStep('verify');
        setCooldown(60);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred while sending recovery code.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!validateVerify()) return;

    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setErrorMessage('Supabase is not configured.');
        return;
      }

      const cleanToken = otpToken.trim();
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: cleanToken,
        type: 'recovery',
      });

      if (error) {
        if (error.message.includes('Token has expired') || error.message.includes('expired')) {
          setErrorMessage('The recovery code has expired. Please request a new code.');
        } else if (error.message.includes('invalid') || error.message.includes('Token is invalid')) {
          setErrorMessage('Invalid recovery code. Please check your email and try again.');
        } else {
          setErrorMessage(error.message);
        }
      } else {
        setSuccessMessage('Recovery code verified successfully! Redirecting to password reset...');
        setTimeout(() => {
          if (onNavigate) {
            onNavigate('/reset-password');
          } else {
            window.location.href = '/reset-password';
          }
        }, 1000);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred while verifying recovery code.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || resending) return;
    setErrorMessage(null);
    setSuccessMessage(null);
    setResending(true);

    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setErrorMessage('Supabase is not configured.');
        return;
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (error) {
        if (error.status === 429 || error.message.includes('rate limit')) {
          setErrorMessage('Too many requests. Please wait a minute before requesting another code.');
        } else {
          setErrorMessage(error.message);
        }
      } else {
        setSuccessMessage(`A new 6-digit recovery code has been sent to ${email}.`);
        setCooldown(60);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred while resending recovery code.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="page-shell">
      <Navbar onNavigate={onNavigate} />
      <main className="auth-layout-grid" style={{ gridTemplateColumns: '1fr', maxWidth: '600px' }}>
        <section className="auth-card-container">
          <div className="auth-card-header">
            <h2 className="auth-card-title">
              {step === 'request' ? 'Reset your password' : 'Enter Recovery Code'}
            </h2>
            <p className="auth-card-subtitle">
              {step === 'request'
                ? 'Enter your registered email address and we will send a 6-digit recovery code.'
                : `Enter the 6-digit recovery code sent to ${email}`}
            </p>
          </div>

          {errorMessage && (
            <div className="auth-alert auth-alert--error" role="alert">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="auth-alert auth-alert--success" role="status">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
              <span>{successMessage}</span>
            </div>
          )}

          {step === 'request' ? (
            <form onSubmit={handleSendRecoveryCode} noValidate>
              <div className="auth-form-group">
                <label htmlFor="reset-email" className="auth-label">
                  Email Address
                </label>
                <input
                  id="reset-email"
                  type="email"
                  className={`auth-input ${errors.email ? 'input-error' : ''}`}
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
                  }}
                  disabled={loading}
                />
                {errors.email && (
                  <p className="error-message" style={{ color: '#e53e3e', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                    {errors.email}
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
                    Sending code...
                  </span>
                ) : (
                  'Send recovery code →'
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOTP} noValidate>
              <div className="auth-form-group">
                <label htmlFor="recovery-otp-input" className="auth-label">
                  6-Digit Recovery Code
                </label>
                <input
                  id="recovery-otp-input"
                  type="text"
                  className={`auth-input ${errors.otpToken ? 'input-error' : ''}`}
                  placeholder="6-digit code"
                  value={otpToken}
                  onChange={(e) => {
                    setOtpToken(e.target.value);
                    if (errors.otpToken) setErrors((prev) => ({ ...prev, otpToken: undefined }));
                  }}
                  disabled={loading}
                  autoFocus
                  maxLength={10}
                />
                {errors.otpToken && (
                  <p className="error-message" style={{ color: '#e53e3e', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                    {errors.otpToken}
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
                    Verifying code...
                  </span>
                ) : (
                  'Verify Code →'
                )}
              </button>

              <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid rgba(255, 255, 255, 0.1)', display: 'flex', flexDirection: 'column', gap: '0.75rem', textAlign: 'center' }}>
                <p style={{ fontSize: '0.9rem', opacity: 0.85 }}>
                  Didn't receive a code?{' '}
                  <button
                    type="button"
                    className="auth-link"
                    onClick={handleResend}
                    disabled={cooldown > 0 || resending}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: cooldown > 0 || resending ? 'not-allowed' : 'pointer', opacity: cooldown > 0 || resending ? 0.6 : 1, fontWeight: 600 }}
                  >
                    {resending ? 'Sending...' : cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend recovery code'}
                  </button>
                </p>

                <p style={{ fontSize: '0.85rem', opacity: 0.75 }}>
                  <button
                    type="button"
                    className="auth-link"
                    onClick={() => {
                      setStep('request');
                      setErrorMessage(null);
                      setSuccessMessage(null);
                    }}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                  >
                    Use a different email address
                  </button>
                </p>
              </div>
            </form>
          )}

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
        </section>
      </main>
    </div>
  );
}
