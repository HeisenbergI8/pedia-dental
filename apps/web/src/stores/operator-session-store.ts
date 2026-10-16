"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { OperatorSession } from "@pedia/shared";
import { env } from "@/lib/env";
import { operatorSessionWrites, writeCookie } from "@/lib/session-cookies";

/** pd_operator in `enabled`, the pd_mock_operator bridge in `hybrid`, nothing in `disabled`. Never `pd_session`. */
const writeSession = (session: OperatorSession | null) => {
  for (const [name, value] of operatorSessionWrites(env.apiMockingMode, session)) writeCookie(name, value);
};

type OperatorState = { session: OperatorSession | null; signIn: (s: OperatorSession) => void; signOut: () => void };

/** The Primolar operator's console session, apart from any clinic session in the same browser (decision #25). */
export const useOperatorSessionStore = create<OperatorState>()(
  persist(
    (set) => ({
      session: null,
      signIn: (session) => {
        writeSession(session);
        set({ session });
      },
      signOut: () => {
        writeSession(null);
        set({ session: null });
      },
    }),
    {
      name: "primolar:operator-session:v1",
      // The cookie has no expiry, so the browser drops it on quit; storage brings it back (as session-store.ts).
      onRehydrateStorage: () => (state) => {
        if (state?.session) writeSession(state.session);
      },
    },
  ),
);
