"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { OperatorSession } from "@pedia/shared";

/** Read by the mock API (operatorOf in mocks/access.ts). Never `pd_session`: the operator isn't a clinic user. */
const COOKIE = "pd_operator";
const writeCookie = (token: string | null) => {
  document.cookie = token ? `${COOKIE}=${token}; path=/; SameSite=Lax` : `${COOKIE}=; path=/; max-age=0`;
};

type OperatorState = { session: OperatorSession | null; signIn: (s: OperatorSession) => void; signOut: () => void };

/** The Primolar operator's console session, apart from any clinic session in the same browser (decision #25). */
export const useOperatorSessionStore = create<OperatorState>()(
  persist(
    (set) => ({
      session: null,
      signIn: (session) => {
        writeCookie(session.token);
        set({ session });
      },
      signOut: () => {
        writeCookie(null);
        set({ session: null });
      },
    }),
    {
      name: "primolar:operator-session:v1",
      // The cookie has no expiry, so the browser drops it on quit; storage brings it back (as session-store.ts).
      onRehydrateStorage: () => (state) => {
        if (state?.session) writeCookie(state.session.token);
      },
    },
  ),
);
