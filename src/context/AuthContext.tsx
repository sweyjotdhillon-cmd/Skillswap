import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { User, Session, AuthChangeEvent } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { getProfile, type Profile } from '../lib/supabase/profile';
import { getUserAccount, type Account } from '../lib/supabase/credits';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  account: Account | null;
  loading: boolean;
  profileLoading: boolean;
  accountLoading: boolean;
  isVerified: boolean;
  isGoogleUser: boolean;
  isAnonymous: boolean;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<Session | null>;
  refreshProfile: () => Promise<Profile | null>;
  refreshAccount: () => Promise<Account | null>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  account: null,
  loading: true,
  profileLoading: true,
  accountLoading: true,
  isVerified: false,
  isGoogleUser: false,
  isAnonymous: false,
  signOut: async () => {},
  refreshSession: async () => null,
  refreshProfile: async () => null,
  refreshAccount: async () => null,
});

/* eslint-disable react-refresh/only-export-components */
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);
  const [accountLoading, setAccountLoading] = useState(true);

  // Track the current user ID being processed to prevent race conditions
  const currentFetchUserIdRef = useRef<string | null>(null);

  const fetchUserProfileAndAccount = useCallback(async (userId: string): Promise<{ profile: Profile | null; account: Account | null }> => {
    currentFetchUserIdRef.current = userId;
    setProfileLoading(true);
    setAccountLoading(true);

    try {
      const [userProfile, userAccount] = await Promise.all([
        getProfile(userId),
        getUserAccount(),
      ]);

      if (currentFetchUserIdRef.current === userId) {
        setProfile(userProfile);
        setAccount(userAccount);
      }
      return { profile: userProfile, account: userAccount };
    } catch (err) {
      console.error('Error fetching profile or account:', err);
      if (currentFetchUserIdRef.current === userId) {
        setProfile(null);
        setAccount(null);
      }
      return { profile: null, account: null };
    } finally {
      if (currentFetchUserIdRef.current === userId) {
        setProfileLoading(false);
        setAccountLoading(false);
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
    const { profile } = await fetchUserProfileAndAccount(user.id);
    return profile;
  }, [user, fetchUserProfileAndAccount]);

  const refreshAccount = useCallback(async (): Promise<Account | null> => {
    if (!user) {
      setAccount(null);
      setAccountLoading(false);
      return null;
    }
    setAccountLoading(true);
    try {
      const acc = await getUserAccount();
      setAccount(acc);
      return acc;
    } catch (err) {
      console.error('Error refreshing account:', err);
      return null;
    } finally {
      setAccountLoading(false);
    }
  }, [user]);

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
          await fetchUserProfileAndAccount(currentUser.id);
        } else {
          currentFetchUserIdRef.current = null;
          setProfile(null);
          setAccount(null);
          setProfileLoading(false);
          setAccountLoading(false);
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
          setAccount(null);
          setProfileLoading(false);
          setAccountLoading(false);
          setLoading(false);
        }
      });

    // Subscribe to auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, currentSession: Session | null) => {
      if (!mounted) return;

      if (event === 'INITIAL_SESSION') {
        // Handled by getSession above to prevent redundant fetch
        return;
      }

      setSession(currentSession);
      const currentUser = currentSession?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        await fetchUserProfileAndAccount(currentUser.id);
      } else {
        currentFetchUserIdRef.current = null;
        setProfile(null);
        setAccount(null);
        setProfileLoading(false);
        setAccountLoading(false);
      }
      if (mounted) {
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchUserProfileAndAccount]);

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
    if (user) {
      try {
        localStorage.removeItem(`skillswap_create_swap_draft_${user.id}`);
      } catch {
        // ignore
      }
    }

    currentFetchUserIdRef.current = null;
    setUser(null);
    setSession(null);
    setProfile(null);
    setAccount(null);
    setProfileLoading(false);
    setAccountLoading(false);

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
        account,
        loading,
        profileLoading,
        accountLoading,
        isVerified,
        isGoogleUser,
        isAnonymous,
        signOut,
        refreshSession,
        refreshProfile,
        refreshAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
