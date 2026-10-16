import { ClinicAccount, StaffMember, StaffRole, brandColorProblem, isStaffRole, rolesCan, suggestBrandColor, type Role } from "@pedia/shared";
import { z } from "zod";

type AccountRow = Omit<ClinicAccount, "logoRef" | "headingFont"> & { logoRef: string | null; headingFont: ClinicAccount["headingFont"] | null };

/** ClinicAccount as the mock serves it: unset optionals are absent, never null. */
export const toClinicAccount = ({ logoRef, headingFont, ...rest }: AccountRow): ClinicAccount =>
  ClinicAccount.parse({ ...rest, ...(logoRef ? { logoRef } : {}), ...(headingFont ? { headingFont } : {}) });

/** The mock's logoUrlOf: seeded logos are the web's static files (public/demo); uploads are GET /clinic/logo (B3), keyed so caches never go stale. */
export const logoUrlOf = (logoRef: string | undefined): string | null =>
  !logoRef ? null : /^demo\//.test(logoRef) ? `/${logoRef}` : `/api/clinic/logo?v=${encodeURIComponent(logoRef)}`;

type StaffRow = {
  id: string; clinicId: string; fullName: string; role: StaffRole; alsoRoles: unknown; isOwner: boolean;
  branchIds: unknown; licenseNo: string | null; email: string; deactivatedAt: Date | null;
};

/**
 * One GET /staff row for this viewer (the mock's rule, decision #23): the sign-in email to the Owner (clinic.manage)
 * only, who was deactivated to staff only. Parents get names, roles and licences.
 */
export function toStaffMember(row: StaffRow, viewer: readonly Role[]): StaffMember {
  const alsoRoles = StaffRole.array().parse(row.alsoRoles);
  return StaffMember.parse({
    id: row.id,
    clinicId: row.clinicId,
    fullName: row.fullName,
    role: row.role,
    ...(alsoRoles.length ? { alsoRoles } : {}),
    ...(row.isOwner ? { isOwner: true } : {}),
    branchIds: z.array(z.string()).parse(row.branchIds),
    ...(row.licenseNo ? { licenseNo: row.licenseNo } : {}),
    ...(rolesCan(viewer, "clinic.manage") ? { email: row.email } : {}),
    ...(isStaffRole(viewer[0]!) && row.deactivatedAt ? { deactivatedAt: row.deactivatedAt.toISOString() } : {}),
  });
}

/** PUT /clinic/branding's 400, word for word the mock's: the problem, then the nearest colour that passes (decision #29). */
export function brandingRefusal(brandColor: string): string | undefined {
  const problem = brandColorProblem(brandColor);
  return problem && `${problem} Try ${suggestBrandColor(brandColor)}.`;
}
