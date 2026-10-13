"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Session } from "@pedia/shared";
import { clearAllDrafts } from "@/lib/form-draft";

/** Read by the mock API (mocks/access.ts). NestJS will set its own httpOnly cookie instead (Q4). */
const COOKIE = "pd_session";
/** The branch this device works at. Read by the mock API (`branchOf`), which ignores one the user may not use. */
const BRANCH_COOKIE = "pd_branch";
const write = (name: string, value: string | null) => {
  document.cookie = value ? `${name}=${value}; path=/; SameSite=Lax` : `${name}=; path=/; max-age=0`;
};
const writeCookie = (token: string | null) => write(COOKIE, token);

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
        writeCookie(session.token);
        set({ session, activeChildId: null });
      },
      refreshUser: (user) => set((s) => (s.session && s.session.user.id === user.id ? { session: { ...s.session, user } } : {})),
      signOut: () => {
        clearAllDrafts();
        writeCookie(null);
        write(BRANCH_COOKIE, null);
        set({ session: null, activeChildId: null, branchId: null });
      },
      setActiveChild: (activeChildId) => set({ activeChildId }),
      setBranch: (branchId) => {
        write(BRANCH_COOKIE, branchId);
        set({ branchId });
      },
    }),
    {
      // v2: tokens name the clinic account (demo.<clinicId>.<accountId>); a v1 token would only ever get 401s.
      name: "pedia-dental:session:v2",
      partialize: ({ session, activeChildId, branchId }) => ({ session, activeChildId, branchId }),
      // The cookie has no expiry, so the browser drops it on quit; storage brings it back.
      onRehydrateStorage: () => (state) => {
        if (state?.session) writeCookie(state.session.token);
        if (state?.branchId) write(BRANCH_COOKIE, state.branchId);
      },
    },
  ),
);
