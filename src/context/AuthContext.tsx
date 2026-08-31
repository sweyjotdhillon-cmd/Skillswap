import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { User, Session, AuthChangeEvent } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { getProfile, type Profile } from '../lib/supabase/profile';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  profileLoading: boolean;
  isVerified: boolean;
  isGoogleUser: boolean;
  isAnonymous: boolean;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<Session | null>;
  refreshProfile: () => Promise<Profile | null>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  loading: true,
  profileLoading: true,
  isVerified: false,
  isGoogleUser: false,
  isAnonymous: false,
  signOut: async () => {},
  refreshSession: async () => null,
  refreshProfile: async () => null,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);

  // Track the current user ID being processed to prevent race conditions
  const currentFetchUserIdRef = useRef<string | null>(null);

  const fetchUserProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    currentFetchUserIdRef.current = userId;
    setProfileLoading(true);
    try {
      const userProfile = await getProfile(userId);
      // Only set profile if this request is still for the active user
      if (currentFetchUserIdRef.current === userId) {
        setProfile(userProfile);
      }
      return userProfile;
    } catch (err) {
      console.error('Error fetching profile:', err);
      if (currentFetchUserIdRef.current === userId) {
        setProfile(null);
      }
      return null;
    } finally {
      if (currentFetchUserIdRef.current === userId) {
        setProfileLoading(false);
      }
    }
  }, []);

  const refreshProfile = useCallback(async (): Promise<Profile | null> => {
    if (!user) {
      currentFetchUserIdRef.current = null;
      setProfile(null);
      setProfileLoading(false);
      return null;
    }
    return await fetchUserProfile(user.id);
  }, [user, fetchUserProfile]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoading(false);
      setProfileLoading(false);
      return;
    }

    let mounted = true;

    // Fetch initial session
    supabase.auth
      .getSession()
      .then(async ({ data }: { data: { session: Session | null } }) => {
        if (!mounted) return;
        const initialSession = data.session;
        setSession(initialSession);
        const currentUser = initialSession?.user ?? null;
        setUser(currentUser);

        if (currentUser) {
          await fetchUserProfile(currentUser.id);
        } else {
          currentFetchUserIdRef.current = null;
          setProfile(null);
          setProfileLoading(false);
        }
        if (mounted) {
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Error getting Supabase session:', err);
        if (mounted) {
          currentFetchUserIdRef.current = null;
          setProfile(null);
          setProfileLoading(false);
          setLoading(false);
        }
      });

    // Subscribe to auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, currentSession: Session | null) => {
      if (!mounted) return;

      // Skip redundant initial session event if getSession already resolved
      if (event === 'INITIAL_SESSION' && session !== null) {
        return;
      }

      setSession(currentSession);
      const currentUser = currentSession?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        await fetchUserProfile(currentUser.id);
      } else {
        currentFetchUserIdRef.current = null;
        setProfile(null);
        setProfileLoading(false);
      }
      if (mounted) {
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchUserProfile]);

  const refreshSession = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return null;

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (!userError && userData.user) {
        setUser(userData.user);
      }

      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session) {
        setSession(sessionData.session);
        setUser(sessionData.session.user);
      }
      return sessionData.session;
    } catch (err) {
      console.error('Error refreshing session:', err);
      return null;
    }
  };

  const signOut = async () => {
    currentFetchUserIdRef.current = null;
    setUser(null);
    setSession(null);
    setProfile(null);
    setProfileLoading(false);

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Error signing out:', err);
    }
  };

  const isGoogleUser = Boolean(
    user &&
      (user.app_metadata?.provider === 'google' ||
        (Array.isArray(user.app_metadata?.providers) && user.app_metadata.providers.includes('google')) ||
        (Array.isArray(user.identities) && user.identities.some((id) => id.provider === 'google')))
  );

  const isAnonymous = Boolean(user && user.is_anonymous);

  const isVerified = Boolean(
    user && !isAnonymous && (Boolean(user.email_confirmed_at) || isGoogleUser)
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        profileLoading,
        isVerified,
        isGoogleUser,
        isAnonymous,
        signOut,
        refreshSession,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
