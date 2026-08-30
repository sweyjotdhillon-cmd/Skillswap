import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User, Session, AuthChangeEvent } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '../lib/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isVerified: boolean;
  isGoogleUser: boolean;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<Session | null>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  isVerified: false,
  isGoogleUser: false,
  signOut: async () => {},
  refreshSession: async () => null,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoading(false);
      return;
    }

    let mounted = true;

    // Fetch initial session once on mount
    supabase.auth
      .getSession()
      .then(({ data }: { data: { session: Session | null } }) => {
        if (mounted) {
          setSession(data.session);
          setUser(data.session?.user ?? null);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Error getting Supabase session:', err);
        if (mounted) {
          setLoading(false);
        }
      });

    // Subscribe to auth state changes (OAuth redirects, login, logout, password updates)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, currentSession: Session | null) => {
      if (mounted) {
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
        setLoading(false);
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
    <AuthContext.Provider value={{ user, session, loading, isVerified, isGoogleUser, signOut, refreshSession }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
