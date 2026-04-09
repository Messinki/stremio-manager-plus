/**
 * Auth store — server-side session model.
 *
 * The browser never holds a token in JS. The session lives in an HttpOnly
 * cookie set by the backend; we just track who the cookie belongs to so the
 * UI knows whether to show <App> or <AuthPage>.
 *
 * On startup `initialize()` calls `GET /api/auth/me`, which restores `user`
 * if the cookie is still valid. login/register set `user` on success;
 * logout clears it.
 */

import { create } from 'zustand'
import { authApi, type AuthUser } from '@/api/backend-client'

interface AuthStore {
  user: AuthUser | null
  /** True until `initialize()` has finished its first /me check. */
  isInitializing: boolean

  initialize: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  /** Called by the backend client when any request returns 401 — wipes the
   *  in-memory user so the UI falls back to <AuthPage>. */
  clearUser: () => void
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isInitializing: true,

  initialize: async () => {
    try {
      const user = await authApi.me()
      set({ user, isInitializing: false })
    } catch {
      // Network error or unexpected — fail closed.
      set({ user: null, isInitializing: false })
    }
  },

  login: async (email, password) => {
    const user = await authApi.login(email, password)
    set({ user })
  },

  register: async (email, password) => {
    const user = await authApi.register(email, password)
    set({ user })
  },

  logout: async () => {
    try {
      await authApi.logout()
    } finally {
      // Always clear locally even if the network call failed — the cookie
      // may already be gone server-side.
      set({ user: null })
    }
  },

  clearUser: () => set({ user: null }),
}))
