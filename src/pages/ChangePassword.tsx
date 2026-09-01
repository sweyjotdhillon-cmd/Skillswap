import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from '../components/navigation/Navbar';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { useAuth } from '../context/AuthContext';
import { formatFriendlyErrorMessage, checkUserHasPassword } from '../lib/supabase/profile';

type ChangePasswordPageProps = {
  onNavigate?: (path: string) => void;
};

export function ChangePasswordPage({ onNavigate }: ChangePasswordPageProps) {
  const { user, isGoogleUser } = useAuth();
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [checkingPasswordState, setCheckingPasswordState] = useState(true);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [errors, setErrors] = useState<{ currentPassword?: string; newPassword?: string; confirmPassword?: string }>({});

  const loadPasswordState = useCallback(async () => {
    if (!user) {
      setHasPassword(null);
      setCheckingPasswordState(false);
      return;
    }

    setCheckingPasswordState(true);
    const result = await checkUserHasPassword();
    // Fallback: if RPC returns null due to connection glitch, default safely to requiring password
    setHasPassword(result !== null ? result : true);
    setCheckingPasswordState(false);
  }, [user]);

  useEffect(() => {
    loadPasswordState();
  }, [loadPasswordState]);

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

  const validate = () => {
    const newErrs: { currentPassword?: string; newPassword?: string; confirmPassword?: string } = {};

    if (hasPassword === true) {
      if (!currentPassword) {
        newErrs.currentPassword = 'Please enter your current password.';
      }
    }

    if (!newPassword) {
      newErrs.newPassword = 'Please enter a new password.';
    } else if (newPassword.length < 8) {
      newErrs.newPassword = 'Password must be at least 8 characters long.';
    }

    if (!confirmPassword) {
      newErrs.confirmPassword = 'Please confirm your new password.';
    } else if (newPassword !== confirmPassword) {
      newErrs.confirmPassword = 'Passwords do not match.';
    }

    setErrors(newErrs);
    return Object.keys(newErrs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (loading) return;

    if (!user) {
      setErrorMessage('You must be signed in to change your password.');
      return;
    }

    if (!validate()) return;

    setLoading(true);

    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setErrorMessage('Supabase is not configured.');
        return;
      }

      // Re-authenticate if user already has a password credential
      if (hasPassword === true) {
        const { error: reauthErr } = await supabase.auth.signInWithPassword({
          email: user.email!,
          password: currentPassword,
        });

        if (reauthErr) {
          setErrorMessage('Your current password is incorrect. Please verify and try again.');
          setLoading(false);
          return;
        }
      }

      // Update user password via Supabase Auth
      const { error: updateErr } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateErr) {
        setErrorMessage(formatFriendlyErrorMessage(updateErr));
      } else {
        setSuccessMessage('Password updated successfully.');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');

        // Refresh password credential state authoritatively
        const updatedHasPassword = await checkUserHasPassword();
        setHasPassword(updatedHasPassword !== null ? updatedHasPassword : true);
      }
    } catch (err: any) {
      setErrorMessage(formatFriendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const isFirstTimePasswordSetup = hasPassword === false;

  return (
    <div className="page-shell">
      <Navbar onNavigate={onNavigate} />
      <main className="auth-layout-grid" style={{ gridTemplateColumns: '1fr', maxWidth: '540px', margin: '0 auto' }}>
        <section className="auth-card-container">
          {checkingPasswordState ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem 1rem', gap: '1rem' }}>
              <svg className="spinner" viewBox="0 0 24 24" width="28" height="28" style={{ animation: 'spin 1s linear infinite', color: 'var(--accent-color, #d6a64a)' }}>
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.25" />
                <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" opacity="0.75" />
              </svg>
              <p style={{ fontSize: '0.9rem', opacity: 0.8 }}>Loading security settings...</p>
            </div>
          ) : (
            <>
              <div className="auth-card-header">
                <h2 className="auth-card-title">
                  {isFirstTimePasswordSetup ? 'Set Password' : 'Change Password'}
                </h2>
                <p className="auth-card-subtitle">
                  {isFirstTimePasswordSetup
                    ? 'Create a password for your SkillSwap account so you can log in using email and password.'
                    : 'Update your SkillSwap account security credentials.'}
                </p>
              </div>

              {isFirstTimePasswordSetup && isGoogleUser && (
                <div className="auth-alert auth-alert--info" style={{ backgroundColor: 'rgba(3, 105, 161, 0.08)', borderColor: 'rgba(3, 105, 161, 0.2)', color: '#0369a1', marginBottom: '1.5rem' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  <span>
                    Your account was created with Google Sign-In. You can set a password below to enable email/password login alongside Google. You will not be asked for a previous password.
                  </span>
                </div>
              )}

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

          <form onSubmit={handleSubmit} noValidate>
            {hasPassword === true && (
              <div className="auth-form-group">
                <label htmlFor="current-password-input" className="auth-label">
                  Current Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="current-password-input"
                    type={showCurrentPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    className={`auth-input ${errors.currentPassword ? 'input-error' : ''}`}
                    placeholder="••••••••"
                    value={currentPassword}
                    onChange={(e) => {
                      setCurrentPassword(e.target.value);
                      if (errors.currentPassword) setErrors((prev) => ({ ...prev, currentPassword: undefined }));
                    }}
                    disabled={loading}
                    style={{ paddingRight: '2.5rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
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
                    aria-label={showCurrentPassword ? 'Hide current password' : 'Show current password'}
                  >
                    {showCurrentPassword ? (
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
                {errors.currentPassword && (
                  <p className="error-message" style={{ color: '#e53e3e', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                    {errors.currentPassword}
                  </p>
                )}
              </div>
            )}

            <div className="auth-form-group">
              <label htmlFor="change-new-password" className="auth-label">
                New Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="change-new-password"
                  type={showNewPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  className={`auth-input ${errors.newPassword ? 'input-error' : ''}`}
                  placeholder="At least 8 characters"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    if (errors.newPassword) setErrors((prev) => ({ ...prev, newPassword: undefined }));
                  }}
                  disabled={loading}
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
                  aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
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
              {errors.newPassword && (
                <p className="error-message" style={{ color: '#e53e3e', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                  {errors.newPassword}
                </p>
              )}
            </div>

            <div className="auth-form-group">
              <label htmlFor="change-confirm-password" className="auth-label">
                Confirm New Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="change-confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  className={`auth-input ${errors.confirmPassword ? 'input-error' : ''}`}
                  placeholder="Repeat new password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (errors.confirmPassword) setErrors((prev) => ({ ...prev, confirmPassword: undefined }));
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
                  aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
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
                'Update Password →'
              )}
            </button>
          </form>

          <p className="auth-footer-text">
            <button
              type="button"
              className="auth-link"
              onClick={() => {
                if (onNavigate) {
                  onNavigate('/explore');
                } else {
                  window.location.href = '/explore';
                }
              }}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            >
              ← Back to Explore
            </button>
          </p>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
