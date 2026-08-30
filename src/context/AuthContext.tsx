import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
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

  const fetchUserProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    setProfileLoading(true);
    try {
      const userProfile = await getProfile(userId);
      setProfile(userProfile);
      return userProfile;
    } catch (err) {
      console.error('Error fetching profile:', err);
      setProfile(null);
      return null;
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const refreshProfile = useCallback(async (): Promise<Profile | null> => {
    if (!user) {
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

    // Fetch initial session once on mount
    supabase.auth
      .getSession()
      .then(async ({ data }: { data: { session: Session | null } }) => {
        if (!mounted) return;
        setSession(data.session);
        const currentUser = data.session?.user ?? null;
        setUser(currentUser);
        setLoading(false);

        if (currentUser) {
          const userProfile = await getProfile(currentUser.id);
          if (mounted) {
            setProfile(userProfile);
            setProfileLoading(false);
          }
        } else {
          setProfile(null);
          setProfileLoading(false);
        }
      })
      .catch((err) => {
        console.error('Error getting Supabase session:', err);
        if (mounted) {
          setLoading(false);
          setProfileLoading(false);
        }
      });

    // Subscribe to auth state changes (OAuth redirects, login, logout, password updates)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event: AuthChangeEvent, currentSession: Session | null) => {
      if (!mounted) return;
      setSession(currentSession);
      const currentUser = currentSession?.user ?? null;
      setUser(currentUser);
      setLoading(false);

      if (currentUser) {
        const userProfile = await getProfile(currentUser.id);
        if (mounted) {
          setProfile(userProfile);
          setProfileLoading(false);
        }
      } else {
        setProfile(null);
        setProfileLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

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
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
  };

  const isGoogleUser = Boolean(
    user &&
      (user.app_metadata?.provider === 'google' ||
        (Array.isArray(user.app_metadata?.providers) && user.app_metadata.providers.includes('google')) ||
        (Array.isArray(user.identities) && user.identities.some((id) => id.provider === 'google')))
  );

  const isVerified = Boolean(
    user && (Boolean(user.email_confirmed_at) || isGoogleUser)
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
