import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Session, User, AuthChangeEvent } from '@supabase/supabase-js';

// Minimal deterministic simulator for AuthContext state machine
interface SimulatedState {
  user: User | null;
  session: Session | null;
  profile: unknown | null;
  account: unknown | null;
  loading: boolean;
  profileLoading: boolean;
  accountLoading: boolean;
}

class AuthContextSimulator {
  public state: SimulatedState = {
    user: null,
    session: null,
    profile: null,
    account: null,
    loading: true,
    profileLoading: true,
    accountLoading: true,
  };

  private authGeneration = 0;

  public mockProfileFetcher: (userId: string) => Promise<unknown> = async (userId) => ({ id: userId, username: 'testuser' });
  public mockAccountFetcher: () => Promise<unknown> = async () => ({ credits_balance: 100, credits_reserved: 0 });

  public handleAuthTransition(event: AuthChangeEvent | 'REFRESH_SESSION', newSession: Session | null) {
    const newUser = newSession?.user ?? null;

    if (event === 'SIGNED_OUT' || (!newSession && event !== 'INITIAL_SESSION')) {
      this.authGeneration++;
      this.state.session = null;
      this.state.user = null;
      this.state.profile = null;
      this.state.account = null;
      this.state.profileLoading = false;
      this.state.accountLoading = false;
      this.state.loading = false;
      return;
    }

    if (newUser) {
      const currentGen = ++this.authGeneration;
      this.state.session = newSession;
      this.state.user = newUser;
      this.state.loading = false;
      this.state.profileLoading = true;
      this.state.accountLoading = true;

      // Async hydration with generation check
      this.hydrateProfileAndAccount(newUser.id, currentGen);
    } else {
      this.authGeneration++;
      this.state.session = null;
      this.state.user = null;
      this.state.profile = null;
      this.state.account = null;
      this.state.profileLoading = false;
      this.state.accountLoading = false;
      this.state.loading = false;
    }
  }

  private async hydrateProfileAndAccount(userId: string, generationId: number) {
    const [profileRes, accountRes] = await Promise.allSettled([
      this.mockProfileFetcher(userId),
      this.mockAccountFetcher(),
    ]);

    if (this.authGeneration !== generationId) {
      return;
    }

    if (profileRes.status === 'fulfilled') {
      this.state.profile = profileRes.value;
    } else {
      this.state.profile = null;
    }

    if (accountRes.status === 'fulfilled') {
      this.state.account = accountRes.value;
    } else {
      this.state.account = null;
    }

    this.state.profileLoading = false;
    this.state.accountLoading = false;
  }

  public getGeneration() {
    return this.authGeneration;
  }
}

function makeMockSession(id: string, email = 'user@example.com'): Session {
  return {
    access_token: 'mock-access-token',
    token_type: 'bearer',
    expires_in: 3600,
    refresh_token: 'mock-refresh-token',
    user: {
      id,
      email,
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: new Date().toISOString(),
    },
  };
}

describe('AuthContext Deterministic Lifecycle & Race-Condition Isolation Unit Tests', () => {
  it('1. INITIAL_SESSION with valid session populates user/session state', async () => {
    const sim = new AuthContextSimulator();
    const session = makeMockSession('user-1');

    sim.handleAuthTransition('INITIAL_SESSION', session);

    assert.equal(sim.state.user?.id, 'user-1');
    assert.equal(sim.state.session?.access_token, 'mock-access-token');
    assert.equal(sim.state.loading, false);

    // Wait for async hydration
    await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(sim.state.profile, { id: 'user-1', username: 'testuser' });
    assert.equal(sim.state.profileLoading, false);
  });

  it('2. SIGNED_IN with valid session populates user/session', async () => {
    const sim = new AuthContextSimulator();
    const session = makeMockSession('user-2');

    sim.handleAuthTransition('SIGNED_IN', session);

    assert.equal(sim.state.user?.id, 'user-2');
    assert.equal(sim.state.loading, false);

    await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(sim.state.profile, { id: 'user-2', username: 'testuser' });
  });

  it('3. TOKEN_REFRESHED with valid session retains refreshed session', async () => {
    const sim = new AuthContextSimulator();
    const initialSession = makeMockSession('user-3');
    sim.handleAuthTransition('INITIAL_SESSION', initialSession);

    await new Promise((r) => setTimeout(r, 20));

    const refreshedSession = { ...initialSession, access_token: 'new-refreshed-token' };
    sim.handleAuthTransition('TOKEN_REFRESHED', refreshedSession);

    assert.equal(sim.state.user?.id, 'user-3');
    assert.equal(sim.state.session?.access_token, 'new-refreshed-token');
  });

  it('4. PROFILE fetch failure leaves user/session authenticated', async () => {
    const sim = new AuthContextSimulator();
    sim.mockProfileFetcher = async () => {
      throw new Error('Database profile connection error');
    };

    const session = makeMockSession('user-4');
    sim.handleAuthTransition('SIGNED_IN', session);

    assert.equal(sim.state.user?.id, 'user-4');
    assert.equal(sim.state.loading, false);

    await new Promise((r) => setTimeout(r, 20));

    // Profile is null due to fetch error, but user & session remain authenticated!
    assert.equal(sim.state.profile, null);
    assert.notEqual(sim.state.user, null);
    assert.equal(sim.state.user?.id, 'user-4');
  });

  it('5. ACCOUNT fetch failure leaves user/session authenticated', async () => {
    const sim = new AuthContextSimulator();
    sim.mockAccountFetcher = async () => {
      throw new Error('Account balance query failed');
    };

    const session = makeMockSession('user-5');
    sim.handleAuthTransition('SIGNED_IN', session);

    await new Promise((r) => setTimeout(r, 20));

    assert.equal(sim.state.account, null);
    assert.notEqual(sim.state.user, null);
    assert.equal(sim.state.user?.id, 'user-5');
  });

  it('6. Stale profile/account response from previous auth generation cannot overwrite current state', async () => {
    const sim = new AuthContextSimulator();

    let resolveSlowProfile: (val: unknown) => void = () => {};
    sim.mockProfileFetcher = async (userId) => {
      if (userId === 'user-6-old') {
        return new Promise((resolve) => {
          resolveSlowProfile = () => resolve({ id: 'user-6-old', username: 'stale_user' });
        });
      }
      return { id: userId, username: 'fresh_user' };
    };

    // Session 1: Old user
    sim.handleAuthTransition('SIGNED_IN', makeMockSession('user-6-old'));

    // Session 2: User switches to User 7 quickly before old profile resolved
    sim.handleAuthTransition('SIGNED_IN', makeMockSession('user-7-new'));

    // Fast-resolve user 7 hydration
    await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(sim.state.profile, { id: 'user-7-new', username: 'fresh_user' });

    // Now resolve the old slow user profile from generation 1
    resolveSlowProfile(null);
    await new Promise((r) => setTimeout(r, 20));

    // Stale user profile MUST NOT overwrite current user 7 state!
    assert.deepEqual(sim.state.profile, { id: 'user-7-new', username: 'fresh_user' });
    assert.equal(sim.state.user?.id, 'user-7-new');
  });

  it('7. SIGNED_OUT clears all auth, session, profile, and account state', async () => {
    const sim = new AuthContextSimulator();
    sim.handleAuthTransition('SIGNED_IN', makeMockSession('user-8'));
    await new Promise((r) => setTimeout(r, 20));

    assert.notEqual(sim.state.user, null);

    sim.handleAuthTransition('SIGNED_OUT', null);

    assert.equal(sim.state.user, null);
    assert.equal(sim.state.session, null);
    assert.equal(sim.state.profile, null);
    assert.equal(sim.state.account, null);
    assert.equal(sim.state.loading, false);
  });

  it('8. Repeated auth events are idempotent and preserve user state', async () => {
    const sim = new AuthContextSimulator();
    const session = makeMockSession('user-9');

    sim.handleAuthTransition('SIGNED_IN', session);
    sim.handleAuthTransition('USER_UPDATED', session);
    sim.handleAuthTransition('TOKEN_REFRESHED', session);

    assert.equal(sim.state.user?.id, 'user-9');
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(sim.state.profileLoading, false);
  });

  it('9. React StrictMode duplicate initialization does not produce false logged-out state', async () => {
    const sim = new AuthContextSimulator();
    const session = makeMockSession('user-10');

    // Simulate double mount in StrictMode
    sim.handleAuthTransition('INITIAL_SESSION', session);
    sim.handleAuthTransition('INITIAL_SESSION', session);

    assert.equal(sim.state.user?.id, 'user-10');
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(sim.state.user?.id, 'user-10');
  });

  it('10. Genuine invalid/expired session transition becomes logged out when Supabase emits null session on event', async () => {
    const sim = new AuthContextSimulator();
    sim.handleAuthTransition('SIGNED_IN', makeMockSession('user-11'));
    await new Promise((r) => setTimeout(r, 20));

    // Session expired / invalidated transition
    sim.handleAuthTransition('TOKEN_REFRESHED', null);

    assert.equal(sim.state.user, null);
    assert.equal(sim.state.session, null);
  });
});
