// apps/web/src/mocks/access.ts: the mock gate. RULES is the route map the API's access-rules.test.ts mirrors.
// refusal (341-350): `all` passes; `own` needs an owner; "filtered" passes; otherwise patientIds must hold the id.
//   → 403 "This isn't one of your children's records"
// NOTE: /auth/* skips the gate (handlers self-check). B11 adds three portal.manage RULES and widens ACCESS_RULES'
// exported fields for the ownership sweep (Steps 3.1, 3.3).
