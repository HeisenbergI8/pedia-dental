"use client";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Chair, Procedure, StaffMember } from "@pedia/shared";
import { api } from "@/lib/api-client";

/** Reference data changes rarely, so it is cached for the whole session. */
const forever = { staleTime: Infinity } as const;

export function useStaff() {
  return useQuery({ queryKey: ["staff"], queryFn: () => api("/staff", z.array(StaffMember)), ...forever });
}

export function useChairs() {
  return useQuery({ queryKey: ["chairs"], queryFn: () => api("/chairs", z.array(Chair)), ...forever });
}

export function useProcedures() {
  return useQuery({ queryKey: ["procedures"], queryFn: () => api("/procedures", z.array(Procedure)), ...forever });
}
