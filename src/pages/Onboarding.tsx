import React, { useState, useEffect, useId, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navbar } from '../components/navigation/Navbar';
import {
  getSkillsCatalog,
  checkUsernameAvailability,
  validateUsernameFormat,
  addUserSkill,
  completeProfile,
  type Skill,
} from '../lib/supabase/profile';
import { getSupabaseBrowserClient } from '../lib/supabase/client';

type OnboardingProps = {
  onNavigate?: (path: string) => void;
  redirectTo?: string;
};

export interface SelectedSkill {
  id: string; // generated client ID or skill catalog ID
  name: string;
  isCustom: boolean;
  skillId?: string; // predefined skill UUID
}

export function OnboardingPage({ onNavigate, redirectTo }: OnboardingProps) {
  const { user, profile, refreshProfile } = useAuth();
  const bioHelpId = useId();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1 State: Basic Info
  const [fullName, setFullName] = useState<string>('');
  const [bio, setBio] = useState<string>('');
  const [step1Error, setStep1Error] = useState<string>('');

  // Step 2 State: Username
  const [username, setUsername] = useState<string>('');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'unavailable' | 'invalid'>('idle');
  const [usernameMessage, setUsernameMessage] = useState<string>('');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Step 3 State: Skills
  const [skillsCatalog, setSkillsCatalog] = useState<Skill[]>([]);
  const [skillsLoading, setSkillsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSkills, setSelectedSkills] = useState<SelectedSkill[]>([]);
  const [customSkillModalOpen, setCustomSkillModalOpen] = useState<boolean>(false);
  const [customSkillInput, setCustomSkillInput] = useState<string>('');
  const [customSkillError, setCustomSkillError] = useState<string>('');
  const [step3Error, setStep3Error] = useState<string>('');

  // Step 4 State: Contact & Final Submit
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [phoneError, setPhoneError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string>('');

  // Pre-fill initial full name and bio from user/profile metadata
  useEffect(() => {
    if (user || profile) {
      const initialName =
        profile?.full_name ||
        user?.user_metadata?.full_name ||
        user?.user_metadata?.name ||
        (user?.email ? user.email.split('@')[0] : '');
      setFullName(initialName);
      if (profile?.bio) {
        setBio(profile.bio);
      }
      if (profile?.username) {
        setUsername(profile.username);
        setUsernameStatus('available');
        setUsernameMessage('Username is available');
      }
    }
  }, [user, profile]);

  // Fetch Predefined Skills Catalog once
  useEffect(() => {
    let isMounted = true;
    async function loadCatalog() {
      try {
        const catalog = await getSkillsCatalog();
        if (isMounted) {
          setSkillsCatalog(catalog);
          setSkillsLoading(false);
        }
      } catch (err) {
        console.error('Failed to load skills catalog:', err);
        if (isMounted) {
          setSkillsLoading(false);
        }
      }
    }
    loadCatalog();
    return () => {
      isMounted = false;
    };
  }, []);

  // Avatar URL resolution
  const avatarUrl =
    user?.user_metadata?.avatar_url ||
    user?.user_metadata?.picture ||
    profile?.avatar_url ||
    null;

  const getInitials = (name: string) => {
    if (!name.trim()) return 'SK';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // Step 1 Validation
  const handleStep1Continue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setStep1Error('Full Name is required.');
      return;
    }
    if (bio.length > 160) {
      setStep1Error('Bio cannot exceed 160 characters.');
      return;
    }
    setStep1Error('');
    setStep(2);
  };

  // Step 2 Username handling with debounced availability check
  const handleUsernameChange = (val: string) => {
    const rawValue = val.replace(/\s+/g, '');
    const normalized = rawValue.toLowerCase();
    setUsername(normalized);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!normalized) {
      setUsernameStatus('idle');
      setUsernameMessage('');
      return;
    }

    if (!validateUsernameFormat(normalized)) {
      setUsernameStatus('invalid');
      setUsernameMessage('Use 3–30 lowercase letters, numbers, underscore or period.');
      return;
    }

    setUsernameStatus('checking');
    setUsernameMessage('Checking availability...');

    debounceTimerRef.current = setTimeout(async () => {
      const res = await checkUsernameAvailability(normalized);
      if (res.available) {
        setUsernameStatus('available');
        setUsernameMessage('Username is available');
      } else {
        setUsernameStatus('unavailable');
        setUsernameMessage(res.error || 'This username is already taken.');
      }
    }, 400);
  };

  const handleStep2Continue = (e: React.FormEvent) => {
    e.preventDefault();
    if (usernameStatus !== 'available') {
      return;
    }
    setStep(3);
  };

  // Step 3 Skills Selection Handlers
  const handleSelectSkill = (skill: Skill) => {
    if (selectedSkills.length >= 10) {
      setStep3Error('You can select up to 10 skills only.');
      return;
    }
    // Check if already selected
    if (selectedSkills.some((s) => !s.isCustom && s.skillId === skill.id)) {
      return;
    }
    setStep3Error('');
    setSelectedSkills((prev) => [
      ...prev,
      {
        id: `predefined-${skill.id}`,
        name: skill.name,
        isCustom: false,
        skillId: skill.id,
      },
    ]);
  };

  const handleRemoveSkill = (idToRemove: string) => {
    setSelectedSkills((prev) => prev.filter((s) => s.id !== idToRemove));
    if (selectedSkills.length - 1 < 10) {
      setStep3Error('');
    }
  };

  const handleAddCustomSkill = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = customSkillInput.trim();
    if (!cleanName) {
      setCustomSkillError('Please enter a skill name.');
      return;
    }

    if (selectedSkills.length >= 10) {
      setCustomSkillError('Maximum 10 skills allowed.');
      return;
    }

    // Check duplicate in selected skills
    if (selectedSkills.some((s) => s.name.toLowerCase() === cleanName.toLowerCase())) {
      setCustomSkillError(`"${cleanName}" is already in your selected skills list.`);
      return;
    }

    // Check duplicate in predefined catalog
    const predefinedMatch = skillsCatalog.find(
      (s) => s.name.toLowerCase() === cleanName.toLowerCase()
    );
    if (predefinedMatch) {
      setCustomSkillError(
        `"${cleanName}" exists in the predefined catalog. Adding it as a predefined skill instead.`
      );
      handleSelectSkill(predefinedMatch);
      setCustomSkillInput('');
      setCustomSkillError('');
      setCustomSkillModalOpen(false);
      return;
    }

    // Add as custom skill
    setSelectedSkills((prev) => [
      ...prev,
      {
        id: `custom-${Date.now()}-${Math.random()}`,
        name: cleanName,
        isCustom: true,
      },
    ]);
    setCustomSkillInput('');
    setCustomSkillError('');
    setCustomSkillModalOpen(false);
  };

  const handleStep3Continue = (e: React.FormEvent) => {
    e.preventDefault();
    setStep(4);
  };

  // Step 4 Validation & Final Submission
  const validatePhone = (phone: string): boolean => {
    if (!phone.trim()) return true; // Phone optional or format checked
    const cleanPhone = phone.trim().replace(/[\s\-\(\)\+]/g, '');
    return /^\d{7,15}$/.test(cleanPhone);
  };

  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    setPhoneError('');

    if (phoneNumber.trim() && !validatePhone(phoneNumber)) {
      setPhoneError('Please enter a valid phone number format.');
      return;
    }

    if (!user) {
      setSubmitError('Authentication session expired. Please log in again.');
      return;
    }

    setIsSubmitting(true);

    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        throw new Error('Supabase client unavailable.');
      }

      // 1. Update Profile (full_name, bio, username)
      const { error: profileUpdateError } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          bio: bio.trim() || null,
          username: username.trim().toLowerCase(),
          avatar_url: avatarUrl,
        })
        .eq('id', user.id);

      if (profileUpdateError) {
        if (profileUpdateError.message.includes('unique') || profileUpdateError.message.includes('taken')) {
          throw new Error('This username is already taken. Please go back and pick another username.');
        }
        throw new Error(`Profile update failed: ${profileUpdateError.message}`);
      }

      // 2. Update Private Contact (phone_number)
      if (phoneNumber.trim()) {
        const { error: contactError } = await supabase
          .from('user_private_contacts')
          .upsert(
            {
              user_id: user.id,
              phone_number: phoneNumber.trim(),
            },
            { onConflict: 'user_id' }
          );

        if (contactError) {
          console.warn('Failed to update private contact:', contactError);
        }
      }

      // 3. Add Selected Skills through RPC `add_user_skill()`
      for (const item of selectedSkills) {
        if (item.isCustom) {
          const res = await addUserSkill({ customSkillName: item.name });
          if (!res.success && res.error && !res.error.includes('duplicate') && !res.error.includes('already exists')) {
            console.warn(`Failed to add custom skill ${item.name}:`, res.error);
          }
        } else if (item.skillId) {
          const res = await addUserSkill({ skillId: item.skillId });
          if (!res.success && res.error && !res.error.includes('duplicate') && !res.error.includes('already exists')) {
            console.warn(`Failed to add predefined skill ${item.name}:`, res.error);
          }
        }
      }

      // 4. Complete Profile via trusted RPC `complete_profile()`
      const completeRes = await completeProfile();
      if (!completeRes.success) {
        throw new Error(completeRes.error || 'Failed to finalize profile completion.');
      }

      // 5. Refresh profile state in AuthContext
      await refreshProfile();

      // 6. Redirect user
      const targetPath = redirectTo || '/';
      if (onNavigate) {
        onNavigate(targetPath);
      } else {
        window.location.href = targetPath;
      }
    } catch (err: any) {
      console.error('Final onboarding submission error:', err);
      setSubmitError(err.message || 'An error occurred during profile creation. Please try again.');
      setIsSubmitting(false);
    }
  };

  // Filter skills for Step 3 catalog search
  const filteredCatalog = skillsCatalog.filter((s) => {
    const isAlreadySelected = selectedSkills.some(
      (sel) => !sel.isCustom && sel.skillId === s.id
    );
    if (isAlreadySelected) return false;

    if (!searchQuery.trim()) return true;
    return s.name.toLowerCase().includes(searchQuery.trim().toLowerCase());
  });

  return (
    <div className="page-shell">
      <Navbar onNavigate={onNavigate} />

      <main className="onboarding-page-container">
        {/* Onboarding Shell Card */}
        <div className="onboarding-card">
          {/* Top Header & Step Progress Bar */}
          <div className="onboarding-progress-header">
            <div className="onboarding-step-counter">
              <span>{step} / 4</span>
            </div>
            <div className="onboarding-progress-track">
              <div
                className="onboarding-progress-fill"
                style={{ width: `${(step / 4) * 100}%` }}
              />
            </div>
          </div>

          {/* ================================================================
              STEP 1: BASIC INFO
             ================================================================ */}
          {step === 1 && (
            <form onSubmit={handleStep1Continue} className="onboarding-form">
              <div className="onboarding-header">
                <h1 className="onboarding-title">
                  Create Your
                  <br />
                  <span className="onboarding-title-highlight">SkillSwap Profile</span>
                </h1>
                <p className="onboarding-subtitle">Let's start with the basics.</p>
              </div>

              {step1Error && (
                <div className="onboarding-alert onboarding-alert--error" role="alert">
                  {step1Error}
                </div>
              )}

              {/* Profile Avatar */}
              <div className="onboarding-avatar-section">
                <div className="onboarding-avatar-wrapper">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Profile Avatar" className="onboarding-avatar-img" />
                  ) : (
                    <div className="onboarding-avatar-fallback">
                      {getInitials(fullName)}
                    </div>
                  )}
                </div>
                <div className="onboarding-avatar-meta">
                  <span className="onboarding-avatar-label">Profile Picture</span>
                  <span className="onboarding-avatar-subtext">Provided by your authenticated account</span>
                </div>
              </div>

              {/* Full Name */}
              <div className="form-group">
                <label className="form-label" htmlFor="fullNameInput">
                  Full Name
                </label>
                <input
                  id="fullNameInput"
                  type="text"
                  required
                  className="form-input"
                  placeholder="e.g. Sweyjot Dhillon"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>

              {/* Bio / About You */}
              <div className="form-group">
                <div className="form-label-row">
                  <label className="form-label" htmlFor="bioInput">
                    Bio / About You
                  </label>
                  <span className="char-counter">{bio.length} / 160</span>
                </div>
                <textarea
                  id="bioInput"
                  aria-describedby={bioHelpId}
                  className="form-textarea"
                  maxLength={160}
                  rows={4}
                  placeholder="Tell others a little about yourself..."
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                />
                <p id={bioHelpId} className="form-helper-text">
                  A good bio helps others understand who you are and what you're passionate about.
                </p>
              </div>

              {/* Form Actions */}
              <div className="onboarding-actions">
                <button
                  type="button"
                  className="onboarding-btn onboarding-btn--secondary"
                  disabled
                  style={{ opacity: 0.4, cursor: 'not-allowed' }}
                >
                  ← Back
                </button>
                <button type="submit" className="onboarding-btn onboarding-btn--primary">
                  Continue →
                </button>
              </div>
            </form>
          )}

          {/* ================================================================
              STEP 2: USERNAME
             ================================================================ */}
          {step === 2 && (
            <form onSubmit={handleStep2Continue} className="onboarding-form">
              <div className="onboarding-header">
                <h1 className="onboarding-title">Choose Your Username</h1>
                <p className="onboarding-subtitle">
                  Your username is your permanent SkillSwap identity.
                </p>
              </div>

              {/* Permanent Warning Card */}
              <div className="onboarding-info-card">
                <div className="onboarding-info-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <div className="onboarding-info-text">
                  Your username is unique to your SkillSwap account and cannot be changed later.
                </div>
              </div>

              {/* Username Input with @ Prefix */}
              <div className="form-group">
                <label className="form-label" htmlFor="usernameInput">
                  Username
                </label>
                <div className="onboarding-username-input-wrapper">
                  <span className="username-prefix">@</span>
                  <input
                    id="usernameInput"
                    type="text"
                    required
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck="false"
                    className={`form-input username-input ${
                      usernameStatus === 'invalid' || usernameStatus === 'unavailable' ? 'input-error' : ''
                    }`}
                    placeholder="sweyjot"
                    value={username}
                    onChange={(e) => handleUsernameChange(e.target.value)}
                  />
                </div>

                {/* Status Indicator Box */}
                {usernameStatus !== 'idle' && (
                  <div
                    className={`username-status-box username-status-box--${usernameStatus}`}
                    role="status"
                  >
                    {usernameStatus === 'checking' && (
                      <>
                        <span className="spinner-dots" />
                        <span>{usernameMessage}</span>
                      </>
                    )}
                    {usernameStatus === 'available' && (
                      <>
                        <svg className="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <span>{usernameMessage}</span>
                      </>
                    )}
                    {(usernameStatus === 'unavailable' || usernameStatus === 'invalid') && (
                      <>
                        <svg className="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="8" x2="12" y2="12" />
                          <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        <span>{usernameMessage}</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              <p className="onboarding-permanent-note">
                Username cannot be changed after creation.
              </p>

              {/* Form Actions */}
              <div className="onboarding-actions">
                <button
                  type="button"
                  className="onboarding-btn onboarding-btn--secondary"
                  onClick={() => setStep(1)}
                >
                  ← Back
                </button>
                <button
                  type="submit"
                  className="onboarding-btn onboarding-btn--primary"
                  disabled={usernameStatus !== 'available'}
                >
                  Continue →
                </button>
              </div>
            </form>
          )}

          {/* ================================================================
              STEP 3: SKILLS
             ================================================================ */}
          {step === 3 && (
            <form onSubmit={handleStep3Continue} className="onboarding-form">
              <div className="onboarding-header">
                <div className="onboarding-header-row">
                  <div>
                    <h1 className="onboarding-title">Choose Your Skills</h1>
                    <p className="onboarding-subtitle">
                      Tell the community what you're good at.
                    </p>
                  </div>
                  <div className="skills-counter-badge">
                    {selectedSkills.length} / 10 skills selected
                  </div>
                </div>
              </div>

              {step3Error && (
                <div className="onboarding-alert onboarding-alert--error" role="alert">
                  {step3Error}
                </div>
              )}

              {/* Selected Skill Chips */}
              <div className="onboarding-selected-skills-section">
                <span className="section-mini-label">Selected Skills</span>
                {selectedSkills.length === 0 ? (
                  <p className="empty-skills-note">No skills selected yet. Choose from below or add a custom skill.</p>
                ) : (
                  <div className="skills-chips-wrapper">
                    {selectedSkills.map((s) => (
                      <span key={s.id} className="skill-chip">
                        {s.name}
                        {s.isCustom && <small className="custom-skill-badge">Custom</small>}
                        <button
                          type="button"
                          className="skill-chip-remove"
                          onClick={() => handleRemoveSkill(s.id)}
                          aria-label={`Remove skill ${s.name}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Search & Predefined Skills Catalog */}
              <div className="form-group">
                <div className="skills-search-row">
                  <div className="input-wrapper search-wrapper">
                    <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                      type="text"
                      className="form-input search-input"
                      placeholder="Search skills (e.g. Python, Design, Excel...)"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    className="add-custom-skill-trigger-btn"
                    onClick={() => {
                      setCustomSkillError('');
                      setCustomSkillModalOpen(true);
                    }}
                    disabled={selectedSkills.length >= 10}
                  >
                    + Add another skill
                  </button>
                </div>
                <p className="form-helper-text">Add a skill not in the list (max 10 total)</p>
              </div>

              {/* Popular / Filtered Predefined Catalog */}
              <div className="onboarding-catalog-section">
                <span className="section-mini-label">
                  {searchQuery ? 'Search Results' : 'Recommended & Popular Skills'}
                </span>
                {skillsLoading ? (
                  <div className="skills-catalog-loading">Loading skills catalog...</div>
                ) : (
                  <div className="catalog-skills-grid">
                    {filteredCatalog.slice(0, 30).map((skill) => (
                      <button
                        key={skill.id}
                        type="button"
                        className="catalog-skill-pill"
                        onClick={() => handleSelectSkill(skill)}
                        disabled={selectedSkills.length >= 10}
                      >
                        + {skill.name}
                      </button>
                    ))}
                    {filteredCatalog.length === 0 && (
                      <p className="no-catalog-results">
                        No catalog skills match "{searchQuery}". Click "+ Add another skill" to add it as a custom skill!
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Form Actions */}
              <div className="onboarding-actions">
                <button
                  type="button"
                  className="onboarding-btn onboarding-btn--secondary"
                  onClick={() => setStep(2)}
                >
                  ← Back
                </button>
                <button type="submit" className="onboarding-btn onboarding-btn--primary">
                  Continue →
                </button>
              </div>
            </form>
          )}

          {/* Custom Skill Modal */}
          {customSkillModalOpen && (
            <div className="modal-overlay" onClick={() => setCustomSkillModalOpen(false)}>
              <div className="modal-content custom-skill-modal" onClick={(e) => e.stopPropagation()}>
                <h3 className="modal-title">Add Custom Skill</h3>
                <p className="modal-subtext">Enter a skill that is not available in the predefined library.</p>
                <form onSubmit={handleAddCustomSkill}>
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Quantum Computing, Copywriting..."
                      value={customSkillInput}
                      onChange={(e) => setCustomSkillInput(e.target.value)}
                      autoFocus
                    />
                    {customSkillError && (
                      <p className="error-message">{customSkillError}</p>
                    )}
                  </div>
                  <div className="modal-actions">
                    <button
                      type="button"
                      className="modal-btn modal-btn--cancel"
                      onClick={() => setCustomSkillModalOpen(false)}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="modal-btn modal-btn--confirm">
                      Add Skill
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* ================================================================
              STEP 4: FINISH / REVIEW
             ================================================================ */}
          {step === 4 && (
            <form onSubmit={handleFinalSubmit} className="onboarding-form">
              <div className="onboarding-header">
                <h1 className="onboarding-title">Almost There</h1>
                <p className="onboarding-subtitle">
                  Review your profile before joining SkillSwap.
                </p>
              </div>

              {submitError && (
                <div className="onboarding-alert onboarding-alert--error" role="alert">
                  {submitError}
                </div>
              )}

              {/* Contact Information */}
              <div className="onboarding-contact-section">
                <h3 className="section-mini-title">Contact Information</h3>
                <div className="form-group">
                  <label className="form-label" htmlFor="phoneInput">
                    Contact Number
                  </label>
                  <input
                    id="phoneInput"
                    type="tel"
                    className={`form-input ${phoneError ? 'input-error' : ''}`}
                    placeholder="e.g. +1 (555) 000-0000"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                  />
                  {phoneError && <p className="error-message">{phoneError}</p>}
                  <p className="form-helper-text">
                    Your contact information is kept private unless you choose to share it.
                  </p>
                </div>
              </div>

              {/* Public Profile Preview */}
              <div className="onboarding-preview-container">
                <div className="preview-card-header">
                  <span className="preview-card-badge">Public Profile Preview</span>
                  <span className="privacy-indicator-chip">🔒 Your contact number is private</span>
                </div>

                <div className="profile-preview-card">
                  <div className="preview-card-top">
                    <div className="preview-avatar">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt={fullName} />
                      ) : (
                        <div className="preview-avatar-fallback">
                          {getInitials(fullName)}
                        </div>
                      )}
                    </div>
                    <div className="preview-user-meta">
                      <h4 className="preview-full-name">{fullName || 'Your Name'}</h4>
                      <span className="preview-username">@{username || 'username'}</span>
                    </div>
                  </div>

                  <p className="preview-bio">{bio || 'No bio provided yet.'}</p>

                  <div className="preview-skills-section">
                    <span className="preview-skills-label">Skills:</span>
                    <div className="preview-skills-chips">
                      {selectedSkills.length === 0 ? (
                        <span className="no-skills-tag">No skills added</span>
                      ) : (
                        selectedSkills.map((s) => (
                          <span key={s.id} className="preview-skill-pill">
                            {s.name}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Confirmation Card */}
              <div className="onboarding-confirmation-card">
                <div className="confirmation-icon">✓</div>
                <div>
                  <h4 className="confirmation-title">Everything looks good!</h4>
                  <p className="confirmation-text">
                    You can review and edit your details before creating your profile.
                  </p>
                </div>
              </div>

              {/* Form Actions */}
              <div className="onboarding-actions">
                <button
                  type="button"
                  className="onboarding-btn onboarding-btn--secondary"
                  onClick={() => setStep(3)}
                  disabled={isSubmitting}
                >
                  ← Back
                </button>
                <button
                  type="submit"
                  className="onboarding-btn onboarding-btn--primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Creating your profile...' : 'Create My Profile'}
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
