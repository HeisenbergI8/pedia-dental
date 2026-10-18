import { expect as baseExpect, test, type Page, type Response } from "@playwright/test";
import { USERS, signIn } from "./support/users";

/**
 * B10: photos and documents against apps/api in `hybrid`. Skipped unless E2E_API=1. Start-up (B10 plan Step 9.2), fresh database:
 *   CREATE DATABASE pedia_dental_e2e_b10; then in apps/api: DATABASE_URL=… pnpm db:deploy && DEMO_LOGINS=true STORAGE_DIR=var/e2e-b10 pnpm db:seed
 *   DATABASE_URL=… PORT=4150 DEMO_LOGINS=true COOKIE_SECURE=false STORAGE_DIR=var/e2e-b10 STORAGE_LINK_SECRET=<32+ chars> pnpm dev:api
 *   NEXT_DIST_DIR=.next-hybrid NEXT_PUBLIC_API_MOCKING=disabled API_PROXY_TARGET=http://localhost:4150 pnpm exec next dev --port 3190
 * Local-disk driver (no S3_BUCKET): links are /api/files/<token> through Next's proxy. Re-runnable on one database: each
 * run registers its own children. 6 sign-ins a run.
 */
test.skip(!process.env.E2E_API, "Needs apps/api and a hybrid web server: E2E_API=1 E2E_BASE_URL=…");
test.describe.configure({ mode: "serial", timeout: 180_000 });
const expect = baseExpect.configure({ timeout: 20_000 });

const RUN = Date.now().toString(36);
const [PIC, NOPIC] = ["Pic", "NoPic"].map((n) => `${n}${RUN}`);
const ids: Record<string, string> = {};
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 200 200]/Parent 2 0 R>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");

/** Answered by apps/api: Nest stamps `x-request-id`. MSW's passthrough also reports fromServiceWorker(), so not that. */
const fromApi = async (response: Response) => !!(await response.allHeaders())["x-request-id"];
const loads = (page: Page, path: RegExp, method = "GET") =>
  page.waitForResponse((r) => path.test(new URL(r.url()).pathname) && r.request().method() === method);
async function viaApi(page: Page, path: RegExp, method: string, status: number, act: () => Promise<unknown>) {
  const [res] = await Promise.all([loads(page, path, method), act()]);
  expect([res.status(), await fromApi(res)]).toEqual([status, true]);
  return res;
}
const FILE_LINK = /^\/api\/files\/[\w-]+$/;

async function signInAs(page: Page, email: string) {
  await page.context().clearCookies();
  await signIn(page, email);
  await expect(page.getByRole("button", { name: /Account menu/ }).first()).toBeVisible({ timeout: 45_000 });
}
async function register(page: Page, firstName: string, photos = true) {
  const guardian = { id: `g_${firstName}`, fullName: `Rosa ${firstName}`, relationship: "Mother", phone: "09171234567", isPrimary: true };
  const res = await page.request.post("/api/patients", {
    data: {
      firstName, lastName: "Foto", birthDate: "2019-03-14", sex: "female", address: "", guardians: [guardian],
      emergencyContact: { name: "", phone: "" }, allergies: [], medicalConditions: [], medications: [], alerts: [],
      dentalHistory: { previousClinic: "", notes: "" }, privacyConsent: { guardianId: guardian.id, photos, reminders: true, confirmed: true },
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  ids[firstName] = ((await res.json()) as { id: string }).id;
}
async function openPhotos(page: Page, patientId: string) {
  await viaApi(page, /^\/api\/patients\/[^/]+\/photos$/, "GET", 200, () => page.goto(`/patients/${patientId}?tab=photos`));
}
/** The upload dialog, through the hidden "Choose file" input. */
async function addPhoto(page: Page, file: { name: string; mimeType: string; buffer: Buffer }, type?: string) {
  await page.getByRole("button", { name: "Add photo" }).click();
  const dialog = page.getByRole("dialog", { name: "Add photo" });
  if (type) {
    await dialog.getByLabel("Type").click();
    await page.getByRole("option", { name: type }).click();
  }
  await dialog.locator('input[type="file"]:not([capture])').setInputFiles(file);
  return dialog;
}

test("the seeded photos open through a 302 to a 5-minute link, through Next's proxy and on the page", async ({ page }) => {
  await signInAs(page, USERS.admin);
  const seeded = (await (await page.request.get("/api/documents")).json()) as { id: string; patientId: string }[];
  const child = seeded.find((d) => d.id.startsWith("doc_seed_"))!.patientId;
  // Through Next's /api proxy without the service worker: the API's 302 reaches the browser, and its link serves the bytes.
  const first = await page.request.get("/api/photos/photo_seed_1/file", { maxRedirects: 0 });
  const location = first.headers()["location"] ?? "";
  expect([first.status(), !!first.headers()["x-request-id"], first.headers()["cache-control"]]).toEqual([302, true, "no-store"]);
  expect(location).toMatch(FILE_LINK);
  const file = await page.request.get(location);
  expect([file.status(), file.headers()["content-type"], file.headers()["content-security-policy"]]).toEqual([200, "image/png", "sandbox"]);
  // On the page, MSW's passthrough follows the 302 inside the service worker: the <img> gets the picture.
  const [img] = await Promise.all([loads(page, /^\/api\/photos\/photo_seed_1\/file$/), openPhotos(page, child)]);
  expect([img.status(), img.headers()["content-type"]]).toEqual([200, "image/png"]);
  await expect.poll(() => page.locator('img[src$="/photos/photo_seed_1/file"]').first().evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(1);
});

test("the admin uploads a photo and a referral PDF; the PDF opens in a tab and downloads with its name", async ({ page, context }) => {
  await signInAs(page, USERS.admin);
  await register(page, PIC);
  await openPhotos(page, ids[PIC]!);
  const dialog = await addPhoto(page, { name: "smile.png", mimeType: "image/png", buffer: PNG });
  await viaApi(page, /^\/api\/patients\/[^/]+\/photos$/, "POST", 201, () => dialog.getByRole("button", { name: "Save photo" }).click());
  await expect(page.getByRole("region", { name: /Notifications/ }).getByText("Photo saved")).toBeVisible();

  const pdfDialog = await addPhoto(page, { name: "referral.pdf", mimeType: "application/pdf", buffer: PDF }, "Referral document");
  await viaApi(page, /^\/api\/patients\/[^/]+\/photos$/, "POST", 201, () => pdfDialog.getByRole("button", { name: "Save photo" }).click());
  const [tab] = await Promise.all([context.waitForEvent("page"), page.getByRole("link", { name: "Open" }).first().click()]);
  await tab.waitForLoadState();
  expect(new URL(tab.url()).pathname).toMatch(FILE_LINK); // passed MSW's gate (the /files/:token passthrough)
  await tab.close();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download" }).first().click()]);
  expect(download.suggestedFilename()).toMatch(/-referral-\d{4}-\d{2}-\d{2}\.pdf$/);
});

test("a family that declined photos gets the mock's words, and a text file the API's", async ({ page }) => {
  await signInAs(page, USERS.admin);
  await register(page, NOPIC, false);
  await openPhotos(page, ids[NOPIC]!);
  const dialog = await addPhoto(page, { name: "smile.png", mimeType: "image/png", buffer: PNG });
  await viaApi(page, /^\/api\/patients\/[^/]+\/photos$/, "POST", 409, () => dialog.getByRole("button", { name: "Save photo" }).click());
  await expect(page.getByText(`${NOPIC}'s family declined clinical photos.`, { exact: false }).first()).toBeVisible();
  const text = await page.request.post(`/api/patients/${ids[PIC]}/photos`, {
    multipart: { meta: JSON.stringify({ type: "intraoral", takenOn: "2026-10-02", caption: "" }), file: { name: "x.txt", mimeType: "text/plain", buffer: Buffer.from("hello") } },
  });
  expect([text.status(), await text.text(), !!text.headers()["x-request-id"]]).toEqual([400, "Attach an image file", true]);
});

test("a parent uploads a medical document from the portal and sees only parent uploads", async ({ page }) => {
  await signIn(page, USERS.parent);
  const notice = page.getByRole("button", { name: "I've read this" });
  const portal = page.getByRole("group", { name: "Whose records to show" });
  await expect(notice.or(portal).first()).toBeVisible({ timeout: 45_000 });
  if (await notice.isVisible()) await notice.click();
  const mine = (await (await page.request.get("/api/patients")).json()) as { id: string }[]; // a parent's own children only
  const child = mine[0]?.id;
  expect(child).toBeTruthy();
  const res = await page.request.post(`/api/patients/${child}/photos`, {
    multipart: { meta: JSON.stringify({ type: "document", takenOn: "2026-10-02", caption: `Clearance ${RUN}` }), file: { name: "c.pdf", mimeType: "application/pdf", buffer: PDF } },
  });
  expect([res.status(), ((await res.json()) as { uploadedBy: string }).uploadedBy]).toEqual([201, "parent"]);
  const list = (await (await page.request.get(`/api/patients/${child}/photos`)).json()) as { uploadedBy: string; caption: string }[];
  expect(list.every((p) => p.uploadedBy === "parent") && list.some((p) => p.caption === `Clearance ${RUN}`)).toBe(true);
});

test("front desk's issued document lists on the documents page; an allergic prescription is refused", async ({ page }) => {
  await signInAs(page, USERS.frontdesk);
  const issued = await page.request.post(`/api/patients/${ids[PIC]}/documents`, { data: { type: "notes_report", issuedBy: "staff_cruz" } });
  expect(issued.status()).toBe(201);
  await viaApi(page, /^\/api\/documents$/, "GET", 200, () => page.goto("/documents"));
  await expect(page.getByRole("row").filter({ hasText: "Clinical notes report" }).filter({ hasText: PIC }).first()).toBeVisible();
  await signInAs(page, USERS.admin);
  const p = (await (await page.request.get(`/api/patients/${ids[PIC]}`)).json()) as Record<string, unknown>;
  expect((await page.request.put(`/api/patients/${ids[PIC]}`, { data: { ...p, allergies: ["Penicillin"], noKnownAllergies: false } })).status()).toBe(200);
  const rx = await page.request.post(`/api/patients/${ids[PIC]}/documents`, {
    data: { type: "prescription", issuedBy: "staff_reyes", items: [{ drugId: "amoxicillin_250_susp", sig: "Give 5 mL every 8 hours.", quantity: "1 bottle" }] },
  });
  expect([rx.status(), await rx.text()]).toEqual([409, `${PIC} is allergic to Amoxicillin (recorded: Penicillin)`]);
});

test("another clinic can't open a Bulilit photo", async ({ page }) => {
  await signInAs(page, USERS.ngitiOwner);
  const res = await page.request.get("/api/photos/photo_seed_1/file", { maxRedirects: 0 });
  expect([res.status(), await res.text(), !!res.headers()["x-request-id"]]).toEqual([404, "Photo not found", true]);
});
