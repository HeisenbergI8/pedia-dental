"use client";
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  AddStaffResult,
  Branch,
  Chair,
  ClinicAccount,
  ClinicContext,
  ClinicUsage,
  PrivacyNoticeView,
  Procedure,
  StaffMember,
  SubscriptionView,
  worksAt,
  type AddStaffInput,
  type BranchInput,
  type SavePrivacyNoticeInput,
  type UpdateBrandingInput,
  type UpdateClinicProfileInput,
} from "@pedia/shared";
import { api } from "@/lib/api-client";
import { useSessionStore } from "@/stores/session-store";

/** Reference data changes rarely, so it is cached for the whole session. */
const forever = { staleTime: Infinity } as const;

export const clinicKeys = {
  context: ["clinic"] as const,
  usage: ["clinic", "usage"] as const,
  subscription: ["clinic", "subscription"] as const,
  privacyNotice: ["clinic", "privacy-notice"] as const,
  branches: ["branches"] as const,
  staff: ["staff"] as const,
};

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

/** Every branch, archived ones too: an old receipt still names the branch it was paid at (decision #22). */
export function useBranches() {
  return useQuery({ queryKey: clinicKeys.branches, queryFn: () => api("/branches", z.array(Branch)), ...forever });
}

export function useStaff() {
  return useQuery({ queryKey: clinicKeys.staff, queryFn: () => api("/staff", z.array(StaffMember)), ...forever });
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

/** Seats and open branches against the tier. Owner only. Not cached forever: it changes with every add or archive. */
export function useClinicUsage() {
  return useQuery({ queryKey: clinicKeys.usage, queryFn: () => api("/clinic/usage", ClinicUsage) });
}

/**
 * Billing #31, S8: the Owner's Primolar bill. Pass `enabled: false` for anyone else, so the app never even asks
 * (the gate would answer 403). Refetched on focus, so a payment the operator records shows without a reload.
 */
export function useSubscription(enabled = true) {
  return useQuery({ queryKey: clinicKeys.subscription, queryFn: () => api("/clinic/subscription", SubscriptionView), enabled });
}

const json = (method: string, body: unknown) => ({ method, body: JSON.stringify(body) });

/**
 * The Owner's changes. Each refetches the clinic context (name, logo, colour, branches in the switcher), and whatever
 * list it touched. `["clinic"]` is a prefix, so usage refetches with it.
 */
function useOwnerMutation<I, O>(fn: (input: I) => Promise<O>, also: readonly (readonly string[])[] = []) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => [clinicKeys.context, ...also].forEach((queryKey) => qc.invalidateQueries({ queryKey })),
  });
}

export const useUpdateClinicProfile = () => useOwnerMutation((input: UpdateClinicProfileInput) => api("/clinic", ClinicAccount, json("PUT", input)));
export const useUpdateBranding = () => useOwnerMutation((input: UpdateBrandingInput) => api("/clinic/branding", ClinicAccount, json("PUT", input)));
export const useUploadLogo = () =>
  useOwnerMutation((file: File) => {
    const body = new FormData();
    body.set("file", file);
    return api("/clinic/logo", ClinicAccount, { method: "PUT", body });
  });
export const useRemoveLogo = () => useOwnerMutation(() => api("/clinic/logo", ClinicAccount, { method: "DELETE" }));

export const useSaveBranch = () =>
  useOwnerMutation(
    ({ id, ...input }: BranchInput & { id?: string }) => api(id ? `/branches/${id}` : "/branches", Branch, json(id ? "PUT" : "POST", input)),
    [clinicKeys.branches],
  );
export const useBranchArchive = () =>
  useOwnerMutation(({ id, archive }: { id: string; archive: boolean }) => api(`/branches/${id}/${archive ? "archive" : "reopen"}`, Branch, { method: "POST" }), [clinicKeys.branches]);

export const useAddStaff = () => useOwnerMutation((input: AddStaffInput) => api("/staff", AddStaffResult, json("POST", input)), [clinicKeys.staff]);
export const useStaffActive = () =>
  useOwnerMutation(({ id, active }: { id: string; active: boolean }) => api(`/staff/${id}/${active ? "reactivate" : "deactivate"}`, StaffMember, { method: "POST" }), [clinicKeys.staff]);

/** Privacy #19: the clinic's notice in force. Everyone signed in may read it (the consent dialog shows its version). */
export function usePrivacyNotice() {
  return useQuery({ queryKey: clinicKeys.privacyNotice, queryFn: () => api("/clinic/privacy-notice", PrivacyNoticeView) });
}
/** The Owner's save makes a new version. `["clinic"]` is a prefix, so the notice refetches with the context. */
export const useSavePrivacyNotice = () => useOwnerMutation((input: SavePrivacyNoticeInput) => api("/clinic/privacy-notice", PrivacyNoticeView, json("PUT", input)));
