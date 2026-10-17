// apps/web/src/features/auth/mocks.ts: the sign-in spec.
// POST /auth/login (47-80): password first, then suspension (parents of a paused clinic still sign in), then the chooser.
const matches = accountsByEmail(platform, email); // B11: accountsByLogin
// 401 "That email and password don't match a demo account"
// POST /auth/password (101-119): staff only today.
if (!session?.staffId) return new HttpResponse("Sign in with your staff login to change its password", { status: 401 });
// IMPORTANT: B11 decision 7 opens it to parents (Step 3.2); seeded logins keep the demo password (403).
