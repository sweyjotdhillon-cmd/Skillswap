import React, { useState, useEffect, useId, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navbar } from '../components/navigation/Navbar';
import {
  getSkillsCatalog,
  searchSkillsCatalog,
  getUserSkills,
  getPrivateContact,
  checkUsernameAvailability,
  validateUsernameFormat,
  addUserSkill,
  completeProfile,
  formatFriendlyErrorMessage,
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
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'unavailable' | 'invalid' | 'error'>('idle');
  const [usernameMessage, setUsernameMessage] = useState<string>('');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Step 3 State: Skills
  const [skillsCatalog, setSkillsCatalog] = useState<Skill[]>([]);
  const [skillsLoading, setSkillsLoading] = useState<boolean>(true);
  const [skillsError, setSkillsError] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearchFocused, setIsSearchFocused] = useState<boolean>(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
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

  // Pre-fill existing user profile, contacts, and existing selected skills upon load
  useEffect(() => {
    let isMounted = true;
    async function loadExistingUserData() {
      if (!user) return;

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
        setUsernameMessage('Username is set');
      }

      // Load existing private contact phone number
      try {
        const contact = await getPrivateContact(user.id);
        if (isMounted && contact?.phone_number) {
          setPhoneNumber(contact.phone_number);
        }
      } catch (err) {
        console.warn('Could not load existing private contact:', err);
      }

      // Load existing user skills
      try {
        const existingSkills = await getUserSkills(user.id);
        if (isMounted) {
          const loadedSkills: SelectedSkill[] = [];
          for (const s of existingSkills.predefined) {
            loadedSkills.push({
              id: `predefined-${s.skill_id}`,
              name: s.skills?.name || 'Skill',
              isCustom: false,
              skillId: s.skill_id,
            });
          }
          for (const cs of existingSkills.custom) {
            loadedSkills.push({
              id: `custom-${cs.id}`,
              name: cs.skill_name,
              isCustom: true,
            });
          }
          if (loadedSkills.length > 0) {
            setSelectedSkills(loadedSkills);
          }
        }
      } catch (err) {
        console.warn('Could not load existing user skills:', err);
      }
    }

    loadExistingUserData();

    return () => {
      isMounted = false;
    };
  }, [user, profile]);

  // Fetch Predefined Skills Catalog once (with reload ability)
  const loadSkillsCatalog = async () => {
    setSkillsLoading(true);
    setSkillsError('');
    try {
      const catalog = await getSkillsCatalog();
      console.log(`[Skills Catalog] Successfully loaded ${catalog.length} skills from public.skills`);
      setSkillsCatalog(catalog);
    } catch (err: any) {
      console.error('Failed to load skills catalog:', err);
      setSkillsError('Unable to load skills right now. Please try again.');
    } finally {
      setSkillsLoading(false);
    }
  };

  useEffect(() => {
    loadSkillsCatalog();
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
    const lower = val.toLowerCase();
    const normalized = lower.trim();
    setUsername(lower);

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
      if (normalized.length < 3) {
        setUsernameMessage('Username must be at least 3 characters.');
      } else if (normalized.length > 30) {
        setUsernameMessage('Username cannot exceed 30 characters.');
      } else {
        setUsernameMessage('Use 3–30 lowercase letters, numbers, underscore or period.');
      }
      return;
    }

    setUsernameStatus('checking');
    setUsernameMessage('Checking availability...');

    debounceTimerRef.current = setTimeout(async () => {
      const res = await checkUsernameAvailability(normalized);
      if (res.status === 'available') {
        setUsernameStatus('available');
        setUsernameMessage('Username is available');
      } else if (res.status === 'unavailable') {
        setUsernameStatus('unavailable');
        setUsernameMessage('This username is already taken.');
      } else if (res.status === 'invalid') {
        setUsernameStatus('invalid');
        setUsernameMessage(res.message);
      } else if (res.status === 'error') {
        setUsernameStatus('error');
        setUsernameMessage('Unable to check username right now. Please try again.');
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

    // Check duplicate in predefined catalog or search results
    const predefinedMatch =
      skillsCatalog.find((s) => s.name.toLowerCase() === cleanName.toLowerCase()) ||
      searchResults.find((s) => s.name.toLowerCase() === cleanName.toLowerCase());

    if (predefinedMatch) {
      setCustomSkillError(
        `"${cleanName}" exists in the predefined catalog. Selected it as a predefined skill instead.`
      );
      handleSelectSkill(predefinedMatch);
      setCustomSkillInput('');
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

  // Execute database profile finalization
  const executeProfileFinalization = async (
    targetUserId: string,
    data: {
      fullName: string;
      bio: string;
      username: string;
      phoneNumber: string;
      selectedSkills: SelectedSkill[];
      avatarUrl?: string | null;
    }
  ) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      throw new Error('Supabase client unavailable.');
    }

    // 1. Upsert Profile (id, full_name, bio, username, avatar_url, profile_completed = false initially)
    const { error: profileUpdateError } = await supabase
      .from('profiles')
      .upsert(
        {
          id: targetUserId,
          full_name: data.fullName.trim(),
          bio: data.bio.trim() || null,
          username: data.username.trim().toLowerCase(),
          avatar_url: data.avatarUrl || null,
          profile_completed: false,
        },
        { onConflict: 'id' }
      );

    if (profileUpdateError) {
      if (profileUpdateError.message.includes('unique') || profileUpdateError.message.includes('taken')) {
        throw new Error('This username is already taken. Please go back and pick another username.');
      }
      throw new Error(`Profile update failed: ${profileUpdateError.message}`);
    }

    // 2. Upsert Private Contact (phone_number)
    if (data.phoneNumber.trim()) {
      const { error: contactError } = await supabase
        .from('user_private_contacts')
        .upsert(
          {
            user_id: targetUserId,
            phone_number: data.phoneNumber.trim(),
          },
          { onConflict: 'user_id' }
        );

      if (contactError) {
        console.warn('Failed to update private contact:', contactError);
      }
    }

    // 3. Add Selected Skills through RPC `add_user_skill()`
    for (const item of data.selectedSkills) {
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

    // 5. Clear pending session storage if present
    sessionStorage.removeItem('skillswap_pending_onboarding');

    // 6. Refresh profile state in AuthContext
    await refreshProfile();

    // 7. Redirect user
    const targetPath = redirectTo || '/explore';
    if (onNavigate) {
      onNavigate(targetPath);
    } else {
      window.location.href = targetPath;
    }
  };

  // Check for returning post-OAuth identity linking state
  useEffect(() => {
    let isMounted = true;
    async function checkPendingLinking() {
      if (!user || user.is_anonymous) return;

      const rawPending = sessionStorage.getItem('skillswap_pending_onboarding');
      if (!rawPending) return;

      try {
        const pendingData = JSON.parse(rawPending);
        if (pendingData && pendingData.username) {
          setIsSubmitting(true);
          const resolvedAvatar =
            user.user_metadata?.avatar_url ||
            user.user_metadata?.picture ||
            (Array.isArray(user.identities)
              ? user.identities.find((i) => i.provider === 'google')?.identity_data?.avatar_url ||
                user.identities.find((i) => i.provider === 'google')?.identity_data?.picture
              : null) ||
            avatarUrl ||
            pendingData.avatarUrl ||
            null;

          await executeProfileFinalization(user.id, {
            fullName: pendingData.fullName,
            bio: pendingData.bio,
            username: pendingData.username,
            phoneNumber: pendingData.phoneNumber,
            selectedSkills: pendingData.selectedSkills || [],
            avatarUrl: resolvedAvatar,
          });
        }
      } catch (err: any) {
        console.error('Failed to finalize onboarding after Google linking:', err);
        if (isMounted) {
          setSubmitError(err.message || 'Error completing profile setup after Google linking.');
          setIsSubmitting(false);
        }
      }
    }

    checkPendingLinking();

    return () => {
      isMounted = false;
    };
  }, [user]);

  // Step 4 Validation & Final Submission
  const validatePhone = (phone: string): boolean => {
    if (!phone.trim()) return true;
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

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setSubmitError('Unable to connect to database service. Please try again.');
      return;
    }

    // Verify authenticated user from session
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();

    if (!currentUser) {
      setSubmitError('Your session has expired. Please sign in again.');
      return;
    }

    setIsSubmitting(true);

    try {
      // If user is anonymous, link Google identity before finalizing profile
      if (currentUser.is_anonymous) {
        const onboardingState = {
          fullName,
          bio,
          username,
          phoneNumber,
          selectedSkills,
          avatarUrl,
        };
        sessionStorage.setItem('skillswap_pending_onboarding', JSON.stringify(onboardingState));

        const redirectTarget = `${window.location.origin}/onboarding?linking=complete`;
        const { error: linkError } = await supabase.auth.linkIdentity({
          provider: 'google',
          options: {
            redirectTo: redirectTarget,
          },
        });

        if (linkError) {
          sessionStorage.removeItem('skillswap_pending_onboarding');
          if (
            linkError.message.includes('already linked') ||
            linkError.message.includes('identity_already_exists') ||
            linkError.message.includes('already registered')
          ) {
            throw new Error('An account with this Google email already exists. Please log in instead.');
          }
          throw new Error(`Google Identity linking failed: ${linkError.message}`);
        }
        return;
      }

      // Non-anonymous user: finalize profile directly
      await executeProfileFinalization(currentUser.id, {
        fullName,
        bio,
        username,
        phoneNumber,
        selectedSkills,
        avatarUrl,
      });
    } catch (err: any) {
      console.error('Final onboarding submission error:', err);
      const friendlyMsg = formatFriendlyErrorMessage(err);
      setSubmitError(friendlyMsg);
      setIsSubmitting(false);
    }
  };

  // Extract unique categories for filter chips
  const catalogCategories = ['All', ...Array.from(new Set(skillsCatalog.map((s) => s.category))).sort()];

  // Popular skills dynamically derived from database catalog (first skill of each category)
  const popularSkills = React.useMemo(() => {
    const seenCategories = new Set<string>();
    const featured: Skill[] = [];
    for (const skill of skillsCatalog) {
      if (!seenCategories.has(skill.category)) {
        seenCategories.add(skill.category);
        featured.push(skill);
      }
      if (featured.length >= 12) break;
    }
    return featured;
  }, [skillsCatalog]);

  // Debounced server-side skill search query against public.skills catalog
  const [searchResults, setSearchResults] = useState<Skill[]>([]);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clean = searchQuery.trim();
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    if (!clean) {
      setSearchResults([]);
      return;
    }

    searchDebounceRef.current = setTimeout(async () => {
      const results = await searchSkillsCatalog(clean, selectedCategory);
      setSearchResults(results);
    }, 250);

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchQuery, selectedCategory]);

  const trimmedSearch = searchQuery.trim().toLowerCase();

  // Combine matching skills from searchResults query with skillsCatalog
  const searchMatchingSkills = React.useMemo(() => {
    if (!trimmedSearch) return [];
    const combinedMap = new Map<string, Skill>();
    for (const s of searchResults) {
      combinedMap.set(s.id, s);
    }
    for (const s of skillsCatalog) {
      if (s.name.toLowerCase().includes(trimmedSearch) || s.category.toLowerCase().includes(trimmedSearch)) {
        combinedMap.set(s.id, s);
      }
    }
    return Array.from(combinedMap.values());
  }, [trimmedSearch, searchResults, skillsCatalog]);

  const categoryFilteredCatalog = skillsCatalog.filter((s) => {
    if (selectedCategory !== 'All' && s.category !== selectedCategory) {
      return false;
    }
    if (!trimmedSearch) return true;
    return (
      s.name.toLowerCase().includes(trimmedSearch) ||
      s.category.toLowerCase().includes(trimmedSearch)
    );
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
              <span>Step {step} of 4</span>
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
                      usernameStatus === 'invalid' || usernameStatus === 'unavailable' || usernameStatus === 'error' ? 'input-error' : ''
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
                    {(usernameStatus === 'unavailable' || usernameStatus === 'invalid' || usernameStatus === 'error') && (
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
              {/* Step Header */}
              <div className="onboarding-header">
                <div className="onboarding-header-row">
                  <div>
                    <h1 className="onboarding-title">Choose Your Skills</h1>
                    <p className="onboarding-subtitle">
                      Tell the community what you're good at.
                    </p>
                  </div>
                  <div className={`skills-counter-badge ${selectedSkills.length >= 10 ? 'skills-counter-badge--full' : ''}`}>
                    {selectedSkills.length} / 10 skills selected
                  </div>
                </div>
              </div>

              {step3Error && (
                <div className="onboarding-alert onboarding-alert--error" role="alert">
                  {step3Error}
                </div>
              )}

              {selectedSkills.length >= 10 && (
                <div className="onboarding-alert onboarding-alert--info" role="status">
                  You have reached the 10 skill limit. Remove a skill to choose a different one.
                </div>
              )}

              {/* Selected Skill Chips Box */}
              <div className="onboarding-selected-skills-section">
                <div className="selected-skills-header-row">
                  <span className="section-mini-label">SELECTED SKILLS</span>
                  {selectedSkills.length > 0 && (
                    <span className="selected-skills-count-text">
                      {selectedSkills.length} of 10 selected
                    </span>
                  )}
                </div>

                {selectedSkills.length === 0 ? (
                  <p className="empty-skills-note">
                    No skills selected yet. Choose from the catalog below or add a custom skill.
                  </p>
                ) : (
                  <div className="skills-chips-wrapper">
                    {selectedSkills.map((s) => (
                      <span key={s.id} className="skill-chip">
                        <span className="skill-chip-name">{s.name}</span>
                        {s.isCustom && <small className="custom-skill-badge">CUSTOM</small>}
                        <button
                          type="button"
                          className="skill-chip-remove"
                          onClick={() => handleRemoveSkill(s.id)}
                          aria-label={`Remove skill ${s.name}`}
                          title="Remove skill"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Interactive Search Box */}
              <div className="form-group skills-search-group">
                <div className="input-wrapper search-wrapper">
                  <svg className="search-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    type="text"
                    className="form-input search-input"
                    placeholder="Search skills (e.g. Python, Design, Excel...)"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setIsSearchFocused(true)}
                    onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      className="search-clear-btn"
                      onClick={() => setSearchQuery('')}
                      aria-label="Clear search"
                    >
                      ×
                    </button>
                  )}
                </div>

                {/* Interactive Search Results Dropdown Panel (Shown while typing query) */}
                {trimmedSearch !== '' && (
                  <div className="search-results-dropdown">
                    <div className="search-results-header">
                      <span>MATCHING SKILLS ({searchMatchingSkills.length})</span>
                    </div>

                    {searchMatchingSkills.length > 0 ? (
                      <div className="search-results-list">
                        {searchMatchingSkills.map((skill) => {
                          const isSelected = selectedSkills.some(
                            (sel) => !sel.isCustom && sel.skillId === skill.id
                          );
                          const isMaxReached = selectedSkills.length >= 10;

                          return (
                            <button
                              key={`dropdown-${skill.id}`}
                              type="button"
                              className={`search-result-item ${isSelected ? 'search-result-item--selected' : ''}`}
                              onClick={() => {
                                if (isSelected) {
                                  const item = selectedSkills.find(
                                    (s) => !s.isCustom && s.skillId === skill.id
                                  );
                                  if (item) handleRemoveSkill(item.id);
                                } else if (!isMaxReached) {
                                  handleSelectSkill(skill);
                                }
                              }}
                            >
                              <div className="search-result-item-info">
                                <span className="search-result-item-name">{skill.name}</span>
                                <span className="search-result-item-cat">{skill.category}</span>
                              </div>
                              <div className="search-result-item-action">
                                {isSelected ? (
                                  <span className="search-action-icon search-action-icon--selected" title="Selected (Click to remove)">
                                    ✓
                                  </span>
                                ) : (
                                  <span
                                    className={`search-action-icon search-action-icon--add ${isMaxReached ? 'search-action-icon--disabled' : ''}`}
                                    title={isMaxReached ? 'Skill limit reached' : 'Add skill'}
                                  >
                                    +
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="no-predefined-matches-box">
                        <p className="no-matches-text">
                          No predefined skills found matching "{searchQuery.trim()}".
                        </p>
                        <button
                          type="button"
                          className="inline-add-custom-btn"
                          onClick={() => {
                            setCustomSkillInput(searchQuery.trim());
                            setCustomSkillError('');
                            setCustomSkillModalOpen(true);
                          }}
                          disabled={selectedSkills.length >= 10}
                        >
                          + Add "{searchQuery.trim()}" as a custom skill
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Category Filter Chips */}
              <div className="category-filter-container">
                <div className="category-chips-scroll">
                  {catalogCategories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      className={`category-filter-chip ${selectedCategory === cat ? 'category-filter-chip--active' : ''}`}
                      onClick={() => setSelectedCategory(cat)}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Main Catalog View: Popular Skills & All Skills Grid */}
              <div className="onboarding-catalog-section">
                {skillsLoading ? (
                  <div className="skills-catalog-loading">
                    <div className="spinner-dots" />
                    <span>Loading skills catalog from Supabase...</span>
                  </div>
                ) : skillsError ? (
                  <div className="skills-catalog-error">
                    <p>{skillsError}</p>
                    <button
                      type="button"
                      className="skills-retry-btn"
                      onClick={loadSkillsCatalog}
                    >
                      Try Again
                    </button>
                  </div>
                ) : (
                  <>
                    {/* POPULAR SKILLS (When no active search query or when category is All) */}
                    {!trimmedSearch && selectedCategory === 'All' && popularSkills.length > 0 && (
                      <div className="popular-skills-wrapper">
                        <div className="catalog-section-header">
                          <span className="section-mini-label">POPULAR SKILLS</span>
                        </div>
                        <div className="popular-skills-grid">
                          {popularSkills.map((skill) => {
                            const isSelected = selectedSkills.some(
                              (sel) => !sel.isCustom && sel.skillId === skill.id
                            );
                            const isMaxReached = selectedSkills.length >= 10;

                            return (
                              <button
                                key={`popular-${skill.id}`}
                                type="button"
                                className={`popular-skill-chip ${isSelected ? 'popular-skill-chip--selected' : ''}`}
                                onClick={() => {
                                  if (isSelected) {
                                    const item = selectedSkills.find(
                                      (s) => !s.isCustom && s.skillId === skill.id
                                    );
                                    if (item) handleRemoveSkill(item.id);
                                  } else if (!isMaxReached) {
                                    handleSelectSkill(skill);
                                  }
                                }}
                              >
                                <span>{skill.name}</span>
                                <span className="popular-skill-action-icon">
                                  {isSelected ? '✓' : '+'}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* ALL SKILLS / CATEGORY CATALOG GRID */}
                    <div className="all-skills-catalog-wrapper">
                      <div className="catalog-section-header">
                        <span className="section-mini-label">
                          {trimmedSearch
                            ? `FILTERED CATALOG (${categoryFilteredCatalog.length})`
                            : selectedCategory !== 'All'
                            ? `${selectedCategory.toUpperCase()} (${categoryFilteredCatalog.length})`
                            : `ALL SKILLS (${skillsCatalog.length})`}
                        </span>
                      </div>

                      <div className="catalog-skills-scroll-container">
                        {categoryFilteredCatalog.length === 0 ? (
                          <div className="no-catalog-results">
                            <p className="no-catalog-results-text">
                              No skills found in category "{selectedCategory}"{trimmedSearch ? ` matching "${trimmedSearch}"` : ''}.
                            </p>
                          </div>
                        ) : (
                          <div className="catalog-skills-grid">
                            {categoryFilteredCatalog.map((skill) => {
                              const isSelected = selectedSkills.some(
                                (sel) => !sel.isCustom && sel.skillId === skill.id
                              );
                              const isMaxReached = selectedSkills.length >= 10;

                              return (
                                <div
                                  key={skill.id}
                                  className={`catalog-skill-card ${isSelected ? 'catalog-skill-card--selected' : ''}`}
                                  onClick={() => {
                                    if (isSelected) {
                                      const item = selectedSkills.find(
                                        (s) => !s.isCustom && s.skillId === skill.id
                                      );
                                      if (item) handleRemoveSkill(item.id);
                                    } else if (!isMaxReached) {
                                      handleSelectSkill(skill);
                                    }
                                  }}
                                  role="button"
                                  tabIndex={0}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      if (isSelected) {
                                        const item = selectedSkills.find(
                                          (s) => !s.isCustom && s.skillId === skill.id
                                        );
                                        if (item) handleRemoveSkill(item.id);
                                      } else if (!isMaxReached) {
                                        handleSelectSkill(skill);
                                      }
                                    }
                                  }}
                                >
                                  <div className="catalog-skill-card-info">
                                    <span className="catalog-skill-name">{skill.name}</span>
                                    <span className="catalog-skill-category">{skill.category}</span>
                                  </div>
                                  <div className="catalog-skill-card-action">
                                    {isSelected ? (
                                      <span className="skill-action-icon skill-action-icon--selected" title="Selected (Click to remove)">
                                        ✓
                                      </span>
                                    ) : (
                                      <span
                                        className={`skill-action-icon skill-action-icon--add ${isMaxReached ? 'skill-action-icon--disabled' : ''}`}
                                        title={isMaxReached ? 'Skill limit reached' : 'Add skill'}
                                      >
                                        +
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Custom Skill Secondary Trigger */}
              <div className="custom-skill-footer">
                <button
                  type="button"
                  className="add-custom-skill-secondary-btn"
                  onClick={() => {
                    setCustomSkillInput('');
                    setCustomSkillError('');
                    setCustomSkillModalOpen(true);
                  }}
                  disabled={selectedSkills.length >= 10}
                >
                  <span className="add-icon">+</span> Add custom skill
                </button>
                <span className="custom-skill-subtext">Add a skill not in the predefined catalog</span>
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
                    Confirm your details to finish setting up your profile.
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
                  {isSubmitting ? 'Creating your profile...' : 'Confirm Profile and Create My Profile'}
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
