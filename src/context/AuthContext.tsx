import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { X, Lock, AlertTriangle, CheckCircle2, Trash2, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { SavedDiagnosticSessionDTO, UserAccountDTO } from '../types/domain.ts';

const AUTH_TOKEN_STORAGE_KEY = 'fixmyprint_auth_token_v1';
const GUEST_BOOKMARKS_STORAGE_KEY = 'fixmyprint_guest_bookmarks_v1';

export interface LocalGuestBookmark {
  sessionId: string;
  resumeToken: string;
  title: string;
  bookmarkPath: string;
  expiresAt: string;
  updatedAt: string;
}

interface AuthContextValue {
  user: UserAccountDTO | null;
  token: string | null;
  authLoading: boolean;
  guestBookmarks: LocalGuestBookmark[];
  accountSessions: SavedDiagnosticSessionDTO[];
  openAuthModal: (mode?: 'LOGIN' | 'REGISTER' | 'SESSIONS') => void;
  closeAuthModal: () => void;
  logout: () => Promise<void>;
  authFetch: (input: string, init?: RequestInit) => Promise<Response>;
  saveGuestBookmarkLocally: (bookmark: LocalGuestBookmark) => void;
  removeGuestBookmarkLocally: (sessionId: string) => void;
  refreshAccountSessions: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function readLocalBookmarks(): LocalGuestBookmark[] {
  try {
    const raw = localStorage.getItem(GUEST_BOOKMARKS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (b) => b && typeof b.sessionId === 'string' && typeof b.resumeToken === 'string'
    );
  } catch {
    return [];
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [user, setUser] = useState<UserAccountDTO | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(Boolean(token));
  const [guestBookmarks, setGuestBookmarks] = useState<LocalGuestBookmark[]>(() =>
    readLocalBookmarks()
  );
  const [accountSessions, setAccountSessions] = useState<SavedDiagnosticSessionDTO[]>([]);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<'LOGIN' | 'REGISTER' | 'SESSIONS'>('LOGIN');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const authFetch = useCallback(
    async (input: string, init?: RequestInit): Promise<Response> => {
      const headers = new Headers(init?.headers || {});
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      return fetch(input, { ...init, headers });
    },
    [token]
  );

  const saveGuestBookmarkLocally = useCallback((bookmark: LocalGuestBookmark) => {
    setGuestBookmarks((prev) => {
      const filtered = prev.filter((b) => b.sessionId !== bookmark.sessionId);
      const next = [bookmark, ...filtered].slice(0, 20);
      try {
        localStorage.setItem(GUEST_BOOKMARKS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage quota errors
      }
      return next;
    });
  }, []);

  const removeGuestBookmarkLocally = useCallback((sessionId: string) => {
    setGuestBookmarks((prev) => {
      const next = prev.filter((b) => b.sessionId !== sessionId);
      try {
        localStorage.setItem(GUEST_BOOKMARKS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  }, []);

  const refreshAccountSessions = useCallback(async () => {
    if (!token) {
      setAccountSessions([]);
      return;
    }
    try {
      const res = await fetch('/api/diagnostic-sessions/mine', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setAccountSessions(Array.isArray(json.active) ? json.active : []);
      }
    } catch {
      // Ignore network hiccup
    }
  }, [token]);

  // Verify stored token on boot
  useEffect(() => {
    if (!token) {
      setUser(null);
      setAuthLoading(false);
      setAccountSessions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setAuthLoading(true);
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          if (!cancelled) {
            setToken(null);
            setUser(null);
            try {
              localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
            } catch {
              // Ignore
            }
          }
          return;
        }
        const json = await res.json();
        if (!cancelled && json.user) {
          setUser(json.user);
        }
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (user && token) {
      refreshAccountSessions();
    }
  }, [user, token, refreshAccountSessions]);

  const openAuthModal = useCallback(
    (mode?: 'LOGIN' | 'REGISTER' | 'SESSIONS') => {
      setFormError(null);
      setSyncMessage(null);
      if (mode) {
        setModalTab(mode);
      } else {
        setModalTab(user ? 'SESSIONS' : 'LOGIN');
      }
      setModalOpen(true);
    },
    [user]
  );

  const closeAuthModal = useCallback(() => {
    setModalOpen(false);
    setFormError(null);
  }, []);

  const logout = useCallback(async () => {
    if (token) {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    setToken(null);
    setUser(null);
    setAccountSessions([]);
    try {
      localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    } catch {
      // Ignore
    }
  }, [token]);

  async function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const endpoint = modalTab === 'REGISTER' ? '/api/auth/register' : '/api/auth/login';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: emailInput.trim(),
          password: passwordInput,
          displayName: modalTab === 'REGISTER' ? displayNameInput.trim() : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFormError(json.error || 'Authentication failed.');
        return;
      }
      setToken(json.token);
      setUser(json.user);
      try {
        localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, json.token);
      } catch {
        // Ignore
      }
      setPasswordInput('');
      setModalTab('SESSIONS');
    } catch {
      setFormError('Network error while contacting authentication service.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleClaimGuestBookmarks() {
    if (!token || guestBookmarks.length === 0) return;
    let claimedCount = 0;
    for (const bm of guestBookmarks) {
      const res = await fetch(`/api/diagnostic-sessions/${encodeURIComponent(bm.sessionId)}/claim`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ resumeToken: bm.resumeToken }),
      });
      if (res.ok) {
        claimedCount += 1;
        removeGuestBookmarkLocally(bm.sessionId);
      }
    }
    await refreshAccountSessions();
    setSyncMessage(
      claimedCount > 0
        ? `Attached ${claimedCount} guest bookmark(s) to your account and extended expiration to 90 days.`
        : 'Guest bookmarks were already claimed or expired.'
    );
  }

  async function handleDeleteAccountSession(sessionId: string) {
    if (!token) return;
    const res = await fetch(`/api/diagnostic-sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      await refreshAccountSessions();
    }
  }

  const nowIso = new Date().toISOString();

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        authLoading,
        guestBookmarks,
        accountSessions,
        openAuthModal,
        closeAuthModal,
        logout,
        authFetch,
        saveGuestBookmarkLocally,
        removeGuestBookmarkLocally,
        refreshAccountSessions,
      }}
    >
      {children}

      {/* Accessible Account & Saved Sessions Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-modal-heading"
        >
          <div className="w-full max-w-lg rounded-xl bg-white border border-slate-200 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/70">
              <div>
                <h2 id="auth-modal-heading" className="text-base font-bold text-slate-950">
                  {user ? `Technician Account · ${user.displayName}` : 'Saved Sessions & Account'}
                </h2>
                <p className="text-xs text-slate-600">
                  {user
                    ? 'Saved diagnostic sessions stay synced for 90 days of inactivity.'
                    : 'No account needed to diagnose — sign in only to sync saved sessions for 90 days.'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeAuthModal}
                aria-label="Close dialog"
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-slate-200 px-6 pt-3 gap-6 text-xs font-semibold">
              {!user && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setModalTab('LOGIN');
                      setFormError(null);
                    }}
                    className={`pb-2.5 border-b-2 transition-colors ${
                      modalTab === 'LOGIN'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setModalTab('REGISTER');
                      setFormError(null);
                    }}
                    className={`pb-2.5 border-b-2 transition-colors ${
                      modalTab === 'REGISTER'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Create Account
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setModalTab('SESSIONS')}
                className={`pb-2.5 border-b-2 transition-colors ${
                  modalTab === 'SESSIONS'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                Saved Sessions ({user ? accountSessions.length : guestBookmarks.length})
              </button>
            </div>

            <div className="p-6 max-h-[75vh] overflow-y-auto">
              {(modalTab === 'LOGIN' || modalTab === 'REGISTER') && !user && (
                <form onSubmit={handleAuthSubmit} className="space-y-4">
                  {modalTab === 'REGISTER' && (
                    <div>
                      <label htmlFor="auth-display-name" className="block text-xs font-semibold text-slate-700 mb-1">
                        Name or Workshop Handle
                      </label>
                      <input
                        id="auth-display-name"
                        type="text"
                        value={displayNameInput}
                        onChange={(e) => setDisplayNameInput(e.target.value)}
                        placeholder="e.g. Alex (Voron Bench)"
                        className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  )}

                  <div>
                    <label htmlFor="auth-email" className="block text-xs font-semibold text-slate-700 mb-1">
                      Email Address *
                    </label>
                    <input
                      id="auth-email"
                      type="email"
                      required
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <div>
                    <label htmlFor="auth-password" className="block text-xs font-semibold text-slate-700 mb-1">
                      Password (minimum 8 characters) *
                    </label>
                    <input
                      id="auth-password"
                      type="password"
                      required
                      minLength={8}
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-start gap-2">
                    <Lock className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                    <span>
                      Guest bookmark links expire automatically after <strong>7 days</strong>. Signing in locks saved sessions privately to your account with a <strong>90-day</strong> sliding expiration.
                    </span>
                  </div>

                  {formError && (
                    <p className="text-xs font-medium text-red-700 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      {formError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {submitting
                      ? 'Please wait...'
                      : modalTab === 'REGISTER'
                      ? 'Create Account & Sync Sessions'
                      : 'Sign In'}
                  </button>
                </form>
              )}

              {modalTab === 'SESSIONS' && (
                <div className="space-y-5">
                  {user && (
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100 text-xs">
                      <span className="text-slate-600">
                        Signed in as <strong className="text-slate-900">{user.email}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={logout}
                        className="font-semibold text-slate-600 hover:text-red-700"
                      >
                        Sign out
                      </button>
                    </div>
                  )}

                  {user && guestBookmarks.length > 0 && (
                    <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 space-y-2 text-xs">
                      <p className="text-slate-800">
                        You have <strong>{guestBookmarks.length}</strong> guest bookmark(s) saved in this browser. Claim them to lock access to your account and extend expiration to 90 days.
                      </p>
                      <button
                        type="button"
                        onClick={handleClaimGuestBookmarks}
                        className="px-3 py-1.5 font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                      >
                        Claim Guest Bookmarks to Account
                      </button>
                    </div>
                  )}

                  {syncMessage && (
                    <p className="text-xs font-medium text-emerald-700 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      {syncMessage}
                    </p>
                  )}

                  {user ? (
                    <div className="space-y-3">
                      <h3 className="text-xs font-semibold text-slate-900">
                        Account Saved Sessions (90-Day Sliding Expiration)
                      </h3>
                      {accountSessions.length === 0 ? (
                        <p className="text-sm text-slate-600 py-2">
                          No saved diagnostic sessions yet. Click <strong>Save &amp; Bookmark Progress</strong> while diagnosing any printer problem.
                        </p>
                      ) : (
                        <div className="space-y-2.5">
                          {accountSessions.map((s) => (
                            <div
                              key={s.id}
                              className="p-3.5 rounded-xl border border-slate-200 bg-white flex items-center justify-between gap-3"
                            >
                              <div className="min-w-0 space-y-0.5">
                                <p className="text-sm font-semibold text-slate-950 truncate">{s.title}</p>
                                <p className="text-xs text-slate-500">
                                  {Object.keys(s.answersByQuestionId).length} answer(s) · Expires{' '}
                                  {s.expiresAt.slice(0, 10)}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <Link
                                  to={`/diagnose?session=${encodeURIComponent(s.id)}`}
                                  onClick={closeAuthModal}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                                >
                                  Resume <ArrowRight className="w-3 h-3" />
                                </Link>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteAccountSession(s.id)}
                                  aria-label={`Delete saved session ${s.title}`}
                                  className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <h3 className="text-xs font-semibold text-slate-900">
                        Browser Guest Bookmarks (7-Day Expiration)
                      </h3>
                      {guestBookmarks.length === 0 ? (
                        <p className="text-sm text-slate-600 py-2">
                          No bookmarked sessions in this browser yet. Start troubleshooting and click{' '}
                          <strong>Save &amp; Bookmark Progress</strong> to generate a resumable link, or sign in for 90-day account storage.
                        </p>
                      ) : (
                        <div className="space-y-2.5">
                          {guestBookmarks.map((bm) => {
                            const isExpired = bm.expiresAt <= nowIso;
                            return (
                              <div
                                key={bm.sessionId}
                                className="p-3.5 rounded-xl border border-slate-200 bg-white flex items-center justify-between gap-3"
                              >
                                <div className="min-w-0 space-y-0.5">
                                  <p className="text-sm font-semibold text-slate-950 truncate">{bm.title}</p>
                                  <p className="text-xs text-slate-500">
                                    {isExpired
                                      ? `Expired on ${bm.expiresAt.slice(0, 10)}`
                                      : `Guest link · Expires ${bm.expiresAt.slice(0, 10)}`}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {!isExpired && (
                                    <Link
                                      to={bm.bookmarkPath}
                                      onClick={closeAuthModal}
                                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                                    >
                                      Resume <ArrowRight className="w-3 h-3" />
                                    </Link>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => removeGuestBookmarkLocally(bm.sessionId)}
                                    aria-label={`Remove bookmark ${bm.title}`}
                                    className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
