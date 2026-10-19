import { http, passthrough } from "msw";
import { env } from "@/lib/env";
import { matchPath } from "./access";

export type ApiRoute = { method: string; path: string };

/**
 * The routes apps/api serves (CHUNKS.md: cut over chunk by chunk). In `hybrid` mode MSW lets these reach the network,
 * through the dev proxy to the API; every other route stays mocked. Same patterns as RULES in access.ts. Exact method
 * and path.
 */
export const API_ROUTES: readonly ApiRoute[] = [
  // B2: sign-in and sessions (AuthController). demo-accounts answers only with DEMO_LOGINS=true.
  { method: "GET", path: "/auth/demo-accounts" },
  { method: "POST", path: "/auth/login" },
  { method: "GET", path: "/auth/me" },
  { method: "POST", path: "/auth/logout" },
  { method: "POST", path: "/auth/switch" },
  { method: "POST", path: "/auth/password" },
  { method: "GET", path: "/auth/acknowledgement" },
  { method: "POST", path: "/auth/acknowledgement" },
  // B2: the operator's own sign-in (OperatorAuthController), on pd_operator.
  { method: "POST", path: "/operator/auth/login" },
  { method: "GET", path: "/operator/auth/me" },
  { method: "POST", path: "/operator/auth/logout" },
  // B2: the clinic reads (ClinicController).
  { method: "GET", path: "/clinic" },
  { method: "GET", path: "/branches" },
  { method: "GET", path: "/staff" },
  // B3: the Owner's settings (ClinicController): profile, look, logo, usage, branches and staff logins.
  { method: "PUT", path: "/clinic" },
  { method: "PUT", path: "/clinic/branding" },
  { method: "GET", path: "/clinic/logo" },
  { method: "PUT", path: "/clinic/logo" },
  { method: "DELETE", path: "/clinic/logo" },
  { method: "GET", path: "/clinic/usage" },
  { method: "POST", path: "/branches" },
  { method: "PUT", path: "/branches/:id" },
  { method: "POST", path: "/branches/:id/archive" },
  { method: "POST", path: "/branches/:id/reopen" },
  { method: "POST", path: "/staff" },
  { method: "POST", path: "/staff/:id/deactivate" },
  { method: "POST", path: "/staff/:id/reactivate" },
  // B3: the clinic's reference data (ClinicController, NotesController, MessagesController).
  { method: "GET", path: "/chairs" },
  { method: "GET", path: "/procedures" },
  { method: "GET", path: "/note-templates" },
  { method: "GET", path: "/message-templates" },
  { method: "PUT", path: "/message-templates/:kind" },
  // B4: patients and privacy consent (PatientsController, LegalController, ClinicController's notice).
  { method: "GET", path: "/patients" },
  { method: "GET", path: "/patient-summaries" },
  { method: "GET", path: "/patient-duplicates" },
  { method: "POST", path: "/patients" },
  { method: "GET", path: "/patients/:id" },
  { method: "PUT", path: "/patients/:id" },
  { method: "PATCH", path: "/patients/:id" },
  { method: "GET", path: "/patients/:id/summary" },
  { method: "POST", path: "/patients/:id/consents" },
  { method: "POST", path: "/patients/:id/privacy-consent" },
  { method: "POST", path: "/patients/:id/privacy-choices" },
  { method: "PUT", path: "/patients/:id/photo" },
  { method: "GET", path: "/patients/:id/photo" },
  { method: "DELETE", path: "/patients/:id/photo" },
  { method: "GET", path: "/clinic/privacy-notice" },
  { method: "PUT", path: "/clinic/privacy-notice" },
  { method: "GET", path: "/legal/notices/:clinicId" },
  // B5: visits and the dental chart (VisitsController, ChartController).
  { method: "GET", path: "/patients/:id/visits" },
  { method: "POST", path: "/patients/:id/visits" },
  { method: "POST", path: "/visits/:id/complete" },
  { method: "GET", path: "/patients/:id/chart" },
  { method: "POST", path: "/patients/:id/chart" },
  { method: "POST", path: "/patients/:id/chart/batch" },
  // B6: notes, growth and the treatment plan (NotesController, GrowthController, PlanController). Documents are the
  // API's too since B10.
  { method: "GET", path: "/patients/:id/notes" },
  { method: "POST", path: "/patients/:id/notes" },
  { method: "PUT", path: "/notes/:id" },
  { method: "POST", path: "/notes/:id/sign" },
  { method: "GET", path: "/patients/:id/growth" },
  { method: "PUT", path: "/visits/:id/growth" },
  { method: "GET", path: "/patients/:id/plan" },
  { method: "POST", path: "/patients/:id/plan" },
  { method: "PATCH", path: "/plan-items/:id" },
  // B7: the schedule, parents' requests, follow-ups and Today (AppointmentsController, RecallsController,
  // ReportsController). The texts they cause are the API's too since B9.
  { method: "GET", path: "/appointments" },
  { method: "GET", path: "/patients/:id/appointments" },
  { method: "POST", path: "/appointments" },
  { method: "PUT", path: "/appointments/:id" },
  { method: "POST", path: "/appointments/:id/status" },
  { method: "GET", path: "/appointment-requests" },
  { method: "GET", path: "/patients/:id/appointment-requests" },
  { method: "POST", path: "/patients/:id/appointment-requests" },
  { method: "POST", path: "/appointment-requests/:id/handled" },
  { method: "GET", path: "/due-items" },
  { method: "GET", path: "/reports/today" },
  // B8: bills, payments, deposits, credit, voids, the day's collections and the financial dashboard (BillingController,
  // CollectionsController, ReportsController). Receipts are logged by the API's documents since B10.
  { method: "GET", path: "/patients/:id/invoices" },
  { method: "POST", path: "/patients/:id/invoices" },
  { method: "POST", path: "/invoices/:id/void" },
  { method: "GET", path: "/patients/:id/payments" },
  { method: "GET", path: "/payments" },
  { method: "POST", path: "/invoices/:id/payments" },
  { method: "POST", path: "/patients/:id/deposits" },
  { method: "POST", path: "/invoices/:id/apply-credit" },
  { method: "GET", path: "/reports/finance" },
  // B9: the message log, the due list's recall text and the birthday greeting (MessagesController). Texts are queued
  // by the API's bookings, notes and privacy choices, and sent by its worker (log driver until a key is set).
  { method: "GET", path: "/messages" },
  { method: "POST", path: "/due-items/:id/message" },
  { method: "POST", path: "/patients/:id/birthday-greeting" },
  // B10: clinical photos and parents' documents (PhotosController), the issued-documents log (DocumentsController), and
  // the local storage driver's 5-minute file links (LocalFilesController: API-only, public, signed). A file read
  // answers a 302 to a link; a new tab opening /api/files/<token> must reach the API, not MSW's gate.
  { method: "GET", path: "/patients/:id/photos" },
  { method: "POST", path: "/patients/:id/photos" },
  { method: "GET", path: "/photos/:id/file" },
  { method: "GET", path: "/documents" },
  { method: "GET", path: "/patients/:id/documents" },
  { method: "POST", path: "/patients/:id/documents" },
  { method: "GET", path: "/files/:token" },
  // B11: parents' portal accounts (PortalAccessController, PasswordLinksController). Invite and reset texts are queued
  // by the API and sent by its worker; on a demo deployment (DEMO_LOGINS) /auth/demo-texts lists their links.
  { method: "GET", path: "/patients/:id/portal-access" },
  { method: "POST", path: "/patients/:id/guardians/:guardianId/portal-invite" },
  { method: "POST", path: "/patients/:id/guardians/:guardianId/portal-off" },
  { method: "POST", path: "/auth/password-link" },
  { method: "POST", path: "/auth/password-link/accept" },
  { method: "POST", path: "/auth/password-reset" },
  { method: "GET", path: "/auth/demo-texts" },
  // B12: Primolar's console, sign-ups, prices, the payment QR, subscriptions and receipts (OperatorModule,
  // SignupsModule, PlatformSettingsModule, ClinicBillingModule). Every operator route and every public sign-up route.
  { method: "GET", path: "/operator/accounts" },
  { method: "POST", path: "/operator/accounts" },
  { method: "PUT", path: "/operator/accounts/:id/tier" },
  { method: "POST", path: "/operator/accounts/:id/suspend" },
  { method: "POST", path: "/operator/accounts/:id/reactivate" },
  { method: "GET", path: "/operator/accounts/:id/staff" },
  { method: "POST", path: "/operator/accounts/:id/owner" },
  { method: "PUT", path: "/operator/accounts/:id/branding" },
  { method: "GET", path: "/operator/accounts/:id/subscription" },
  { method: "POST", path: "/operator/accounts/:id/subscription/payments" },
  { method: "POST", path: "/operator/accounts/:id/subscription/cancel" },
  { method: "GET", path: "/operator/signups" },
  { method: "GET", path: "/operator/signups/:id/files/:key" },
  { method: "PUT", path: "/operator/signups/:id" },
  { method: "POST", path: "/operator/signups/:id/payment" },
  { method: "POST", path: "/operator/signups/:id/reject" },
  { method: "POST", path: "/operator/signups/:id/approve" },
  { method: "GET", path: "/operator/prices" },
  { method: "PUT", path: "/operator/prices" },
  { method: "GET", path: "/operator/payment-qr" },
  { method: "PUT", path: "/operator/payment-qr" },
  { method: "GET", path: "/operator/receipts" },
  { method: "GET", path: "/operator/receipts/:id/image" },
  { method: "POST", path: "/operator/receipts/:id/confirm" },
  { method: "POST", path: "/operator/receipts/:id/reject" },
  { method: "GET", path: "/signups/prices" },
  { method: "POST", path: "/signups" },
  { method: "GET", path: "/signups/:reference" },
  { method: "GET", path: "/signups/payment-qr/image" },
  { method: "POST", path: "/signups/:reference/receipts" },
  { method: "GET", path: "/clinic/subscription" },
  { method: "POST", path: "/clinic/subscription/receipts" },
  { method: "GET", path: "/clinic/subscription/receipts/:id/image" },
  // B13c2a: the copy of records and the audit-log reader (RecordsCopyModule, AuditLogModule).
  { method: "POST", path: "/patients/:id/exports" },
  { method: "GET", path: "/audit-log" },
];

export const servedBy = (routes: readonly ApiRoute[], method: string, path: string) =>
  routes.some((r) => r.method === method && matchPath(r.path, path) !== undefined);

/** Registered before the access gate in hybrid mode only (mocks/browser.ts). Returns nothing for a mocked route. */
export const apiPassthrough = (routes: readonly ApiRoute[] = API_ROUTES) =>
  http.all(`${env.apiUrl}/*`, ({ request }) => {
    const u = new URL(request.url);
    const path = u.pathname.slice(new URL(env.apiUrl, u.origin).pathname.length);
    return servedBy(routes, request.method, path) ? passthrough() : undefined;
  });
