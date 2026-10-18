// apps/web/src/features/operator/mocks.ts (242) + signup-mocks.ts (114): the console's contract. Platform only.

// overviewOf(clinicId): strict AccountOverview — counts only (decision #25): branches, staffLogins, patients;
// design status from the sign-up; look; privacy agreement + patientsWithoutConsent.
// NOTE: B12 adds usage.storage and usage.texts (decision 17). The API builds all clinics at once (UsageService).

// Routes and statuses the API copies (Step 7.2):
//   GET /operator/accounts 200 | POST /operator/accounts 201 CreateAccountResult (multipart, same checks as sign-up)
//   PUT :id/tier 200 (409 refusal) | GET :id/subscription 200 | POST :id/subscription/payments 201 | POST …/cancel 200
//   POST :id/suspend|reactivate 200 (reactivate 409 when lapsed/ended) | GET :id/staff 200 | POST :id/owner 200 (400)
//   PUT :id/branding 200 (409 unless Design it for me; 400 colour / "Add the finished logo")
//   GET /operator/signups 200 | GET …/files/:key | PUT :id 200 | POST :id/payment 200 | :id/reject 200 | :id/approve 201
//   GET|PUT /operator/prices 200
// IMPORTANT: notFound = 404 "Clinic account not found" / "Sign-up not found"; ids matched against lists only.
// IMPORTANT: PAID_PLAN_LOCKED — a paid sign-up can't change plan or look (re-quote).
// NOTE: PUT /operator/prices replaces platform.prices outright; decision 11 adds the PriceChange history (E4).
