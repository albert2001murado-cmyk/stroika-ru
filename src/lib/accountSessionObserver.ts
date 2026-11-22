import { clientErrorCode } from "./clientErrorCode";

export type SessionIssue = "unavailable" | "reauthenticate" | "blocked";

export class SessionCheckError extends Error {
  constructor(readonly issue: SessionIssue, readonly accessDenied = false) { super(issue); }
}

export function sessionCheckFailure(error: unknown): SessionCheckError {
  if (error instanceof SessionCheckError) return error;
  const code = clientErrorCode(error);
  if (code === "security/blocked" || code === "auth/user-disabled") return new SessionCheckError("blocked", true);
  if (["security/session-expired", "security/mfa-required", "security/account-deleting", "auth/user-token-expired",
    "auth/invalid-user-token", "auth/user-not-found", "auth/id-token-revoked", "auth/id-token-expired"].includes(code))
    return new SessionCheckError("reauthenticate", true);
  return new SessionCheckError("unavailable");
}

export type AccountSessionState<U, P> = {
  user: U | null;
  profile: P | null;
  loading: boolean;
  profileReady: boolean;
  sessionIssue: SessionIssue | null;
  profileIssue: boolean;
};

export function initialAccountSession<U, P>(): AccountSessionState<U, P> {
  return { user: null, profile: null, loading: true, profileReady: false, sessionIssue: null, profileIssue: false };
}

export const AUTH_STARTUP_MS = 6_000;
export const PROFILE_WAIT_MS = 4_500;

/** The Firebase user persists separately from the verified access shown by the UI. */
export function observeAccountSession<U extends { uid: string }, P>(options: {
  verify(user: U, forceRefresh: boolean, signal: AbortSignal): Promise<void>;
  watchProfile(user: U, next: (profile: P | null, fromCache: boolean) => void,
    error: (accessDenied: boolean) => void): () => void;
  isCurrent(user: U): boolean;
  publish(state: AccountSessionState<U, P>): void;
  clearPrivateCaches(): void;
  startupMs?: number;
  profileWaitMs?: number;
}) {
  let state = initialAccountSession<U, P>();
  let observed: U | null = null;
  let initialized = false;
  let disposed = false;
  let generation = 0;
  let verifiedAt = 0;
  let pending: AbortController | undefined;
  let stopProfile: (() => void) | undefined;
  let profileTimer: ReturnType<typeof setTimeout> | undefined;
  let authTimer: ReturnType<typeof setTimeout> | undefined;

  function update(patch: Partial<AccountSessionState<U, P>>) {
    if (disposed) return;
    state = { ...state, ...patch };
    options.publish(state);
  }
  function waitForAuth() {
    clearTimeout(authTimer);
    authTimer = setTimeout(() => {
      if (!initialized) update({ loading: false, profileReady: true, sessionIssue: "unavailable" });
    }, options.startupMs ?? AUTH_STARTUP_MS);
  }
  function closeProfile() {
    clearTimeout(profileTimer);
    stopProfile?.();
    stopProfile = undefined;
  }
  function clearAccess(issue: SessionIssue | null, loading = false) {
    closeProfile();
    options.clearPrivateCaches();
    update({ user: null, profile: null, loading, profileReady: !loading, sessionIssue: issue, profileIssue: false });
  }
  function startProfile(user: U) {
    if (stopProfile) return;
    const scope = generation;
    const current = () => !disposed && scope === generation && state.user === user && options.isCurrent(user);
    profileTimer = setTimeout(() => {
      if (current()) update({ profileReady: true, profileIssue: true });
    }, options.profileWaitMs ?? PROFILE_WAIT_MS);
    const stop = options.watchProfile(user, (profile, fromCache) => {
      if (!current()) return;
      if (fromCache) {
        // The cache may fill in the view only after a fresh proof, never grant access.
        if (profile && !state.profile) update({ profile });
        return;
      }
      clearTimeout(profileTimer);
      update({ profile, profileReady: true, profileIssue: !profile });
    }, (accessDenied) => {
      if (!current()) return;
      closeProfile();
      if (accessDenied) clearAccess("unavailable");
      else update({ profileReady: true, profileIssue: true });
    });
    if (current()) stopProfile = stop;
    else stop();
  }
  async function check(forceRefresh: boolean) {
    const user = observed;
    if (disposed || !user || pending || !options.isCurrent(user)) return;
    const scope = generation;
    const controller = new AbortController();
    pending = controller;
    const current = () => !disposed && scope === generation && observed === user && options.isCurrent(user);
    if (!state.user) update({ loading: true, profileReady: false, sessionIssue: null });
    try {
      await options.verify(user, forceRefresh, controller.signal);
      if (!current()) return;
      verifiedAt = Date.now();
      update({ user, loading: false, sessionIssue: null });
      startProfile(user);
    } catch (error) {
      if (!current()) return;
      const failure = sessionCheckFailure(error);
      if (failure.issue === "unavailable" && !failure.accessDenied && state.user === user) {
        // A transient refresh failure must not turn an open profile into a guest screen.
        update({ loading: false, sessionIssue: "unavailable" });
      } else {
        clearAccess(failure.issue);
      }
    } finally {
      if (pending === controller) pending = undefined;
    }
  }
  waitForAuth();
  return {
    onUser(user: U | null) {
      if (disposed) return;
      clearTimeout(authTimer);
      const changed = !initialized || user?.uid !== observed?.uid;
      const replaced = !changed && user !== observed;
      initialized = true;
      if (changed || replaced) {
        generation++;
        pending?.abort();
        pending = undefined;
        closeProfile();
        observed = user;
        if (changed) {
          verifiedAt = 0;
          clearAccess(null, Boolean(user));
        } else if (user && state.user?.uid === user.uid) {
          // Firebase may replace the User object during a token refresh. This
          // is still the same verified identity, not a different account.
          update({ user });
        }
      }
      // A forced Firebase refresh emits a token event while this check is running.
      if (user) void check(changed);
    },
    retry() {
      if (!initialized) { update({ loading: true, profileReady: false, sessionIssue: null }); waitForAuth(); }
      else return check(true);
    },
    resume() {
      if (state.sessionIssue === "reauthenticate" || state.sessionIssue === "blocked") return;
      if (Date.now() - verifiedAt > 30_000 || state.sessionIssue || state.profileIssue) void check(false);
    },
    retryUnavailable() {
      if (state.sessionIssue === "unavailable" || state.profileIssue) void check(false);
    },
    dispose() {
      disposed = true;
      generation++;
      pending?.abort();
      clearTimeout(authTimer);
      closeProfile();
    },
  };
}
