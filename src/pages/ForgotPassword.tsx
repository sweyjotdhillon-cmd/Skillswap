import React, { useState } from 'react';
import { Navbar } from '../components/navigation/Navbar';
import { getSupabaseBrowserClient } from '../lib/supabase/client';

type ForgotPasswordPageProps = {
  onNavigate?: (path: string) => void;
};

export function ForgotPasswordPage({ onNavigate }: ForgotPasswordPageProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ email?: string }>({});

  const validate = () => {
    const newErrors: { email?: string } = {};
    if (!email.trim()) {
      newErrors.email = 'Please enter your email address.';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'Please enter a valid email address.';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!validate()) return;

    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const redirectUrl = `${window.location.origin}/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });

      if (error) {
        setErrorMessage(error.message);
      } else {
        setSuccessMessage('Password reset instructions have been sent to your email address.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred while requesting password reset.');
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
            <span className="section-eyebrow">Account Recovery</span>
            <h1 className="auth-title">Reset your password</h1>
            <p className="auth-subtitle">
              Enter your registered email address and we'll send you a password reset link.
            </p>
          </div>

          {errorMessage && (
            <div className="status-banner status-banner--error" role="alert">
              {errorMessage}
            </div>
          )}

          {successMessage && (
            <div className="status-banner status-banner--success" role="status">
              {successMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="auth-form">
            <div className="form-group">
              <label htmlFor="reset-email" className="form-label">
                Email Address
              </label>
              <input
                id="reset-email"
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

            <button type="submit" className="auth-submit-btn" disabled={loading}>
              {loading ? (
                <span className="auth-btn-loading">
                  <svg className="spinner" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Sending link...
                </span>
              ) : (
                'Send Reset Link'
              )}
            </button>
          </form>

          <div className="auth-footer">
            <p>
              Remembered your password?{' '}
              <a
                href="/login"
                className="auth-link-bold"
                onClick={(e) => {
                  e.preventDefault();
                  if (onNavigate) onNavigate('/login');
                }}
              >
                Back to Log in
              </a>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
