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
    } else if (!/\S+@\S+\.\S+/.test(email)) {
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
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          setErrorMessage('Invalid email or password. Please check your details and try again.');
        } else {
          setErrorMessage(error.message);
        }
      } else {
        const dest = redirectTo || '/explore';
        if (onNavigate) {
          onNavigate(dest);
        } else {
          window.location.href = dest;
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-shell">
      <Navbar onNavigate={onNavigate} />
      <main className="auth-page-container">
        <div className="auth-card">
          <div className="auth-header">
            <span className="section-eyebrow">Welcome Back</span>
            <h1 className="auth-title">Log in to SkillSwap</h1>
            <p className="auth-subtitle">
              Continue trading expertise, managing swaps, and earning SkillCredits.
            </p>
          </div>

          {errorMessage && (
            <div className="status-banner status-banner--error" role="alert">
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="auth-form">
            <div className="form-group">
              <label htmlFor="login-email" className="form-label">
                Email Address
              </label>
              <input
                id="login-email"
                type="email"
                className={`form-input ${errors.email ? 'input-error' : ''}`}
                placeholder="you@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
                }}
                disabled={loading}
              />
              {errors.email && <p className="error-message">{errors.email}</p>}
            </div>

            <div className="form-group">
              <div className="form-label-row-between">
                <label htmlFor="login-password" className="form-label">
                  Password
                </label>
                <a
                  href="/forgot-password"
                  className="auth-link-small"
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
                className={`form-input ${errors.password ? 'input-error' : ''}`}
                placeholder="••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
                }}
                disabled={loading}
              />
              {errors.password && <p className="error-message">{errors.password}</p>}
            </div>

            <button type="submit" className="auth-submit-btn" disabled={loading}>
              {loading ? (
                <span className="auth-btn-loading">
                  <svg className="spinner" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Logging in...
                </span>
              ) : (
                'Log In'
              )}
            </button>
          </form>

          <div className="auth-footer">
            <p>
              Don't have an account?{' '}
              <a
                href="/signup"
                className="auth-link-bold"
                onClick={(e) => {
                  e.preventDefault();
                  if (onNavigate) onNavigate(`/signup${redirectTo ? `?redirectTo=${encodeURIComponent(redirectTo)}` : ''}`);
                }}
              >
                Sign up
              </a>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
