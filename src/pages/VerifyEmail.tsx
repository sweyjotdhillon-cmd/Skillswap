import React, { useState, useEffect } from 'react';
import { Navbar } from '../components/navigation/Navbar';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { useAuth } from '../context/AuthContext';

type VerifyEmailPageProps = {
  onNavigate?: (path: string) => void;
  redirectTo?: string;
  email?: string;
};

export function VerifyEmailPage({ onNavigate, redirectTo: propsRedirectTo, email: propsEmail }: VerifyEmailPageProps) {
  const urlParams = new URLSearchParams(window.location.search);
  const initialEmail = propsEmail || urlParams.get('email') || '';
  const redirectTo = propsRedirectTo || urlParams.get('redirectTo') || undefined;

  const { user, refreshSession } = useAuth();
  const [email, setEmail] = useState(initialEmail || (user?.email ?? ''));
  const [otpCode, setOtpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!email && user?.email) {
      setEmail(user.email);
    }
  }, [user]);

  // Handle countdown timer for resend code
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanCode = otpCode.trim();
    if (!cleanCode) {
      setErrorMessage('Please enter the verification code sent to your email.');
      return;
    }

    if (!email.trim()) {
      setErrorMessage('Email address is missing. Please enter your email address.');
      return;
    }

    setLoading(true);

    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setErrorMessage('Supabase is not configured.');
        return;
      }

      // Standardized deterministic signup OTP verification (no generic email fallback)
      const cleanEmail = email.trim().toLowerCase();
      const { error } = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token: cleanCode,
        type: 'signup',
      });

      if (error) {
        if (error.message.includes('Token has expired') || error.message.includes('expired')) {
          setErrorMessage('The verification code has expired. Please click "Resend code" to receive a new one.');
        } else if (error.message.includes('invalid') || error.message.includes('Token is invalid')) {
          setErrorMessage('Invalid verification code. Please check your email and try again.');
        } else {
          setErrorMessage(error.message);
        }
      } else {
        setSuccessMessage('Email verified successfully!');
        await refreshSession();

        const dest = redirectTo || '/explore';
        setTimeout(() => {
          if (onNavigate) {
            onNavigate(dest);
          } else {
            window.location.href = dest;
          }
        }, 1000);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected error occurred during verification.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || resending) return;

    setErrorMessage(null);
    setSuccessMessage(null);

    if (!email.trim()) {
      setErrorMessage('Please provide an email address to resend the code.');
      return;
    }

    setResending(true);

    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setErrorMessage('Supabase is not configured.');
        return;
      }

      const cleanEmail = email.trim().toLowerCase();
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: cleanEmail,
      });

      if (error) {
        if (error.message.includes('rate limit') || error.status === 429) {
          setErrorMessage('Too many requests. Please wait a minute before requesting another code.');
        } else {
          setErrorMessage(error.message);
        }
      } else {
        setSuccessMessage(`A new verification code has been sent to ${cleanEmail}.`);
        setCooldown(60);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred while resending code.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="page-shell">
      <Navbar onNavigate={onNavigate} />
      <main className="auth-layout-grid">
        <section className="auth-hero-section">
          <h1 className="auth-hero-branding">Verify your email address.</h1>
          <p className="auth-hero-subtext">
            We sent a verification code to your email. Enter the code below to complete your SkillSwap registration and start trading expertise.
          </p>
        </section>

        <section className="auth-card-container">
          <div className="auth-card-header">
            <h2 className="auth-card-title">Enter Verification Code</h2>
            <p className="auth-card-subtitle">
              Sent to <strong style={{ color: 'var(--color-primary, #d6a64a)' }}>{email || 'your email'}</strong>
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
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <span>{successMessage}</span>
            </div>
          )}

          <form onSubmit={handleVerify} noValidate>
            {!email && (
              <div className="auth-form-group">
                <label htmlFor="verify-email-input" className="auth-label">
                  Email Address
                </label>
                <input
                  id="verify-email-input"
                  type="email"
                  autoComplete="email"
                  className="auth-input"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading || resending}
                />
              </div>
            )}

            <div className="auth-form-group">
              <label htmlFor="verify-otp-input" className="auth-label">
                Verification Code
              </label>
              <input
                id="verify-otp-input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                className="auth-input"
                placeholder="6-digit code"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                disabled={loading}
                autoFocus
                maxLength={6}
              />
            </div>

            <button type="submit" className="auth-submit-btn" disabled={loading}>
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                  <svg className="spinner" viewBox="0 0 24 24" width="16" height="16" style={{ animation: 'spin 1s linear infinite' }}>
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.25" />
                    <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" opacity="0.75" />
                  </svg>
                  Verifying...
                </span>
              ) : (
                'Verify Email →'
              )}
            </button>
          </form>

          <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--shell-border, rgba(17, 22, 28, 0.12))', display: 'flex', flexDirection: 'column', gap: '0.75rem', textAlign: 'center' }}>
            <p style={{ fontSize: '0.9rem', opacity: 0.85 }}>
              Didn't receive a code?{' '}
              <button
                type="button"
                className="auth-link"
                onClick={handleResend}
                disabled={cooldown > 0 || resending}
                style={{ background: 'none', border: 'none', padding: 0, cursor: cooldown > 0 || resending ? 'not-allowed' : 'pointer', opacity: cooldown > 0 || resending ? 0.6 : 1, fontWeight: 600 }}
              >
                {resending ? 'Sending...' : cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend verification code'}
              </button>
            </p>

            <p style={{ fontSize: '0.85rem', opacity: 0.75 }}>
              Wrong email address?{' '}
              <a
                href="/signup"
                className="auth-link"
                onClick={(e) => {
                  e.preventDefault();
                  if (onNavigate) onNavigate(`/signup${redirectTo ? `?redirectTo=${encodeURIComponent(redirectTo)}` : ''}`);
                }}
              >
                Go back to signup
              </a>
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
