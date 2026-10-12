"use client";
import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Chair, ClinicContext, Procedure, StaffMember, worksAt } from "@pedia/shared";
import { api } from "@/lib/api-client";
import { useSessionStore } from "@/stores/session-store";

/** Reference data changes rarely, so it is cached for the whole session. */
const forever = { staleTime: Infinity } as const;

export const clinicKeys = { context: ["clinic"] as const };

/**
 * The signed-in clinic account, the branches this user may work at, and the one this device is on. Replaces the
 * CLINIC_NAME / CLINIC_HOURS constants: the name and hours on every screen come from here.
 */
export function useClinic() {
  return useQuery({ queryKey: clinicKeys.context, queryFn: () => api("/clinic", ClinicContext), ...forever });
}

/** The branch this device is on (its hours drive the calendar and booking). Undefined while loading. */
export function useActiveBranch() {
  const { data } = useClinic();
  return data?.branches.find((b) => b.id === data.activeBranchId);
}

export function useStaff() {
  return useQuery({ queryKey: ["staff"], queryFn: () => api("/staff", z.array(StaffMember)), ...forever });
}

/** The staff who work at the active branch (the Owner works at all): who can be booked here or take money here. */
export function useBranchStaff(): StaffMember[] {
  const staff = useStaff().data;
  const branch = useActiveBranch();
  return useMemo(() => (branch ? (staff ?? []).filter((s) => worksAt(s, branch)) : []), [staff, branch]);
}

export function useChairs() {
  return useQuery({ queryKey: ["chairs"], queryFn: () => api("/chairs", z.array(Chair)), ...forever });
}

/**
 * The chairs at the active branch: what the calendar and booking offer. `useChairs` stays account-wide, so a chair
 * name in a child's history still resolves whichever branch the device is on.
 */
export function useBranchChairs() {
  const chairs = useChairs();
  const branchId = useActiveBranch()?.id;
  const data = useMemo(() => (branchId ? chairs.data?.filter((c) => c.branchId === branchId) : undefined), [chairs.data, branchId]);
  return { data, isLoading: chairs.isLoading || !branchId, error: chairs.error };
}

export function useProcedures() {
  return useQuery({ queryKey: ["procedures"], queryFn: () => api("/procedures", z.array(Procedure)), ...forever });
}

/**
 * Moves this device to another of the user's branches. Every query refetches, so the calendar, today and
 * collections all show the new branch. Account-wide data (patients, charts) refetches too: simple, and only
 * on a deliberate switch.
 */
export function useSwitchBranch() {
  const qc = useQueryClient();
  const setBranch = useSessionStore((s) => s.setBranch);
  return (branchId: string) => {
    setBranch(branchId); // cookie first, so the refetches carry it
    void qc.invalidateQueries();
  };
}
