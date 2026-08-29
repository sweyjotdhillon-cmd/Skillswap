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

  const calculateStrength = (pwd: string) => {
    if (!pwd) return { score: 0, label: '', color: '' };
    let score = 0;
    if (pwd.length >= 6) score += 1;
    if (pwd.length >= 10) score += 1;
    if (/[A-Z]/.test(pwd)) score += 1;
    if (/[0-9]/.test(pwd)) score += 1;
    if (/[^A-Za-z0-9]/.test(pwd)) score += 1;

    if (score <= 1) return { score: 1, label: 'Weak', color: '#e53e3e' };
    if (score <= 3) return { score: 2, label: 'Medium', color: '#dd6b20' };
    return { score: 3, label: 'Strong', color: '#38a169' };
  };

  const strength = calculateStrength(password);

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
        setErrorMessage('Supabase is not configured.');
        return;
      }
      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        setErrorMessage(error.message);
      } else {
        setSuccessMessage('Password updated successfully! Please log in with your new password.');
        // Sign out recovery session to enforce fresh login with new password
        await supabase.auth.signOut();
        setTimeout(() => {
          if (onNavigate) {
            onNavigate('/login');
          } else {
            window.location.href = '/login';
          }
        }, 2000);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred while updating your password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-shell">
      <Navbar onNavigate={onNavigate} />
      <main className="auth-layout-grid" style={{ gridTemplateColumns: '1fr', maxWidth: '600px' }}>
        <section className="auth-card-container">
          <div className="auth-card-header">
            <h2 className="auth-card-title">Create New Password</h2>
            <p className="auth-card-subtitle">Enter a secure new password for your SkillSwap account.</p>
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

          <form onSubmit={handleSubmit} noValidate>
            <div className="auth-form-group">
              <label htmlFor="new-password" className="auth-label">
                New Password
              </label>
              <input
                id="new-password"
                type="password"
                className={`auth-input ${errors.password ? 'input-error' : ''}`}
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
                }}
                disabled={loading}
              />
              {password && (
                <div style={{ marginTop: '0.4rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>Strength:</span>
                  <span style={{ color: strength.color, fontWeight: 600 }}>{strength.label}</span>
                </div>
              )}
              {errors.password && (
                <p className="error-message" style={{ color: '#e53e3e', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                  {errors.password}
                </p>
              )}
            </div>

            <div className="auth-form-group">
              <label htmlFor="confirm-new-password" className="auth-label">
                Confirm New Password
              </label>
              <input
                id="confirm-new-password"
                type="password"
                className={`auth-input ${errors.confirmPassword ? 'input-error' : ''}`}
                placeholder="Repeat new password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (errors.confirmPassword) setErrors((prev) => ({ ...prev, confirmPassword: undefined }));
                }}
                disabled={loading}
              />
              {errors.confirmPassword && (
                <p className="error-message" style={{ color: '#e53e3e', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                  {errors.confirmPassword}
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

          <p className="auth-footer-text">
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
