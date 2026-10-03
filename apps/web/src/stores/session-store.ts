"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Session } from "@pedia/shared";

/** Read by the mock API (mocks/access.ts). NestJS will set its own httpOnly cookie instead (Q4). */
const COOKIE = "pd_session";
const writeCookie = (token: string | null) => {
  document.cookie = token ? `${COOKIE}=${token}; path=/; SameSite=Lax` : `${COOKIE}=; path=/; max-age=0`;
};

type SessionState = {
  session: Session | null;
  /** The portal's selected child, kept across refreshes. */
  activeChildId: string | null;
  signIn: (session: Session) => void;
  signOut: () => void;
  setActiveChild: (id: string) => void;
};

/** Who is signed in (demo login). Persisted, so a refresh keeps the session. Replaces role-store.ts. */
export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      session: null,
      activeChildId: null,
      signIn: (session) => {
        writeCookie(session.token);
        set({ session, activeChildId: null });
      },
      signOut: () => {
        writeCookie(null);
        set({ session: null, activeChildId: null });
      },
      setActiveChild: (activeChildId) => set({ activeChildId }),
    }),
    {
      name: "pedia-dental:session:v1",
      partialize: ({ session, activeChildId }) => ({ session, activeChildId }),
      // The cookie has no expiry, so the browser drops it on quit; storage brings it back.
      onRehydrateStorage: () => (state) => {
        if (state?.session) writeCookie(state.session.token);
      },
    },
  ),
);
