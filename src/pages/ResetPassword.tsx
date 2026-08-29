import React, { useState } from 'react';
import { Navbar } from '../components/navigation/Navbar';
import { getSupabaseBrowserClient } from '../lib/supabase/client';

type ResetPasswordPageProps = {
  onNavigate?: (path: string) => void;
};

export function ResetPasswordPage({ onNavigate }: ResetPasswordPageProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string }>({});

  const validate = () => {
    const newErrors: { password?: string; confirmPassword?: string } = {};

    if (!password) {
      newErrors.password = 'Please enter a new password.';
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters long.';
    }

    if (!confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your new password.';
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match.';
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
      if (!supabase) {
        setErrorMessage('Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY environment variables.');
        return;
      }
      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        setErrorMessage(error.message);
      } else {
        setSuccessMessage('Your password has been reset successfully! Redirecting to login...');
        setTimeout(() => {
          if (onNavigate) {
            onNavigate('/login');
          } else {
            window.location.href = '/login';
          }
        }, 3000);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred while setting your new password.');
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
            <span className="section-eyebrow">Set New Password</span>
            <h1 className="auth-title">Update Your Password</h1>
            <p className="auth-subtitle">
              Enter a new secure password for your SkillSwap account.
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
              <label htmlFor="new-password" className="form-label">
                New Password
              </label>
              <input
                id="new-password"
                type="password"
                className={`form-input ${errors.password ? 'input-error' : ''}`}
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
                }}
                disabled={loading}
              />
              {errors.password && <p className="error-message">{errors.password}</p>}
            </div>

            <div className="form-group">
              <label htmlFor="confirm-new-password" className="form-label">
                Confirm New Password
              </label>
              <input
                id="confirm-new-password"
                type="password"
                className={`form-input ${errors.confirmPassword ? 'input-error' : ''}`}
                placeholder="Repeat new password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (errors.confirmPassword) setErrors((prev) => ({ ...prev, confirmPassword: undefined }));
                }}
                disabled={loading}
              />
              {errors.confirmPassword && <p className="error-message">{errors.confirmPassword}</p>}
            </div>

            <button type="submit" className="auth-submit-btn" disabled={loading}>
              {loading ? (
                <span className="auth-btn-loading">
                  <svg className="spinner" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Updating password...
                </span>
              ) : (
                'Update Password'
              )}
            </button>
          </form>

          <div className="auth-footer">
            <p>
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
