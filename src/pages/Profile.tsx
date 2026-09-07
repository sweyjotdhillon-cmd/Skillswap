import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navbar } from '../components/navigation/Navbar';
import {
  Profile,
  UserSkill,
  UserCustomSkill,
  Skill,
  getProfile,
  getUserSkills,
  getSkillsCatalog,
  searchSkillsCatalog,
  addUserSkill,
  removeUserSkill,
  formatFriendlyErrorMessage,
} from '../lib/supabase/profile';
import { getUserCompletedSwapsCount } from '../lib/supabase/credits';
import { getSupabaseBrowserClient } from '../lib/supabase/client';

type ProfilePageProps = {
  onNavigate?: (path: string) => void;
};

export function ProfilePage({ onNavigate }: ProfilePageProps) {
  const { user, profile: authProfile, account, connectedProviders, refreshProfile, isVerified } = useAuth();

  const [profile, setProfile] = useState<Profile | null>(authProfile);
  const [predefinedSkills, setPredefinedSkills] = useState<UserSkill[]>([]);
  const [customSkills, setCustomSkills] = useState<UserCustomSkill[]>([]);
  const [completedSwapsCount, setCompletedSwapsCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modals state
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [isManageSkillsOpen, setIsManageSkillsOpen] = useState(false);

  // Edit profile form state
  const [editFullName, setEditFullName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Skill management state
  const [skillsCatalog, setSkillsCatalog] = useState<Skill[]>([]);
  const [skillSearchQuery, setSkillSearchQuery] = useState('');
  const [customSkillInput, setCustomSkillInput] = useState('');
  const [skillSubmitting, setSkillSubmitting] = useState(false);
  const [skillError, setSkillError] = useState<string | null>(null);
  const [skillSuccess, setSkillSuccess] = useState<string | null>(null);

  const totalSkillsCount = predefinedSkills.length + customSkills.length;

  // Load profile and user skills
  const loadProfileData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      const [fetchedProfile, skillsData, completedCount] = await Promise.all([
        getProfile(user.id),
        getUserSkills(user.id),
        getUserCompletedSwapsCount(user.id),
      ]);

      if (fetchedProfile) {
        setProfile(fetchedProfile);
        setEditFullName(fetchedProfile.full_name || '');
        setEditBio(fetchedProfile.bio || '');
      } else if (authProfile) {
        setProfile(authProfile);
        setEditFullName(authProfile.full_name || '');
        setEditBio(authProfile.bio || '');
      }

      setPredefinedSkills(skillsData.predefined);
      setCustomSkills(skillsData.custom);
      setCompletedSwapsCount(completedCount);
    } catch (err: unknown) {
      console.error('Error loading profile page data:', err);
      setErrorMsg(formatFriendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [user, authProfile]);

  useEffect(() => {
    void loadProfileData();
  }, [loadProfileData]);

  // Load skills catalog when Manage Skills modal opens
  useEffect(() => {
    if (isManageSkillsOpen) {
      getSkillsCatalog()
        .then((cat) => setSkillsCatalog(cat))
        .catch((err) => setSkillError(formatFriendlyErrorMessage(err)));
    }
  }, [isManageSkillsOpen]);

  // Search catalog skills with debouncing
  useEffect(() => {
    if (!isManageSkillsOpen) return;

    const timer = setTimeout(async () => {
      try {
        if (skillSearchQuery.trim()) {
          const results = await searchSkillsCatalog(skillSearchQuery.trim());
          setSkillsCatalog(results);
        } else {
          const fullCatalog = await getSkillsCatalog();
          setSkillsCatalog(fullCatalog);
        }
      } catch (err) {
        console.error('Error searching catalog:', err);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [skillSearchQuery, isManageSkillsOpen]);

  // Handle Edit Profile Save
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;

    if (!editFullName.trim()) {
      setEditError('Full name is required.');
      return;
    }

    setEditSubmitting(true);
    setEditError(null);

    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error('Unable to save profile right now. Please try again.');

      const { error: updateErr } = await supabase
        .from('profiles')
        .update({
          full_name: editFullName.trim(),
          bio: editBio.trim() || null,
        })
        .eq('id', user.id);

      if (updateErr) {
        throw updateErr;
      }

      // Refresh AuthContext profile state
      await refreshProfile();
      await loadProfileData();
      setIsEditProfileOpen(false);
    } catch (err: unknown) {
      console.error('Failed to update profile:', err);
      setEditError(formatFriendlyErrorMessage(err));
    } finally {
      setEditSubmitting(false);
    }
  };

  // Handle Adding Predefined Skill
  const handleAddPredefinedSkill = async (skillId: string) => {
    if (totalSkillsCount >= 10) {
      setSkillError('Maximum skill limit reached (10 total skills).');
      return;
    }

    setSkillSubmitting(true);
    setSkillError(null);
    setSkillSuccess(null);

    try {
      const result = await addUserSkill({ skillId });
      if (!result.success) {
        setSkillError(result.error || 'Failed to add skill.');
      } else {
        setSkillSuccess('Skill added successfully.');
        await loadProfileData();
      }
    } catch (err: unknown) {
      setSkillError(formatFriendlyErrorMessage(err));
    } finally {
      setSkillSubmitting(false);
    }
  };

  // Handle Adding Custom Skill
  const handleAddCustomSkill = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanName = customSkillInput.trim();
    if (!cleanName) return;

    if (totalSkillsCount >= 10) {
      setSkillError('Maximum skill limit reached (10 total skills).');
      return;
    }

    setSkillSubmitting(true);
    setSkillError(null);
    setSkillSuccess(null);

    try {
      const result = await addUserSkill({ customSkillName: cleanName });
      if (!result.success) {
        setSkillError(result.error || 'Failed to add custom skill.');
      } else {
        setCustomSkillInput('');
        setSkillSuccess(`Custom skill "${cleanName}" added.`);
        await loadProfileData();
      }
    } catch (err: unknown) {
      setSkillError(formatFriendlyErrorMessage(err));
    } finally {
      setSkillSubmitting(false);
    }
  };

  // Handle Removing Skill
  const handleRemoveSkill = async (type: 'predefined' | 'custom', skillId: string) => {
    setSkillSubmitting(true);
    setSkillError(null);
    setSkillSuccess(null);

    try {
      const ok = await removeUserSkill(type, skillId);
      if (ok) {
        await loadProfileData();
      } else {
        setSkillError('Could not remove skill. Please try again.');
      }
    } catch (err: unknown) {
      setSkillError(formatFriendlyErrorMessage(err));
    } finally {
      setSkillSubmitting(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="page-shell">
        <Navbar onNavigate={onNavigate} currentPath="/profile" />
        <div style={{ display: 'grid', placeItems: 'center', minHeight: '50vh' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <div className="spinner-dots" style={{ width: '28px', height: '28px' }} />
            <span style={{ fontSize: '0.95rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              Loading your profile...
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Missing profile or incomplete profile state handling
  if (!profile || profile.profile_completed === false) {
    return (
      <div className="page-shell">
        <Navbar onNavigate={onNavigate} currentPath="/profile" />
        <div style={{ maxWidth: '540px', margin: '4rem auto', textAlign: 'center' }}>
          <div className="profile-hero-card" style={{ padding: '2.5rem' }}>
            <h2 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: '1.8rem', marginBottom: '0.75rem' }}>
              Profile Setup Required
            </h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
              Your account doesn't have a completed profile yet. Please complete the quick onboarding steps first.
            </p>
            <button
              type="button"
              className="action-button action-button--filled"
              style={{ margin: '0 auto' }}
              onClick={() => onNavigate && onNavigate('/onboarding')}
            >
              Complete Profile Setup
            </button>
          </div>
        </div>
      </div>
    );
  }

  const initials = profile.full_name
    ? profile.full_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'SS';

  return (
    <div className="page-shell">
      <Navbar onNavigate={onNavigate} currentPath="/profile" />

      <main className="profile-page-main">
        {errorMsg && (
          <div className="auth-alert auth-alert--error" style={{ marginBottom: '1.5rem' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{errorMsg}</span>
          </div>
        )}

        {/* PROFILE HERO */}
        <section className="profile-hero-card" aria-label="Profile Hero">
          <div className="profile-hero-content">
            {/* HUMAN FACE PRESENTATION (FFA Eye-Contact Focus) */}
            <div className="profile-avatar-container">
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.full_name}
                  className="profile-avatar-image swap-avatar-ring"
                />
              ) : (
                <div className="profile-avatar-fallback swap-avatar-ring">
                  {initials}
                </div>
              )}
            </div>

            <div className="profile-hero-identity">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <h1 className="profile-full-name" style={{ margin: 0 }}>{profile.full_name}</h1>

                {/* VERIFIED IDENTITY CUE */}
                {profile.profile_completed && (
                  <span className="verification-badge" title="Verified Profile: Completed onboarding identity setup">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="12" height="12">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Verified Profile
                  </span>
                )}
                {isVerified && !profile.profile_completed && (
                  <span className="verification-badge" title="Verified Account">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="12" height="12">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Verified Account
                  </span>
                )}
              </div>

              <div className="profile-username-row" style={{ marginTop: '0.35rem' }}>
                <span className="profile-username-tag">@{profile.username}</span>
                <span className="profile-permanent-badge" title="Username is permanently tied to your account">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="permanent-lock-icon"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  Permanent username
                </span>
                {profile.created_at && (
                  <span className="trust-member-since-badge" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    • Member since {new Date(profile.created_at).getFullYear()}
                  </span>
                )}
              </div>

              {profile.bio && (
                <p className="profile-hero-bio">{profile.bio}</p>
              )}

              <div className="profile-hero-actions">
                <button
                  type="button"
                  className="profile-edit-btn"
                  onClick={() => {
                    setEditFullName(profile.full_name || '');
                    setEditBio(profile.bio || '');
                    setEditError(null);
                    setIsEditProfileOpen(true);
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    width="16"
                    height="16"
                  >
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  Edit Profile
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* SKILL JOURNEY & CAPABILITY OVERVIEW SECTION */}
        <section className="profile-section-card" aria-label="Skill Journey Overview">
          <div className="profile-section-header">
            <div>
              <h2 className="profile-section-title">Skill Journey &amp; Expertise</h2>
              <span className="profile-section-subtitle">
                Building capability through mutual learning and exchange
              </span>
            </div>
          </div>

          <div className="as-stats-row" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
            <div className="as-stat-item">
              <span className="as-stat-label">Completed Swaps</span>
              <strong className="as-stat-value">{completedSwapsCount} Exchanges</strong>
            </div>
            <div className="as-stat-item">
              <span className="as-stat-label">Skills &amp; Capabilities</span>
              <strong className="as-stat-value">{totalSkillsCount} Listed</strong>
            </div>
            <div className="as-stat-item">
              <span className="as-stat-label">Lifetime Credits Earned</span>
              <strong className="as-stat-value">{account ? `+${account.credits_earned}` : '0'} SkillCredits</strong>
            </div>
            <div className="as-stat-item">
              <span className="as-stat-label">Available Balance</span>
              <strong className="as-stat-value">{account ? account.credits_balance : '0'} SkillCredits</strong>
            </div>
          </div>

          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
            Every exchange you participate in adds real experience to your journey. Share what you know to help peers and learn new skills to broaden your expertise.
          </p>
        </section>

        {/* REPUTATION & REVIEWS SECTION (Honest Empty State) */}
        <section className="profile-section-card" aria-label="Reputation & Reviews">
          <div className="profile-section-header">
            <div>
              <h2 className="profile-section-title">Community Reviews &amp; Social Proof</h2>
              <span className="profile-section-subtitle">
                Feedback from peers and exchange partners across completed swaps
              </span>
            </div>
          </div>

          <div className="profile-reviews-wrapper" style={{ marginTop: '0.5rem' }}>
            <div className="profile-empty-state" style={{ padding: '1.5rem', background: 'var(--card-bg, rgba(255, 255, 255, 0.02))', borderRadius: '10px', border: '1px dashed var(--border-color, rgba(255, 255, 255, 0.1))' }}>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                No reviews yet. Complete skill swaps with community members to build your exchange reputation!
              </p>
            </div>
          </div>
        </section>

        {/* MY SKILLS SECTION */}
        <section className="profile-section-card" aria-label="Skills & Expertise">
          <div className="profile-section-header">
            <div>
              <h2 className="profile-section-title">Skills &amp; Expertise</h2>
              <span className="profile-section-subtitle">
                Capabilities you share and develop across Skillswap ({totalSkillsCount} of 10 selected)
              </span>
            </div>
            <button
              type="button"
              className="profile-manage-skills-btn"
              onClick={() => {
                setSkillError(null);
                setSkillSuccess(null);
                setIsManageSkillsOpen(true);
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                width="16"
                height="16"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Manage Skills
            </button>
          </div>

          <div className="profile-skills-wrapper">
            {totalSkillsCount === 0 ? (
              <div className="profile-empty-state">
                <p>No skills added to your expertise portfolio yet.</p>
                <button
                  type="button"
                  className="profile-empty-action-btn"
                  onClick={() => setIsManageSkillsOpen(true)}
                >
                  + Add skills you offer or want to develop
                </button>
              </div>
            ) : (
              <div className="profile-skills-grid">
                {/* Predefined catalog skills */}
                {predefinedSkills.map((us) => {
                  const skillName = us.skills?.name || 'Predefined Skill';
                  const category = us.skills?.category;
                  return (
                    <div key={us.id} className="profile-skill-chip profile-skill-chip--catalog">
                      <span className="profile-skill-name">{skillName}</span>
                      {category && (
                        <span className="profile-skill-category-tag">{category}</span>
                      )}
                    </div>
                  );
                })}

                {/* Custom skills */}
                {customSkills.map((cs) => (
                  <div key={cs.id} className="profile-skill-chip profile-skill-chip--custom">
                    <span className="profile-skill-name">{cs.skill_name}</span>
                    <span className="profile-custom-tag">Custom</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* CONNECTED ACCOUNTS SECTION */}
        <section className="profile-section-card" aria-label="Connected Accounts">
          <div className="profile-section-header">
            <div>
              <h2 className="profile-section-title">Connected Accounts</h2>
              <span className="profile-section-subtitle">
                Authentication methods linked to your SkillSwap account
              </span>
            </div>
          </div>

          <div className="profile-providers-list">
            {/* GitHub Provider */}
            <div className="profile-provider-row">
              <div className="profile-provider-info">
                <div className="profile-provider-icon profile-provider-icon--github">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="profile-provider-name">GitHub</h3>
                  <p className="profile-provider-desc">Sign in with GitHub account</p>
                </div>
              </div>
              <span className={`profile-provider-badge ${connectedProviders.includes('github') ? 'profile-provider-badge--connected' : 'profile-provider-badge--disconnected'}`}>
                {connectedProviders.includes('github') ? 'GitHub — Connected' : 'Not Connected'}
              </span>
            </div>

            {/* Google Provider */}
            <div className="profile-provider-row">
              <div className="profile-provider-info">
                <div className="profile-provider-icon profile-provider-icon--google">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                </div>
                <div>
                  <h3 className="profile-provider-name">Google</h3>
                  <p className="profile-provider-desc">Sign in with Google account</p>
                </div>
              </div>
              <span className={`profile-provider-badge ${connectedProviders.includes('google') ? 'profile-provider-badge--connected' : 'profile-provider-badge--disconnected'}`}>
                {connectedProviders.includes('google') ? 'Google — Connected' : 'Not Connected'}
              </span>
            </div>

            {/* Email / Password Provider */}
            <div className="profile-provider-row">
              <div className="profile-provider-info">
                <div className="profile-provider-icon profile-provider-icon--email">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                </div>
                <div>
                  <h3 className="profile-provider-name">Email & Password</h3>
                  <p className="profile-provider-desc">{user?.email || 'Direct account credentials'}</p>
                </div>
              </div>
              <span className={`profile-provider-badge ${(connectedProviders.includes('email') || Boolean(user?.email)) ? 'profile-provider-badge--connected' : 'profile-provider-badge--disconnected'}`}>
                {(connectedProviders.includes('email') || Boolean(user?.email)) ? 'Email — Connected' : 'Not Connected'}
              </span>
            </div>
          </div>
        </section>

        {/* ABOUT ME SECTION */}
        <section className="profile-section-card" aria-label="About Me">
          <div className="profile-section-header">
            <h2 className="profile-section-title">About Me</h2>
          </div>

          <div className="profile-about-body">
            {profile.bio && profile.bio.trim() ? (
              <p className="profile-bio-text">{profile.bio}</p>
            ) : (
              <div className="profile-empty-state">
                <p>No bio added yet.</p>
                <button
                  type="button"
                  className="profile-empty-action-btn"
                  onClick={() => {
                    setEditFullName(profile.full_name || '');
                    setEditBio('');
                    setEditError(null);
                    setIsEditProfileOpen(true);
                  }}
                >
                  + Add bio
                </button>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* EDIT PROFILE MODAL */}
      {isEditProfileOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="edit-profile-modal-title">
          <div className="modal-content profile-modal-content">
            <h2 id="edit-profile-modal-title" className="modal-title">Edit Profile</h2>

            {editError && (
              <div className="auth-alert auth-alert--error" style={{ marginBottom: '1rem' }}>
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleSaveProfile} className="profile-edit-form">
              {/* Full Name (Editable) */}
              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label htmlFor="edit-full-name" className="form-label">
                  Full Name <span className="badge-required">*</span>
                </label>
                <input
                  id="edit-full-name"
                  type="text"
                  className="form-input"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  placeholder="e.g. Alex Morgan"
                  maxLength={100}
                  required
                />
              </div>

              {/* Permanent Username (Non-Editable / Locked) */}
              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <div className="form-label-row">
                  <label className="form-label">Username</label>
                  <span className="permanent-indicator-text">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    Permanent
                  </span>
                </div>
                <div className="onboarding-username-input-wrapper">
                  <span className="username-prefix">@</span>
                  <input
                    type="text"
                    className="form-input username-input"
                    value={profile.username || ''}
                    disabled
                    aria-readonly="true"
                  />
                </div>
                <p className="form-helper-text" style={{ marginTop: '0.4rem', fontSize: '0.8rem' }}>
                  Usernames are permanently bound to your account ID and cannot be changed.
                </p>
              </div>

              {/* Bio (Editable) */}
              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label htmlFor="edit-bio" className="form-label">
                  Bio / About Me <span className="badge-optional">(Optional)</span>
                </label>
                <textarea
                  id="edit-bio"
                  className="form-textarea"
                  style={{ minHeight: '100px' }}
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  placeholder="Tell the SkillSwap community about your background, expertise, or goals..."
                  maxLength={500}
                />
                <div className="counter-row">
                  <span className="char-counter">{editBio.length} / 500</span>
                </div>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-btn modal-btn--cancel"
                  onClick={() => setIsEditProfileOpen(false)}
                  disabled={editSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="modal-btn modal-btn--confirm"
                  disabled={editSubmitting}
                >
                  {editSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MANAGE SKILLS MODAL */}
      {isManageSkillsOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="manage-skills-modal-title">
          <div className="modal-content profile-manage-skills-modal">
            <div className="modal-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 id="manage-skills-modal-title" className="modal-title" style={{ margin: 0 }}>
                Manage Skills
              </h2>
              <span className={`skills-counter-badge ${totalSkillsCount >= 10 ? 'skills-counter-badge--full' : ''}`}>
                {totalSkillsCount} / 10
              </span>
            </div>

            {skillError && (
              <div className="auth-alert auth-alert--error" style={{ marginBottom: '1rem' }}>
                <span>{skillError}</span>
              </div>
            )}

            {skillSuccess && (
              <div className="auth-alert auth-alert--success" style={{ marginBottom: '1rem' }}>
                <span>{skillSuccess}</span>
              </div>
            )}

            {/* Currently Selected Skills List */}
            <div className="onboarding-selected-skills-section" style={{ marginBottom: '1.25rem' }}>
              <div className="selected-skills-header-row">
                <span className="section-mini-label">Your Current Skills</span>
              </div>
              {totalSkillsCount === 0 ? (
                <p className="empty-skills-note">No skills added yet. Choose from catalog below or add custom skill.</p>
              ) : (
                <div className="skills-chips-wrapper">
                  {predefinedSkills.map((us) => {
                    const skillName = us.skills?.name || 'Predefined Skill';
                    return (
                      <span key={us.id} className="skill-chip">
                        <span className="skill-chip-name">{skillName}</span>
                        <button
                          type="button"
                          className="skill-chip-remove"
                          title={`Remove ${skillName}`}
                          onClick={() => handleRemoveSkill('predefined', us.id)}
                          disabled={skillSubmitting}
                        >
                          &times;
                        </button>
                      </span>
                    );
                  })}
                  {customSkills.map((cs) => (
                    <span key={cs.id} className="skill-chip">
                      <span className="skill-chip-name">{cs.skill_name}</span>
                      <span className="custom-skill-badge">Custom</span>
                      <button
                        type="button"
                        className="skill-chip-remove"
                        title={`Remove ${cs.skill_name}`}
                        onClick={() => handleRemoveSkill('custom', cs.id)}
                        disabled={skillSubmitting}
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Search Predefined Catalog */}
            <div className="skills-search-group" style={{ marginBottom: '1rem' }}>
              <label htmlFor="skill-search" className="form-label" style={{ fontSize: '0.9rem', marginBottom: '0.4rem' }}>
                Search Skills Catalog
              </label>
              <div className="search-wrapper">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="search-icon-svg">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  id="skill-search"
                  type="text"
                  className="form-input search-input"
                  placeholder="e.g. React, UI/UX Design, Copywriting..."
                  value={skillSearchQuery}
                  onChange={(e) => setSkillSearchQuery(e.target.value)}
                />
                {skillSearchQuery && (
                  <button
                    type="button"
                    className="search-clear-btn"
                    onClick={() => setSkillSearchQuery('')}
                  >
                    &times;
                  </button>
                )}
              </div>
            </div>

            {/* Catalog Scrollable List */}
            <div className="catalog-skills-scroll-container" style={{ maxHeight: '200px', marginBottom: '1.25rem' }}>
              <div className="catalog-skills-grid">
                {skillsCatalog.map((sk) => {
                  const isSelected = predefinedSkills.some((us) => us.skill_id === sk.id);
                  return (
                    <div
                      key={sk.id}
                      className={`catalog-skill-card ${isSelected ? 'catalog-skill-card--selected' : ''}`}
                      onClick={() => {
                        if (!isSelected && !skillSubmitting) {
                          handleAddPredefinedSkill(sk.id);
                        }
                      }}
                    >
                      <div className="catalog-skill-card-info">
                        <span className="catalog-skill-name">{sk.name}</span>
                        <span className="catalog-skill-category">{sk.category}</span>
                      </div>
                      <div className="catalog-skill-card-action">
                        {isSelected ? (
                          <span className="skill-action-icon skill-action-icon--selected">&#10003;</span>
                        ) : (
                          <span className="skill-action-icon skill-action-icon--add">+</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Add Custom Skill Form */}
            <form onSubmit={handleAddCustomSkill} className="custom-skill-form-row" style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                className="form-input"
                style={{ flex: 1, padding: '0.65rem 0.9rem', fontSize: '0.9rem' }}
                placeholder="Or add a custom skill..."
                value={customSkillInput}
                onChange={(e) => setCustomSkillInput(e.target.value)}
                disabled={totalSkillsCount >= 10 || skillSubmitting}
              />
              <button
                type="submit"
                className="inline-add-custom-btn"
                disabled={!customSkillInput.trim() || totalSkillsCount >= 10 || skillSubmitting}
              >
                Add Custom
              </button>
            </form>

            <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
              <button
                type="button"
                className="modal-btn modal-btn--confirm"
                onClick={() => setIsManageSkillsOpen(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
