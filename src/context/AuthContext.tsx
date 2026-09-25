import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { User, Session, AuthChangeEvent } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { getProfile, type Profile } from '../lib/supabase/profile';
import { getUserAccount, type Account } from '../lib/supabase/credits';
import { cleanSensitiveAuthParamsFromUrl } from '../lib/safeRedirect';

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
  isGitHubUser: boolean;
  connectedProviders: string[];
  isAnonymous: boolean;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<Session | null>;
  refreshProfile: () => Promise<Profile | null>;
  refreshAccount: () => Promise<Account | null>;
  updateAccountState: (partial: Partial<Account>) => void;
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
  isGitHubUser: false,
  connectedProviders: [],
  isAnonymous: false,
  signOut: async () => {},
  refreshSession: async () => null,
  refreshProfile: async () => null,
  refreshAccount: async () => null,
  updateAccountState: () => {},
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

  // Monotonic generation counter to prevent stale asynchronous profile/account queries
  // from overwriting state when user, session, or auth generation changes
  const authGenerationRef = useRef<number>(0);

  const hydrateProfileAndAccount = useCallback(async (userId: string, generationId: number) => {
    setProfileLoading(true);
    setAccountLoading(true);

    const [profileResult, accountResult] = await Promise.allSettled([
      getProfile(userId),
      getUserAccount(),
    ]);

    // Guard: ignore stale hydration if auth generation changed during async fetch
    if (authGenerationRef.current !== generationId) {
      return;
    }

    if (profileResult.status === 'fulfilled') {
      setProfile(profileResult.value);
    } else {
      console.error('Error fetching profile:', profileResult.reason);
      setProfile(null);
    }

    if (accountResult.status === 'fulfilled') {
      setAccount(accountResult.value);
    } else {
      console.error('Error fetching account:', accountResult.reason);
      setAccount(null);
    }

    setProfileLoading(false);
    setAccountLoading(false);
  }, []);

  const handleAuthTransition = useCallback((event: AuthChangeEvent | 'REFRESH_SESSION', newSession: Session | null) => {
    const newUser = newSession?.user ?? null;

    if (event === 'SIGNED_OUT' || (!newSession && event !== 'INITIAL_SESSION')) {
      authGenerationRef.current++;
      setSession(null);
      setUser(null);
      setProfile(null);
      setAccount(null);
      setProfileLoading(false);
      setAccountLoading(false);
      setLoading(false);
      return;
    }

    if (newUser) {
      cleanSensitiveAuthParamsFromUrl();
      const currentGen = ++authGenerationRef.current;
      setSession(newSession);
      setUser(newUser);
      setLoading(false);

      // Asynchronous hydration runs out-of-band without blocking auth event execution
      hydrateProfileAndAccount(newUser.id, currentGen);
    } else {
      authGenerationRef.current++;
      setSession(null);
      setUser(null);
      setProfile(null);
      setAccount(null);
      setProfileLoading(false);
      setAccountLoading(false);
      setLoading(false);
    }
  }, [hydrateProfileAndAccount]);

  const refreshProfile = useCallback(async (): Promise<Profile | null> => {
    if (!user) {
      setProfile(null);
      setProfileLoading(false);
      return null;
    }
    const currentGen = authGenerationRef.current;
    setProfileLoading(true);
    try {
      const userProfile = await getProfile(user.id);
      if (authGenerationRef.current === currentGen) {
        setProfile(userProfile);
      }
      return userProfile;
    } catch (err) {
      console.error('Error refreshing profile:', err);
      return null;
    } finally {
      if (authGenerationRef.current === currentGen) {
        setProfileLoading(false);
      }
    }
  }, [user]);

  const refreshAccount = useCallback(async (): Promise<Account | null> => {
    if (!user) {
      setAccount(null);
      setAccountLoading(false);
      return null;
    }
    const currentGen = authGenerationRef.current;
    setAccountLoading(true);
    try {
      const acc = await getUserAccount();
      if (authGenerationRef.current === currentGen) {
        setAccount(acc);
      }
      return acc;
    } catch (err) {
      console.error('Error refreshing account:', err);
      return null;
    } finally {
      if (authGenerationRef.current === currentGen) {
        setAccountLoading(false);
      }
    }
  }, [user]);

  const updateAccountState = useCallback((partial: Partial<Account>) => {
    setAccount((prev) => (prev ? { ...prev, ...partial } : null));
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoading(false);
      setProfileLoading(false);
      setAccountLoading(false);
      return;
    }

    let mounted = true;

    // Subscribe to auth state changes synchronously.
    // In Supabase v2, onAuthStateChange immediately fires INITIAL_SESSION with current session if present.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, currentSession: Session | null) => {
      if (!mounted) return;
      handleAuthTransition(event, currentSession);
    });

    // Fallback reconciliation for initial session check if listener subscription hasn't fired
    supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      if (!mounted) return;
      // Only process getSession if auth generation is still 0 (initial state before any auth event)
      if (authGenerationRef.current === 0) {
        handleAuthTransition('INITIAL_SESSION', data.session);
      }
    }).catch((err) => {
      console.error('Error getting Supabase session:', err);
      if (mounted && authGenerationRef.current === 0) {
        handleAuthTransition('INITIAL_SESSION', null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [handleAuthTransition]);

  const refreshSession = useCallback(async (): Promise<Session | null> => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return null;

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        console.error('Error getting session on refreshSession:', sessionError);
        return null;
      }
      const currentSession = sessionData.session;
      if (currentSession) {
        handleAuthTransition('REFRESH_SESSION', currentSession);
      }
      return currentSession;
    } catch (err) {
      console.error('Error refreshing session:', err);
      return null;
    }
  }, [handleAuthTransition]);

  const signOut = useCallback(async () => {
    if (user) {
      try {
        localStorage.removeItem(`skillswap_create_swap_draft_${user.id}`);
      } catch {
        // ignore
      }
    }

    authGenerationRef.current++;
    setUser(null);
    setSession(null);
    setProfile(null);
    setAccount(null);
    setProfileLoading(false);
    setAccountLoading(false);
    setLoading(false);

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Error signing out:', err);
    }
  }, [user]);

  const isGoogleUser = Boolean(
    user &&
      (user.app_metadata?.provider === 'google' ||
        (Array.isArray(user.app_metadata?.providers) && user.app_metadata.providers.includes('google')) ||
        (Array.isArray(user.identities) && user.identities.some((id) => id.provider === 'google')))
  );

  const isGitHubUser = Boolean(
    user &&
      (user.app_metadata?.provider === 'github' ||
        (Array.isArray(user.app_metadata?.providers) && user.app_metadata.providers.includes('github')) ||
        (Array.isArray(user.identities) && user.identities.some((id) => id.provider === 'github')))
  );

  const connectedProviders = React.useMemo(() => {
    if (!user) return [];
    const providersSet = new Set<string>();

    if (user.app_metadata?.provider) {
      providersSet.add(user.app_metadata.provider);
    }
    if (Array.isArray(user.app_metadata?.providers)) {
      user.app_metadata.providers.forEach((p) => {
        if (typeof p === 'string' && p.trim()) providersSet.add(p.trim());
      });
    }
    if (Array.isArray(user.identities)) {
      user.identities.forEach((id) => {
        if (id.provider) providersSet.add(id.provider);
      });
    }

    return Array.from(providersSet);
  }, [user]);

  const isAnonymous = Boolean(user && user.is_anonymous);

  const isVerified = Boolean(
    user && !isAnonymous && (Boolean(user.email_confirmed_at) || isGoogleUser || isGitHubUser)
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
        isGitHubUser,
        connectedProviders,
        isAnonymous,
        signOut,
        refreshSession,
        refreshProfile,
        refreshAccount,
        updateAccountState,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
