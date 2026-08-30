import React, { useState } from 'react';
import { Navbar } from '../components/navigation/Navbar';
import { getSupabaseBrowserClient } from '../lib/supabase/client';

type LoginPageProps = {
  onNavigate?: (path: string) => void;
  redirectTo?: string;
};

export function LoginPage({ onNavigate, redirectTo }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const validate = () => {
    const newErrors: { email?: string; password?: string } = {};
    if (!email.trim()) {
      newErrors.email = 'Please enter your email address.';
    } else if (!/\S+@\S+\.\S+/.test(email.trim())) {
      newErrors.email = 'Please enter a valid email address.';
    }

    if (!password) {
      newErrors.password = 'Please enter your password.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!validate()) return;

    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setErrorMessage('Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY environment variables.');
        return;
      }
      const cleanEmail = email.trim().toLowerCase();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) {
        if (error.message.includes('Email not confirmed')) {
          const verifyUrl = `/verify-email?email=${encodeURIComponent(cleanEmail)}${redirectTo ? `&redirectTo=${encodeURIComponent(redirectTo)}` : ''}`;
          if (onNavigate) {
            onNavigate(verifyUrl);
          } else {
            window.location.href = verifyUrl;
          }
        } else if (
          error.message.includes('Invalid login credentials') ||
          error.status === 400
        ) {
          setErrorMessage('Account not found or invalid credentials. If you do not have an account yet, please create one.');
        } else {
          setErrorMessage(error.message || 'Invalid email or password. Please check your credentials and try again.');
        }
      } else {
        const user = data.user;
        const isVerified = Boolean(
          user &&
            (Boolean(user.email_confirmed_at) ||
              user.app_metadata?.provider === 'google' ||
              (Array.isArray(user.app_metadata?.providers) && user.app_metadata.providers.includes('google')) ||
              (Array.isArray(user.identities) && user.identities.some((id) => id.provider === 'google')))
        );

        if (!isVerified) {
          const verifyUrl = `/verify-email?email=${encodeURIComponent(cleanEmail)}${redirectTo ? `&redirectTo=${encodeURIComponent(redirectTo)}` : ''}`;
          if (onNavigate) {
            onNavigate(verifyUrl);
          } else {
            window.location.href = verifyUrl;
          }
        } else {
          const dest = redirectTo || '/explore';
          if (onNavigate) {
            onNavigate(dest);
          } else {
            window.location.href = dest;
          }
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMessage(null);
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setErrorMessage('Supabase is not configured.');
        return;
      }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}${redirectTo ? redirectTo : '/explore'}`,
        },
      });
      if (error) {
        throw error;
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected error occurred during Google sign in.');
    }
  };

  return (
    <div className="page-shell">
      <Navbar onNavigate={onNavigate} />
      <main className="auth-layout-grid">
        <section className="auth-hero-section">
          <h1 className="auth-hero-branding">Skills are your currency.</h1>
          <p className="auth-hero-subtext">
            Welcome back to the community where value flows through people, not money. Continue trading expertise, managing swaps, and earning SkillCredits.
          </p>
        </section>

        <section className="auth-card-container">
          <div className="auth-card-header">
            <h2 className="auth-card-title">Welcome back</h2>
            <p className="auth-card-subtitle">Log in to your SkillSwap account</p>
          </div>

          {errorMessage && (
            <div className="auth-alert auth-alert--error" role="alert">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{errorMessage}</span>
            </div>
          )}

          <button type="button" className="auth-google-btn" onClick={handleGoogleSignIn}>
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          <div className="auth-divider">Or</div>

          <form onSubmit={handleSubmit} noValidate>
            <div className="auth-form-group">
              <label htmlFor="login-email" className="auth-label">
                Email Address
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                className={`auth-input ${errors.email ? 'input-error' : ''}`}
                placeholder="you@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
                }}
                disabled={loading}
              />
              {errors.email && <p className="error-message" style={{ color: '#e53e3e', fontSize: '0.8rem', marginTop: '0.25rem' }}>{errors.email}</p>}
            </div>

            <div className="auth-form-group">
              <div className="auth-label-row">
                <label htmlFor="login-password" className="auth-label">
                  Password
                </label>
                <a
                  href="/forgot-password"
                  className="auth-link"
                  onClick={(e) => {
                    e.preventDefault();
                    if (onNavigate) onNavigate('/forgot-password');
                  }}
                >
                  Forgot password?
                </a>
              </div>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                className={`auth-input ${errors.password ? 'input-error' : ''}`}
                placeholder="••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
                }}
                disabled={loading}
              />
              {errors.password && <p className="error-message" style={{ color: '#e53e3e', fontSize: '0.8rem', marginTop: '0.25rem' }}>{errors.password}</p>}
            </div>

            <button type="submit" className="auth-submit-btn" disabled={loading}>
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <svg className="spinner" viewBox="0 0 24 24" width="16" height="16" style={{ animation: 'spin 1s linear infinite' }}>
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.25" />
                    <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" opacity="0.75" />
                  </svg>
                  Logging in...
                </span>
              ) : (
                'Log in →'
              )}
            </button>
          </form>

          <p className="auth-footer-text">
            Don't have an account?{' '}
            <a
              href="/signup"
              className="auth-link"
              onClick={(e) => {
                e.preventDefault();
                if (onNavigate) onNavigate(`/signup${redirectTo ? `?redirectTo=${encodeURIComponent(redirectTo)}` : ''}`);
              }}
            >
              Create one
            </a>
          </p>
        </section>
      </main>
    </div>
  );
}
