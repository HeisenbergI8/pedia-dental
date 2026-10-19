import "../../src/clinic-time"; // first: the booking slots are Manila times, as the API reads them
import autocannon from "autocannon";
import { Branch, Chair, Procedure, StaffMember, worksAt, PatientPage, type BookAppointmentInput } from "@pedia/shared";
import { z } from "zod";
import { DEMO_PASSWORD } from "@pedia/seed";
import { PROFILE, TARGETS, bookingSlots, misses, type Measured, type Target } from "./targets";

/**
 * `pnpm --filter api load:run` (B13c1 E9, E10): signs in as the front desk and the Owner, runs every target in TARGETS
 * with autocannon, prints a table and exits 1 when one misses. LOAD_BASE_URL (default http://localhost:4100) picks the
 * API; LOAD_RECORD_ONLY=1 prints without failing (the deployed demo's smoke run). Two sign-ins per run.
 */
const BASE = process.env.LOAD_BASE_URL ?? "http://localhost:4100";
const RECORD_ONLY = process.env.LOAD_RECORD_ONLY === "1";
const LOGINS = { frontdesk: "frontdesk@gmail.com", owner: "owner@gmail.com" } as const;

async function signIn(email: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: DEMO_PASSWORD }) });
  if (!res.ok) throw new Error(`Sign-in as ${email}: ${res.status} ${await res.text()}`);
  const session = res.headers.getSetCookie().find((c) => c.startsWith("pd_session="));
  if (!session) throw new Error(`Sign-in as ${email}: no pd_session cookie`);
  return session.split(";")[0]!;
}

async function get<T>(cookie: string, path: string, schema: z.ZodType<T>): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { cookie } });
  if (!res.ok) throw new Error(`GET ${path}: ${res.status} ${await res.text()}`);
  return schema.parse(await res.json());
}

const cookies = { frontdesk: await signIn(LOGINS.frontdesk), owner: await signIn(LOGINS.owner) };
const fd = cookies.frontdesk;

// The booking's inputs, from the API as the front desk sees them (its device branch: Imus).
const branches = await get(fd, "/api/branches", z.array(Branch));
const imus = branches.find((b) => b.name === "Imus") ?? branches[0]!;
const chairs = (await get(fd, "/api/chairs", z.array(Chair))).filter((c) => c.branchId === imus.id);
const dentists = (await get(fd, "/api/staff", z.array(StaffMember))).filter((s) => (s.role === "dentist" || s.alsoRoles?.includes("dentist")) && worksAt(s, imus));
const patientIds = (await get(fd, "/api/patient-summaries?page=1&pageSize=100", PatientPage)).rows.map((r) => r.id);
const procedure = (await get(fd, "/api/procedures", z.array(Procedure)))[0]!;
// Far ahead, and different per run, so neither the seed's appointments nor an earlier run's are in the way.
const from = new Date(Date.now() + (400 + (Date.now() % 1000)) * 86_400_000);
const slots = bookingSlots(imus.openingHours, dentists.map((d) => d.id), chairs.map((c) => c.id), from);
let patient = 0;
const nextBooking = (): BookAppointmentInput => {
  const slot = slots.next().value!;
  return { ...slot, patientId: patientIds[patient++ % patientIds.length]!, durationMin: 30, reason: procedure.name, procedureCode: procedure.code };
};

async function measure(t: Target, durationS: number): Promise<autocannon.Result> {
  const headers = { cookie: cookies[t.login], "content-type": "application/json" };
  const requests = t.method === "POST"
    ? [{ method: t.method, path: t.path, setupRequest: (req: autocannon.Request) => ({ ...req, body: JSON.stringify(nextBooking()) }) }]
    : [{ method: t.method, path: t.path }];
  return autocannon({ url: BASE, connections: PROFILE.connections, duration: durationS, headers, requests });
}

const rows: { t: Target; m: Measured; p50: number; missed: string[] }[] = [];
for (const t of TARGETS) {
  await measure(t, PROFILE.warmupS); // not scored
  const r = await measure(t, PROFILE.durationS);
  const m: Measured = { requests: r.requests.total, p97_5: r.latency.p97_5, p99: r.latency.p99, rps: r.requests.average, non2xx: r.non2xx, errors: r.errors + r.timeouts };
  rows.push({ t, m, p50: r.latency.p50, missed: misses(t, m) });
}

console.log(`Load test against ${BASE}: ${PROFILE.connections} connections, ${PROFILE.durationS} s per target after ${PROFILE.warmupS} s warm-up\n`);
console.log("| Target | Requests | req/s | p50 ms | p97.5 ms | p99 ms | non-2xx | Result |");
console.log("| --- | --- | --- | --- | --- | --- | --- | --- |");
for (const { t, m, p50, missed } of rows) {
  console.log(`| ${t.name} | ${m.requests} | ${m.rps.toFixed(1)} | ${p50} | ${m.p97_5} | ${m.p99} | ${m.non2xx} | ${missed.length ? `MISSED: ${missed.join("; ")}` : "OK"} |`);
}
const failed = rows.filter((r) => r.missed.length).length;
if (failed && !RECORD_ONLY) {
  console.error(`\n${failed} target(s) missed.`);
  process.exit(1);
}
