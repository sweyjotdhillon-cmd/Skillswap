import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navbar } from '../components/navigation/Navbar';
import {
  Profile,
  UserSkill,
  UserCustomSkill,
  SwapReview,
  getProfile,
  getProfileByUsername,
  getUserSkills,
  getUserReviews,
  formatFriendlyErrorMessage,
} from '../lib/supabase/profile';
import { getUserCompletedSwapsCount } from '../lib/supabase/credits';
import { VerificationBadge } from '../components/ui/VerificationBadge';

type PublicProfileProps = {
  targetUsername?: string;
  targetUserId?: string;
  onNavigate?: (path: string) => void;
};

export function PublicProfilePage({ targetUsername, targetUserId, onNavigate }: PublicProfileProps) {
  const { user, profile: authProfile } = useAuth();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [predefinedSkills, setPredefinedSkills] = useState<UserSkill[]>([]);
  const [customSkills, setCustomSkills] = useState<UserCustomSkill[]>([]);
  const [userReviews, setUserReviews] = useState<SwapReview[]>([]);
  const [completedSwapsCount, setCompletedSwapsCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const totalSkillsCount = predefinedSkills.length + customSkills.length;
  const isSelf = user && profile && user.id === profile.id;
  const isGuest = !user;
  const isIncompleteAuthUser = user && authProfile && authProfile.profile_completed === false;

  const loadTargetProfile = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      let fetched: Profile | null = null;
      if (targetUsername) {
        fetched = await getProfileByUsername(targetUsername);
      } else if (targetUserId) {
        fetched = await getProfile(targetUserId);
      } else if (authProfile) {
        fetched = authProfile;
      }

      if (!fetched) {
        setErrorMsg('User profile not found or unavailable.');
        setLoading(false);
        return;
      }

      setProfile(fetched);

      const [skillsData, completedCount, reviewsData] = await Promise.all([
        getUserSkills(fetched.id),
        getUserCompletedSwapsCount(fetched.id),
        getUserReviews(fetched.id),
      ]);

      setPredefinedSkills(skillsData.predefined);
      setCustomSkills(skillsData.custom);
      setCompletedSwapsCount(completedCount);
      setUserReviews(reviewsData);
    } catch (err: unknown) {
      console.error('Error loading public profile data:', err);
      setErrorMsg(formatFriendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [targetUsername, targetUserId, authProfile]);

  useEffect(() => {
    void loadTargetProfile();
  }, [loadTargetProfile]);

  if (loading) {
    return (
      <div className="page-shell">
        <Navbar onNavigate={onNavigate} currentPath="/explore" />
        <div style={{ display: 'grid', placeItems: 'center', minHeight: '50vh' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <div className="spinner-dots" style={{ width: '28px', height: '28px' }} />
            <span style={{ fontSize: '0.95rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              Loading public profile...
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (errorMsg || !profile) {
    return (
      <div className="page-shell">
        <Navbar onNavigate={onNavigate} currentPath="/explore" />
        <main className="profile-page-main" style={{ maxWidth: '600px', margin: '4rem auto', textAlign: 'center' }}>
          <div className="profile-hero-card" style={{ padding: '2.5rem' }}>
            <h2 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: '1.8rem', marginBottom: '0.75rem' }}>
              Profile Not Found
            </h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
              {errorMsg || 'The requested SkillSwap member profile could not be located.'}
            </p>
            <button
              type="button"
              className="action-button action-button--filled"
              style={{ margin: '0 auto' }}
              onClick={() => onNavigate && onNavigate('/explore')}
            >
              Explore Skill Marketplace
            </button>
          </div>
        </main>
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
      <Navbar onNavigate={onNavigate} currentPath={isSelf ? '/profile' : '/explore'} />

      <main className="profile-page-main">
        {/* GUEST MODE SCANNER BANNER (L18 Public Scannability) */}
        {isGuest && (
          <div
            className="auth-alert"
            style={{
              marginBottom: '1.5rem',
              background: 'var(--color-surface, #1E293B)',
              border: '1px solid var(--color-structure, #38BDF8)',
              borderRadius: '12px',
              padding: '1.1rem 1.25rem',
              color: 'var(--color-text)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <span
                style={{
                  background: 'rgba(56, 189, 248, 0.15)',
                  color: 'var(--color-structure, #38BDF8)',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  padding: '0.2rem 0.55rem',
                  borderRadius: '6px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Guest Mode
              </span>
              <strong style={{ fontSize: '0.95rem' }}>Viewing Public Member Profile</strong>
            </div>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary, #94A3B8)', lineHeight: 1.5 }}>
              You are exploring SkillSwap in scannable guest mode. You can inspect public skill capabilities, completed exchanges, and community ratings. Registering or signing in unlocks direct skill swapping, real-time chat, and credit transfers.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
              <button
                type="button"
                className="action-button action-button--filled"
                style={{ fontSize: '0.85rem', padding: '0.45rem 0.9rem' }}
                onClick={() => onNavigate && onNavigate('/signup?redirectTo=/explore')}
              >
                Create Free Account
              </button>
              <button
                type="button"
                className="action-button action-button--outlined"
                style={{ fontSize: '0.85rem', padding: '0.45rem 0.9rem' }}
                onClick={() => onNavigate && onNavigate('/login?redirectTo=/explore')}
              >
                Sign In to Swap
              </button>
              <button
                type="button"
                className="action-button action-button--text"
                style={{ fontSize: '0.85rem', padding: '0.45rem 0.9rem' }}
                onClick={() => onNavigate && onNavigate('/explore')}
              >
                Explore All Swaps &rarr;
              </button>
            </div>
          </div>
        )}

        {/* MOTIVATIONAL PROFILE TRIGGER FOR AUTHENTICATED INCOMPLETE USERS (L18 Trigger) */}
        {isIncompleteAuthUser && (
          <div
            style={{
              marginBottom: '1.5rem',
              background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.1) 0%, rgba(214, 166, 74, 0.12) 100%)',
              border: '1px solid rgba(214, 166, 74, 0.35)',
              borderRadius: '12px',
              padding: '1.1rem 1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <span
                style={{
                  background: 'var(--color-transactional, #d6a64a)',
                  color: '#000',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  padding: '0.2rem 0.55rem',
                  borderRadius: '6px',
                  textTransform: 'uppercase',
                }}
              >
                Boost Discoverability
              </span>
              <strong style={{ fontSize: '0.95rem' }}>Complete your profile to start trading skills!</strong>
            </div>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary, #94A3B8)', lineHeight: 1.5 }}>
              Members with complete profiles get up to 3x higher response rates on swap requests. Add your skills and bio to make your expertise discoverable to community partners like {profile.full_name}.
            </p>
            <div>
              <button
                type="button"
                className="action-button action-button--filled"
                style={{ fontSize: '0.85rem', padding: '0.45rem 1rem' }}
                onClick={() => onNavigate && onNavigate('/onboarding?redirectTo=/explore')}
              >
                Complete Profile Setup
              </button>
            </div>
          </div>
        )}

        {/* PROFILE HERO CARD */}
        <section className="profile-hero-card" aria-label="Public Profile Hero">
          <div className="profile-hero-content">
            <div className="profile-avatar-container">
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={`Profile photo of ${profile.full_name}`}
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
                <VerificationBadge isVerified={profile.is_verified} label="Verified Profile" size="md" />
              </div>

              <div className="profile-username-row" style={{ marginTop: '0.35rem' }}>
                <span className="profile-username-tag">@{profile.username}</span>
                {profile.created_at && (
                  <span className="trust-member-since-badge" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    • Member since {new Date(profile.created_at).getFullYear()}
                  </span>
                )}
              </div>

              {profile.bio && (
                <p className="profile-hero-bio">{profile.bio}</p>
              )}

              {isSelf && (
                <div className="profile-hero-actions" style={{ marginTop: '0.85rem' }}>
                  <button
                    type="button"
                    className="profile-edit-btn"
                    onClick={() => onNavigate && onNavigate('/profile')}
                  >
                    Edit My Private Profile
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* SKILL JOURNEY OVERVIEW */}
        <section className="profile-section-card" aria-label="Skill Journey & Reputation">
          <div className="profile-section-header">
            <div>
              <h2 className="profile-section-title">Community Standing &amp; Exchanges</h2>
              <span className="profile-section-subtitle">
                Verified swap history and peer reviews
              </span>
            </div>
          </div>

          <div className="as-stats-row" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
            <div className="as-stat-item">
              <span className="as-stat-label">Completed Swaps</span>
              <strong className="as-stat-value">{profile.completed_swaps_count ?? completedSwapsCount} Exchanges</strong>
            </div>
            <div className="as-stat-item">
              <span className="as-stat-label">Community Rating</span>
              <strong className="as-stat-value" style={{ color: (profile.review_count ?? userReviews.length) > 0 ? '#d97706' : 'var(--text-secondary)' }}>
                {(profile.review_count ?? userReviews.length) > 0 && profile.average_rating !== null
                  ? `★ ${profile.average_rating.toFixed(1)} (${profile.review_count} ${profile.review_count === 1 ? 'review' : 'reviews'})`
                  : 'No reviews yet'}
              </strong>
            </div>
            <div className="as-stat-item">
              <span className="as-stat-label">Skills Offered</span>
              <strong className="as-stat-value">{totalSkillsCount} Listed</strong>
            </div>
          </div>
        </section>

        {/* PUBLIC SKILLS SECTION */}
        <section className="profile-section-card" aria-label="Public Skills & Capabilities">
          <div className="profile-section-header">
            <div>
              <h2 className="profile-section-title">Skills &amp; Capabilities</h2>
              <span className="profile-section-subtitle">
                Expertise offered and shared by @{profile.username}
              </span>
            </div>
          </div>

          <div className="profile-skills-wrapper">
            {totalSkillsCount === 0 ? (
              <div className="profile-empty-state">
                <p>No public skills listed on this profile yet.</p>
              </div>
            ) : (
              <div className="profile-skills-grid">
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

        {/* COMMUNITY REVIEWS SECTION */}
        <section className="profile-section-card" aria-label="Public Peer Reviews">
          <div className="profile-section-header">
            <div>
              <h2 className="profile-section-title">Community Feedback</h2>
              <span className="profile-section-subtitle">
                Reviews received from skill swap partners
              </span>
            </div>

            {userReviews.length > 0 && (
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#d97706' }}>
                ★ {profile.average_rating ? profile.average_rating.toFixed(1) : '5.0'}{' '}
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                  ({userReviews.length} {userReviews.length === 1 ? 'review' : 'reviews'})
                </span>
              </div>
            )}
          </div>

          <div className="profile-reviews-wrapper" style={{ marginTop: '0.75rem' }}>
            {userReviews.length > 0 ? (
              <div className="reviews-list" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {userReviews.map((rev) => {
                  const reviewerName = rev.reviewer_profile?.full_name || (rev.reviewer_profile?.username ? `@${rev.reviewer_profile.username}` : 'SkillSwap Member');
                  const reviewerAvatar = rev.reviewer_profile?.avatar_url;
                  const reviewerInitials = reviewerName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || 'SS';
                  const dateFormatted = new Date(rev.created_at).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  });

                  return (
                    <div
                      key={rev.id}
                      className="review-card"
                      style={{
                        padding: '1rem 1.25rem',
                        borderRadius: '12px',
                        background: 'var(--card-bg, rgba(255, 255, 255, 0.02))',
                        border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                          {reviewerAvatar ? (
                            <img
                              src={reviewerAvatar}
                              alt={`Profile photo of ${reviewerName}`}
                              className="swap-avatar swap-avatar-ring"
                              style={{ width: '36px', height: '36px' }}
                            />
                          ) : (
                            <div className="swap-avatar-fallback swap-avatar-ring" style={{ width: '36px', height: '36px', fontSize: '0.8rem' }}>
                              {reviewerInitials}
                            </div>
                          )}
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                              <strong style={{ fontSize: '0.9rem', color: 'var(--text-color)' }}>{reviewerName}</strong>
                              {rev.reviewer_profile?.username && (
                                <span style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>@{rev.reviewer_profile.username}</span>
                              )}
                              <VerificationBadge isVerified={rev.reviewer_profile?.is_verified} size="sm" />
                            </div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{dateFormatted}</span>
                          </div>
                        </div>

                        <div style={{ color: '#d97706', fontSize: '0.95rem', fontWeight: 700 }}>
                          {'★'.repeat(rev.rating)}{'☆'.repeat(5 - rev.rating)} <span style={{ fontSize: '0.85rem', marginLeft: '0.2rem' }}>({rev.rating}.0)</span>
                        </div>
                      </div>

                      {rev.swap?.topic && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', background: 'rgba(17, 22, 28, 0.04)', padding: '0.25rem 0.6rem', borderRadius: '6px', width: 'fit-content' }}>
                          Exchange: <strong>{rev.swap.topic}</strong>
                        </div>
                      )}

                      {rev.review_text && (
                        <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--text-color)', lineHeight: 1.5, fontStyle: 'italic' }}>
                          “{rev.review_text}”
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="profile-empty-state" style={{ padding: '1.5rem', background: 'var(--card-bg, rgba(255, 255, 255, 0.02))', borderRadius: '10px', border: '1px dashed var(--border-color, rgba(255, 255, 255, 0.1))' }}>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  No reviews recorded for this member yet.
                </p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
