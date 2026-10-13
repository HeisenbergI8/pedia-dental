import { HttpResponse } from "msw";
import type { z } from "zod";
import {
  DEFAULT_BRAND_COLOR,
  DUPLICATE_EMAIL_MESSAGE,
  amountDue,
  brandColorProblem,
  duplicateNameMessage,
  logoProblem,
  referenceImagesProblem,
  sameClinicName,
  suggestBrandColor,
  LOGO_RULES,
  type AgreementRecord,
  type BrandingInput,
  type Branch,
  type ClinicAccount,
  type Signup,
  type SignupInput,
  type SignupStatusView,
  type StaffMember,
} from "@pedia/shared";
import { deleteBlob, getBlob, putBlob } from "./blob-store";
import { emptyDb, persist, platform } from "./db";
import { newPin, temporaryPassword } from "./demo-accounts";
import { defaultMessageTemplates } from "./message-templates";
import { NOTE_TEMPLATES } from "./note-templates";
import { PROCEDURES } from "./seed";
import { firstNotice } from "./seed-privacy";
import { startSubscription } from "./subscriptions";

/*
 * Sign-ups and the clinics made from them (billing #10–#17). Platform-level, like the operator's handlers: this file
 * reads and writes `platform` only, never the per-request tenant binding or a clinic session. The source guard in
 * mocks/operator.test.ts reads this file too, so keep those names out of its comments.
 */

const refuse = (status: 400 | 404 | 409 | 413, message: string) => new HttpResponse(message, { status });
const shortId = () => crypto.randomUUID().replaceAll("-", "").slice(0, 12); // no dots: tokens are demo.<clinicId>.<accountId>

const CODE = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L: read aloud over the phone
const code = (n: number) => Array.from(crypto.getRandomValues(new Uint32Array(n)), (v) => CODE[v % CODE.length]).join("");

/** `PRM-7KQ2-M9XD`: what the client keeps to check on their sign-up (A1). Unique among sign-ups. */
function newReference(): string {
  for (;;) {
    const reference = `PRM-${code(4)}-${code(4)}`;
    if (!platform.signups.some((s) => s.reference === reference)) return reference;
  }
}

/** Stores an uploaded file under a fresh key and returns the key. */
export async function keepFile(prefix: string, file: Blob): Promise<string> {
  const key = `${prefix}_${crypto.randomUUID()}`;
  await putBlob(key, file);
  return key;
}

/** A sign-up's file as a response: never run (an SVG opened on its own), never sniffed. As GET /clinic/logo. */
export async function fileResponse(key: string): Promise<Response> {
  const blob = await getBlob(key);
  if (!blob) return refuse(404, "That file is no longer stored");
  return new HttpResponse(blob, {
    headers: { "Content-Type": blob.type, "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox", "X-Content-Type-Options": "nosniff" },
  });
}

/**
 * Billing #10, A11: the name or contact email is already a clinic's, or a sign-up's that is still waiting. `except` is
 * the sign-up being fixed or approved, which mustn't clash with itself. Undefined when both are free.
 */
export function duplicateOf(account: Pick<SignupInput["account"], "name" | "contactEmail">, except?: string): string | undefined {
  const waiting = platform.signups.filter((s) => s.status === "waiting" && s.id !== except).map((s) => s.account);
  const taken = [...platform.accounts, ...waiting];
  if (taken.some((a) => sameClinicName(a.name, account.name))) return duplicateNameMessage(account.name);
  const email = account.contactEmail.trim().toLowerCase();
  if (taken.some((a) => a.contactEmail.toLowerCase() === email)) return DUPLICATE_EMAIL_MESSAGE;
  return undefined;
}

/**
 * A multipart body from `signupFormData`: `data` parsed with `schema`, an optional `logo` (LOGO_RULES) and up to three
 * `reference` images. A refusal comes back as the Response to return.
 */
export async function readSignupForm<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<{ data: z.infer<T>; logo?: Blob; references: Blob[] } | Response> {
  const form = await request.formData().catch(() => undefined);
  if (!form) return refuse(400, "Send the form as multipart/form-data");
  let json: unknown;
  try {
    json = JSON.parse(String(form.get("data")));
  } catch {
    return refuse(400, "The form's data part isn't valid JSON");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
  const logoPart = form.get("logo");
  const logo = logoPart instanceof Blob ? logoPart : undefined;
  if (logo) {
    const problem = logoProblem(logo);
    if (problem) return refuse(logo.size > LOGO_RULES.maxBytes ? 413 : 400, problem);
  }
  const references = form.getAll("reference").filter((f): f is File => typeof f !== "string");
  const problem = referenceImagesProblem(references);
  if (problem) return refuse(400, problem);
  return { data: parsed.data, logo, references };
}

/** Use my own needs a passing colour (billing #19, as PUT /clinic/branding) and a logo (A6). */
export function brandingRefusal(branding: BrandingInput, hasLogo: boolean): Response | undefined {
  if (branding.choice !== "own") return undefined;
  const problem = brandColorProblem(branding.brandColor);
  if (problem) return refuse(400, `${problem} Try ${suggestBrandColor(branding.brandColor)}.`);
  if (!hasLogo) return refuse(400, "Add your logo, or choose Use the default look");
  return undefined;
}

/**
 * A new waiting sign-up, quoted from today's price list (A2). Pushed before its files are stored, so a double-click
 * sent while the first is still saving files meets the duplicate check instead of making a twin.
 */
export async function addSignup(input: SignupInput, files: { logo?: Blob; references: Blob[] }, source: Signup["source"], agreement: AgreementRecord): Promise<Signup> {
  const id = `signup_${shortId()}`;
  const signup: Signup = {
    // The four parts by name: the form's acceptance flag and the console's signed-on-file fields aren't stored as such.
    account: input.account,
    branch: input.branch,
    owner: input.owner,
    branding: input.branding,
    id,
    reference: newReference(),
    source,
    submittedAt: new Date().toISOString(),
    referenceRefs: [],
    quote: amountDue(platform.prices, input.account.tier, input.branding.choice),
    status: "waiting",
    agreement, // privacy #7, #8
  };
  platform.signups.push(signup);
  if (input.branding.choice === "own" && files.logo) signup.logoRef = await keepFile(`${id}_logo`, files.logo);
  if (input.branding.choice === "designed") signup.referenceRefs = await Promise.all(files.references.map((f) => keepFile(`${id}_ref`, f)));
  persist();
  return signup;
}

/** What the client sees about their own sign-up (A1): no Owner email, TIN, brief or file key. */
export const statusView = (s: Signup): SignupStatusView => ({
  reference: s.reference,
  clinicName: s.account.name,
  tier: s.account.tier,
  branding: s.branding.choice,
  quote: s.quote,
  status: s.status,
  paid: !!s.payment,
  rejectionReason: s.rejection?.reason ?? null,
});

/** The sign-up a clinic was made from; undefined for the two seeded clinics, which predate sign-ups. */
export const signupOfClinic = (clinicId: string) => platform.signups.find((s) => s.approval?.clinicId === clinicId);

/** Replaces a stored file, removing the old one. Seeded `demo/` logos are files in public/, never in the store. */
export async function replaceFile(old: string | undefined, prefix: string, file: Blob): Promise<string> {
  const key = await keepFile(prefix, file);
  if (old && !old.startsWith("demo/")) await deleteBlob(old);
  return key;
}

/**
 * Billing #15: the clinic as its sign-up describes it, already branded, with its first branch and its Owner on a
 * temporary password, shown once (decision #21). Use my own: the colour, the font and a copy of the logo (a copy, so
 * the Owner replacing it later never deletes the sign-up's file). The default look: Primolar's colour, no logo (#7).
 * Design it for me: the default look and "Design in progress" (#17). Marks the sign-up approved. The caller has
 * checked the payment and duplicates. Starts with one chair and the standard price list and templates, as chunk 21 did.
 */
export async function createClinic(signup: Signup): Promise<{ clinicId: string; temporaryPassword: string; pin: string }> {
  const key = shortId();
  const clinicId = `clinic_${key}`;
  const { account: details, branch: place, owner: person, branding } = signup;
  const account: ClinicAccount = { id: clinicId, ...details, status: "active", brandColor: DEFAULT_BRAND_COLOR };
  const branch: Branch = { clinicId, id: `branch_${key}`, ...place, archived: false };
  const owner: StaffMember = { clinicId, id: `staff_${key}`, fullName: person.fullName, email: person.email, role: person.role, isOwner: true, branchIds: [branch.id] };
  const password = temporaryPassword();
  const pin = newPin();
  // Synchronous from here to the push, so the name is never free twice; the logo copy follows.
  platform.accounts.push(account);
  platform.agreements.push({ clinicId, ...signup.agreement }); // privacy #7: carried to the clinic on approval
  platform.tenants[clinicId] = {
    ...emptyDb(),
    branches: [branch],
    staff: [owner],
    chairs: [{ id: `chair_${key}_1`, clinicId, branchId: branch.id, name: "Chair 1" }],
    procedures: PROCEDURES.map((p) => ({ ...p, clinicId })),
    noteTemplates: NOTE_TEMPLATES,
    messageTemplates: defaultMessageTemplates(clinicId, new Date().toISOString()),
    staffPins: [{ clinicId, staffId: owner.id, pin, failedAt: [] }],
    staffCredentials: [{ clinicId, staffId: owner.id, password, mustChange: true }],
    // Privacy #23: the acceptance on Get started (or the signed copy on file) is the clinic's first audited event.
    auditEvents: [
      {
        clinicId,
        id: crypto.randomUUID(),
        at: signup.agreement.at,
        actorId: owner.id,
        actorName: signup.agreement.acceptedBy,
        actorRole: owner.role,
        action: "create",
        record: "Terms and DPA (accepted)",
      },
    ],
    privacyNotices: [firstNotice(clinicId, account.name, owner.fullName, account.contactEmail)], // #19: from the template
  };
  signup.status = "approved";
  signup.approval = { clinicId, at: new Date().toISOString() };
  startSubscription(signup, clinicId); // billing #26: due monthly from today; the upfront payment is its first invoice
  if (branding.choice === "designed") signup.design = { status: "in_progress" };
  if (branding.choice === "own") {
    account.brandColor = branding.brandColor;
    if (branding.headingFont) account.headingFont = branding.headingFont;
    const logo = signup.logoRef ? await getBlob(signup.logoRef) : undefined;
    if (logo) account.logoRef = await keepFile(`logo_${clinicId}`, logo);
  }
  persist();
  return { clinicId, temporaryPassword: password, pin };
}
