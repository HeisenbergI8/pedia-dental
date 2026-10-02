"use client";
import { create } from "zustand";
import type { Role } from "@pedia/shared";

/** Prototype-only: lets the demo switch roles. Replaced by real auth later. */
export const useRole = create<{ role: Role; setRole: (r: Role) => void }>((set) => ({
  role: "dentist",
  setRole: (role) => set({ role }),
}));
