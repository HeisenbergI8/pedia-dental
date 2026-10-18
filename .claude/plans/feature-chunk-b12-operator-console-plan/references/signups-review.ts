// apps/web/src/mocks/signups.ts (223 lines): the sign-up spec. Platform-only (guarded by mocks/operator.test.ts).

// The duplicate rule the API ports under the platform lock (E6): accounts + WAITING sign-ups, name by sameClinicName,
// email lowercase. `except` = the sign-up being fixed or approved.
export function duplicateOf(account, except?) {
  const waiting = platform.signups.filter((s) => s.status === "waiting" && s.id !== except).map((s) => s.account);
  const taken = [...platform.accounts, ...waiting];
  if (taken.some((a) => sameClinicName(a.name, account.name))) return duplicateNameMessage(account.name);
  // ...email → DUPLICATE_EMAIL_MESSAGE
}
// IMPORTANT: the mock pushes the sign-up BEFORE storing files so a double-click meets the duplicate check. The API
// stores files first (slow work before the transaction) and relies on the platform lock instead (Step 6.2).

// readSignupForm: multipart `data` JSON + optional `logo` (LOGO_RULES, 413 when too big) + up to 3 `reference`.
// IMPORTANT: the API's readUpload takes one `file` part only → Step 5.2's readUploads.

// statusView: strict, no Owner email / TIN / brief / file key (A1). B12 adds `receipt` and `paymentQr` (Step 1.3).

// createClinic(signup): account, agreement, tenant (branch, Owner staff, one chair, PROCEDURES, NOTE_TEMPLATES,
// defaultMessageTemplates, PIN + temporary password with mustChange, the "Terms and DPA (accepted)" audit event,
// firstNotice), signup approved, startSubscription, design in_progress, then the logo COPY (after the push).
// NOTE: the logo copy happening last is why the API copies it after commit (E7).
