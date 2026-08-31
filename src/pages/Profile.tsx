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
import { getSupabaseBrowserClient } from '../lib/supabase/client';

type ProfilePageProps = {
  onNavigate?: (path: string) => void;
};

export function ProfilePage({ onNavigate }: ProfilePageProps) {
  const { user, profile: authProfile, refreshProfile } = useAuth();

  const [profile, setProfile] = useState<Profile | null>(authProfile);
  const [predefinedSkills, setPredefinedSkills] = useState<UserSkill[]>([]);
  const [customSkills, setCustomSkills] = useState<UserCustomSkill[]>([]);
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
      const [fetchedProfile, skillsData] = await Promise.all([
        getProfile(user.id),
        getUserSkills(user.id),
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
    } catch (err: any) {
      console.error('Error loading profile page data:', err);
      setErrorMsg(formatFriendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [user, authProfile]);

  useEffect(() => {
    loadProfileData();
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
    } catch (err: any) {
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
    } catch (err: any) {
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
    } catch (err: any) {
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
    } catch (err: any) {
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
            <div className="profile-avatar-container">
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.full_name}
                  className="profile-avatar-image"
                />
              ) : (
                <div className="profile-avatar-fallback">
                  {initials}
                </div>
              )}
            </div>

            <div className="profile-hero-identity">
              <h1 className="profile-full-name">{profile.full_name}</h1>

              <div className="profile-username-row">
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

        {/* MY SKILLS SECTION */}
        <section className="profile-section-card" aria-label="My Skills">
          <div className="profile-section-header">
            <div>
              <h2 className="profile-section-title">My Skills</h2>
              <span className="profile-section-subtitle">
                {totalSkillsCount} of 10 skills selected
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
                <p>No skills added yet.</p>
                <button
                  type="button"
                  className="profile-empty-action-btn"
                  onClick={() => setIsManageSkillsOpen(true)}
                >
                  + Add your skills
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
