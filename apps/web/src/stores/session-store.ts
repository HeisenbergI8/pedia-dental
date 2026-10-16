"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Session } from "@pedia/shared";
import { env } from "@/lib/env";
import { clearAllDrafts } from "@/lib/form-draft";
import { BRANCH_COOKIE, clinicSessionWrites, writeCookie } from "@/lib/session-cookies";

/**
 * The session's script-written cookie: pd_session in `enabled`, the pd_mock_session bridge in `hybrid` (the API sets
 * pd_session itself, httpOnly), nothing in `disabled` (lib/session-cookies.ts).
 */
const writeSession = (session: Session | null) => {
  for (const [name, value] of clinicSessionWrites(env.apiMockingMode, session)) writeCookie(name, value);
};

type SessionState = {
  session: Session | null;
  /** The portal's selected child, kept across refreshes. */
  activeChildId: string | null;
  /** The branch this device is on; null means the server's default (the user's first branch). */
  branchId: string | null;
  signIn: (session: Session) => void;
  /** The same login, its server state refreshed (a step that became due). Keeps drafts, unlike signIn. */
  refreshUser: (user: Session["user"]) => void;
  signOut: () => void;
  setActiveChild: (id: string) => void;
  setBranch: (id: string) => void;
};

/** Who is signed in (demo login). Persisted, so a refresh keeps the session. Replaces role-store.ts. */
export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      session: null,
      activeChildId: null,
      branchId: null,
      // Leaves the branch alone: a PIN switch reuses this, and the device stays where it is (decision #24).
      signIn: (session) => {
        clearAllDrafts(); // Switch user reuses signIn: the next person never sees the last one's typing
        writeSession(session);
        set({ session, activeChildId: null });
      },
      refreshUser: (user) => set((s) => (s.session && s.session.user.id === user.id ? { session: { ...s.session, user } } : {})),
      signOut: () => {
        clearAllDrafts();
        writeSession(null); // the API's pd_session is cleared by POST /auth/logout (useSignOut)
        writeCookie(BRANCH_COOKIE, null);
        set({ session: null, activeChildId: null, branchId: null });
      },
      setActiveChild: (activeChildId) => set({ activeChildId }),
      setBranch: (branchId) => {
        writeCookie(BRANCH_COOKIE, branchId);
        set({ branchId });
      },
    }),
    {
      // v2: tokens name the clinic account (demo.<clinicId>.<accountId>); a v1 token would only ever get 401s.
      name: "pedia-dental:session:v2",
      partialize: ({ session, activeChildId, branchId }) => ({ session, activeChildId, branchId }),
      // The cookie has no expiry, so the browser drops it on quit; storage brings it back.
      onRehydrateStorage: () => (state) => {
        if (state?.session) writeSession(state.session);
        if (state?.branchId) writeCookie(BRANCH_COOKIE, state.branchId);
      },
    },
  ),
);
