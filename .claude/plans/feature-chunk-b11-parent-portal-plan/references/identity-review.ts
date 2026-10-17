// apps/api/src/auth/identity.service.ts: owns Credential and DemoLogin.
// forSession (85-116): staff deactivated or suspended → undefined; parents read-only when suspended; children per request.
// loginsByEmail (166-184): cross-clinic lookup by email, sorted by clinic name for the chooser.
// changePassword (230-235): argon2id; AuthService.changePassword (auth.service.ts:230) refuses non-staff with 401.
// IMPORTANT: Credential.email is required today; B11 makes it nullable and adds phone with @@unique([clinicId, phone]).
// access-rules.ts: CLINIC_RULES mirror the mock; clinicRefusal (196-203). record-owners.ts: lookups registered by
// AppointmentsService (/appointments/:id/status) and PhotosService (/photos/:id/file), the only parent-reachable ones.
