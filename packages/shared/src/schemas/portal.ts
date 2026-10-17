import { z } from "zod";
import { ClinicScoped, Id, IsoDateTime } from "./common";
import { LoginId, NewPassword } from "./auth";

/** No row = not_invited. `off`: staff turned it off; they can invite again (B11 decision 18). */
export const PortalState = z.enum(["not_invited", "invited", "active", "off"]);
export type PortalState = z.infer<typeof PortalState>;

/** One guardian's portal access on GET /patients/:id/portal-access (decision 17). Staff with portal.manage only. */
export const PortalAccess = z.object({
  guardianId: Id,
  state: PortalState,
  invitedAt: IsoDateTime.optional(), // the latest invite
  inviteExpiresAt: IsoDateTime.optional(), // invited only: past it, the card says "Invite expired" and offers Resend
  activatedAt: IsoDateTime.optional(),
  turnedOffAt: IsoDateTime.optional(),
  /** Why Invite can't work now, in staff words ("Add a mobile number…", "0917 ••• 4567 already signs in as …"). */
  blocked: z.string().optional(),
});
export type PortalAccess = z.infer<typeof PortalAccess>;

/** The token from the link's fragment: 24 random bytes, base64url (32 characters). */
const Token = z.string().regex(/^[\w-]{32}$/, "This link isn't complete. Open it again from the text.");
export const PasswordLinkInput = z.object({ token: Token });
export type PasswordLinkInput = z.infer<typeof PasswordLinkInput>;

/** POST /auth/password-link: what a working link is for. Nothing about the family beyond the parent's own name. */
export const PasswordLink = z.object({
  purpose: z.enum(["invite", "reset"]),
  name: z.string(), // the guardian's full name
  clinicName: z.string(),
  login: z.string(), // maskedNumber: how they will sign in
});
export type PasswordLink = z.infer<typeof PasswordLink>;

export const SetPasswordInput = PasswordLinkInput.extend({ password: NewPassword });
export type SetPasswordInput = z.infer<typeof SetPasswordInput>;

/** POST /auth/password-reset (decision 19): the answer is the same whether or not an account exists. */
export const PasswordResetInput = z.object({ login: LoginId });
export type PasswordResetInput = z.infer<typeof PasswordResetInput>;

/**
 * The mock's stored record per guardian (E7), like StaffCredential: never served. `email` is the sign-in email chosen
 * when the account opened (the guardian's, when no other login has it; a seeded parent's demo address). The mobile
 * sign-in is read live from the guardian, so it follows a number change (decision 15). The prototype keeps the password
 * and the link tokens as typed (CONVENTIONS → deferrals); the API keeps an argon2id hash and only a token's SHA-256.
 */
export const PortalLinkRecord = z.object({
  token: z.string(),
  purpose: z.enum(["invite", "reset"]),
  createdAt: IsoDateTime,
  expiresAt: IsoDateTime,
  usedAt: IsoDateTime.optional(),
  cancelledAt: IsoDateTime.optional(),
});
export type PortalLinkRecord = z.infer<typeof PortalLinkRecord>;
export const PortalAccount = ClinicScoped.extend({
  guardianId: Id,
  state: PortalState.exclude(["not_invited"]),
  invitedAt: IsoDateTime.optional(),
  invitedBy: z.string().optional(),
  activatedAt: IsoDateTime.optional(),
  turnedOffAt: IsoDateTime.optional(),
  email: z.string().optional(),
  password: z.string().optional(), // none: a seeded parent, on the demo password (decision 13)
  links: z.array(PortalLinkRecord),
});
export type PortalAccount = z.infer<typeof PortalAccount>;

/** Prototype and demo deployments only (E6): the links the demo would have texted. Never served elsewhere. */
export const DemoTexts = z.object({
  texts: z.array(z.object({ name: z.string(), purpose: z.enum(["invite", "reset"]), link: z.string(), expiresAt: IsoDateTime })),
});
export type DemoTexts = z.infer<typeof DemoTexts>;
