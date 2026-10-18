import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupServer } from "msw/node";
import { z } from "zod";
import { CreateAccountResult, PaymentQrView, RECEIPT_PENDING, ReceiptToCheck, SignupStatusView, SubscriptionView } from "@pedia/shared";
import { SEED_FILES } from "@pedia/seed";
import { ApiError, api } from "@/lib/api-client";
import { env } from "@/lib/env";
import { platform } from "./db";
import { handlers } from "./handlers";

// B12: Primolar's payment QR and the receipts clinics send (decisions 5–8, 21–24). The cases share one seeded db in order.
const server = setupServer(...handlers);
const OPERATOR = "operator.operator_primolar";
const NGITI_OWNER = "demo.clinic_ngiti.ngiti_staff_lim";
const IPIN_OWNER = "demo.clinic_ipin.ipin_staff_santiago";
const BULILIT_DESK = "demo.clinic_demo.staff_cruz";
const cookies = (...c: string[]) => vi.stubGlobal("document", { cookie: c.join("; ") });
const asOperator = () => cookies(`pd_operator=${OPERATOR}`);
const asStaff = (token: string) => cookies(`pd_session=${token}`);
const send = (method: string, body?: unknown) => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const status = (p: Promise<unknown>) => p.then(() => 200, (e: ApiError) => e.status);
const message = (p: Promise<unknown>) => p.then(() => "", (e: ApiError) => e.message);

const png = (bytes = 0) => new File([SEED_FILES["image/png"].slice(), new Uint8Array(bytes)], "receipt.png", { type: "image/png" });
const form = (data: unknown, file?: File) => {
  const body = new FormData();
  body.append("data", JSON.stringify(data));
  if (file) body.append("file", file);
  return { method: "POST", body };
};
const put = (data: unknown, file?: File) => ({ ...form(data, file), method: "PUT" });
const toCheck = () => api("/operator/receipts", z.array(ReceiptToCheck));
const ownerReceipt = (file: File = png(), reference = "GC 1111") => api("/clinic/subscription/receipts", SubscriptionView, form({ reference }, file));
const confirm = (id: string) => api(`/operator/receipts/${id}/confirm`, ReceiptToCheck, send("POST", { method: "gcash", paidOn: "2026-10-18" }));

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterAll(() => {
  server.close();
  vi.unstubAllGlobals();
});

describe("the payment QR (decisions 5, 23)", () => {
  it("needs an image first, then keeps it when only the caption changes", async () => {
    cookies();
    expect(await message(api("/signups/payment-qr/image", z.unknown()))).toBe("Primolar hasn't added payment details yet");
    asOperator();
    expect(await api("/operator/payment-qr", PaymentQrView.nullable())).toBeNull();
    expect(await message(api("/operator/payment-qr", PaymentQrView, put({ caption: "GCash" })))).toBe("Add the QR image");
    expect((await api("/operator/payment-qr", PaymentQrView, put({ caption: "GCash · Primolar" }, png()))).caption).toBe("GCash · Primolar");
    const fileRef = platform.paymentQr!.fileRef;
    expect((await api("/operator/payment-qr", PaymentQrView, put({ caption: "" }))).caption).toBeNull();
    expect(platform.paymentQr!.fileRef).toBe(fileRef);
    cookies();
    const image = await fetch(`${env.apiUrl}/signups/payment-qr/image`);
    expect([image.status, image.headers.get("content-type")]).toEqual([200, "image/png"]);
  });
});

describe("the Owner's receipt (decisions 6, 21, 24)", () => {
  it("is taken once at a time, for the first unpaid month, only from the Owner, as a real image", async () => {
    asStaff(NGITI_OWNER);
    const view = await ownerReceipt();
    expect(view.receipts[0]).toMatchObject({ status: "pending", reference: "GC 1111", amountDue: view.nextAmount, periodStart: view.nextDue });
    expect(view.paymentQr).not.toBeNull();
    expect(await message(ownerReceipt())).toBe(RECEIPT_PENDING);
    expect(await status(ownerReceipt(new File(["x"], "r.gif", { type: "image/gif" })))).toBe(400);
    expect(await status(ownerReceipt(png(6 * 1024 * 1024)))).toBe(413);
    asStaff(BULILIT_DESK);
    expect(await status(ownerReceipt())).toBe(403);
  });

  it("shows its image to its own Owner and the operator only", async () => {
    const id = platform.receipts.find((r) => r.payer.kind === "subscription" && r.payer.clinicId === "clinic_ngiti")!.id;
    asStaff(IPIN_OWNER);
    expect(await status(api(`/clinic/subscription/receipts/${id}/image`, z.unknown()))).toBe(404);
  });
});

describe("Payments to check (decisions 8, 22)", () => {
  it("lists pending receipts oldest first; confirming Ipin's pays its month and takes it off the list", async () => {
    asOperator();
    const list = await toCheck();
    expect(list.map((r) => r.payer.kind === "subscription" && r.payer.clinicName)).toEqual(["Ipin Kids Dental", "Ngiti Kids Dental"]);
    const paidBefore = platform.subscriptions.find((s) => s.clinicId === "clinic_ipin")!.paidMonths;
    expect((await confirm(list[0]!.id)).status).toBe("confirmed");
    expect(platform.subscriptions.find((s) => s.clinicId === "clinic_ipin")!.paidMonths).toBe(paidBefore + 1);
    expect((await toCheck()).map((r) => r.id)).not.toContain(list[0]!.id);
    expect(await message(confirm(list[0]!.id))).toBe("This receipt has already been checked");
  });

  it("refuses a receipt whose month was then paid by hand, and lets the Owner send a new one after a rejection", async () => {
    asOperator();
    const [ngiti] = await toCheck();
    await api("/operator/accounts/clinic_ngiti/subscription/payments", SubscriptionView, send("POST", { method: "cash", paidOn: "2026-10-18" }));
    expect(await message(confirm(ngiti!.id))).toBe("This month is already paid. Reject the receipt if it was sent twice.");
    expect((await api(`/operator/receipts/${ngiti!.id}/reject`, ReceiptToCheck, send("POST", { reason: "Paid in cash at the office" }))).status).toBe("rejected");
    asStaff(NGITI_OWNER);
    const view = await api("/clinic/subscription", SubscriptionView);
    expect(view.receipts[0]).toMatchObject({ status: "rejected", rejectionReason: "Paid in cash at the office" });
    expect((await ownerReceipt(png(), "GC 2222")).receipts[0]).toMatchObject({ status: "pending", reference: "GC 2222" });
  });
});

describe("a sign-up's receipt (decision 7)", () => {
  it("is sent from the status page, confirmed, and then the sign-up can be approved", async () => {
    cookies();
    const reference = platform.signups.find((s) => s.id === "signup_hagikgik")!.reference;
    const sent = await api(`/signups/${reference}/receipts`, SignupStatusView, form({ reference: "BPI 77" }, png()));
    expect(sent).toMatchObject({ paid: false, receipt: { status: "pending", amountDue: sent.quote.total } });
    expect(await status(api("/signups/PRM-NONE-NONE/receipts", SignupStatusView, form({ reference: "x" }, png())))).toBe(404);
    asOperator();
    const receipt = (await toCheck()).find((r) => r.payer.kind === "signup")!;
    expect(receipt.payer).toMatchObject({ kind: "signup", signupReference: reference });
    await confirm(receipt.id);
    cookies();
    expect((await api(`/signups/${reference}`, SignupStatusView)).paid).toBe(true);
    asOperator();
    expect((await api("/operator/signups/signup_hagikgik/approve", CreateAccountResult, send("POST"))).overview.account.name).toBe(sent.clinicName);
  });
});
