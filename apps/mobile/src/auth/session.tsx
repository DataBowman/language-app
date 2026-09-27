import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export type Role = 'student' | 'tutor';

type State =
  | { status: 'loading' }
  | { status: 'signed_out' }
  | { status: 'signed_in'; userId: string; email: string | null; role: Role | null };

interface SessionApi {
  state: State;
  /** 'dev' = no Supabase project configured: a local role picker, no data. */
  backend: 'supabase' | 'dev';
  sendCode(email: string): Promise<void>;
  verifyCode(email: string, code: string): Promise<void>;
  devSignIn(role: Role): void;
  signOut(): Promise<void>;
}

const SessionContext = createContext<SessionApi | null>(null);

async function loadRole(userId: string): Promise<Role | null> {
  const { data, error } = await supabase!.from('profiles').select('role').eq('id', userId).maybeSingle();
  if (error) throw error;
  return (data?.role as Role | undefined) ?? null;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: isSupabaseConfigured ? 'loading' : 'signed_out' });

  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) return setState({ status: 'signed_out' });
      const { id, email } = session.user;
      // Defer the query: Supabase must not be awaited inside this callback.
      setTimeout(() => {
        loadRole(id)
          .then((role) => setState({ status: 'signed_in', userId: id, email: email ?? null, role }))
          .catch(() => setState({ status: 'signed_in', userId: id, email: email ?? null, role: null }));
      }, 0);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const sendCode = useCallback(async (email: string) => {
    if (!supabase) throw new Error('Supabase is not configured');
    // shouldCreateUser: false — accounts are invite-only (ARCHITECTURE §6).
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    if (error) throw error;
  }, []);

  const verifyCode = useCallback(async (email: string, code: string) => {
    if (!supabase) throw new Error('Supabase is not configured');
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
    if (error) throw error;
  }, []);

  // Only exists when no backend is configured: there is then no data to protect, and it lets the UI
  // be developed and tested (e2e) without a Supabase project. With a backend, only real sign-in works.
  const devSignIn = useCallback((role: Role) => {
    if (isSupabaseConfigured) throw new Error('Dev sign-in is disabled when a backend is configured');
    setState({ status: 'signed_in', userId: `dev-${role}`, email: null, role });
  }, []);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    setState({ status: 'signed_out' });
  }, []);

  const api = useMemo<SessionApi>(
    () => ({ state, backend: isSupabaseConfigured ? 'supabase' : 'dev', sendCode, verifyCode, devSignIn, signOut }),
    [state, sendCode, verifyCode, devSignIn, signOut],
  );
  return <SessionContext.Provider value={api}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionApi {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
