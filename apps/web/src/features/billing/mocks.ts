import { http, HttpResponse, delay } from "msw";
import { format } from "date-fns";
import {
  ApplyCreditInput,
  CreateInvoiceInput,
  RecordPaymentInput,
  appliedCredit,
  depositBalance,
  formatPeso,
  invoiceBalance,
  invoiceTotal,
  unbilledItems,
  type Invoice,
  type Payment,
} from "@pedia/shared";
import { env } from "@/lib/env";
import { db, persist } from "@/mocks/db";
import { CLINIC_ID } from "@/mocks/seed";

const url = (p: string) => `${env.apiUrl}${p}`;
const byReceived = (a: Payment, b: Payment) => a.receivedAt.localeCompare(b.receivedAt);
/** AR for money received, CR for a deposit applied to an invoice. Counted per prefix, so neither sequence skips. */
const nextNo = (prefix: "AR" | "CR") =>
  `${prefix}-${String(db.payments.filter((p) => p.receiptNo.startsWith(prefix)).length + 1).padStart(6, "0")}`;

/** API contract for apps/api's BillingController. Balances are computed from payments, never stored. */
export const billingHandlers = [
  http.get(url("/patients/:id/invoices"), async ({ params }) => {
    await delay(100);
    const rows = db.invoices.filter((i) => i.patientId === params.id).sort((a, b) => a.issuedAt.localeCompare(b.issuedAt));
    return HttpResponse.json(rows);
  }),

  http.post(url("/patients/:id/invoices"), async ({ params, request }) => {
    if (!db.patients.some((p) => p.id === params.id)) return new HttpResponse("Patient not found", { status: 404 });
    const parsed = CreateInvoiceInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    const { planItemIds, discount } = parsed.data;
    if (new Set(planItemIds).size !== planItemIds.length) return new HttpResponse("A treatment is listed twice", { status: 400 });

    const billable = unbilledItems(db.planItems.filter((i) => i.patientId === params.id), db.invoices);
    const items = billable.filter((i) => planItemIds.includes(i.id));
    if (items.length !== planItemIds.length) {
      return new HttpResponse("Only this patient's completed, not yet billed treatments can be invoiced", { status: 409 });
    }
    // Names and fees are copied at invoicing, so a later catalog change doesn't rewrite an issued invoice.
    const lines = items.map((i) => ({
      planItemId: i.id,
      procedureCode: i.procedureCode,
      description: db.procedures.find((p) => p.code === i.procedureCode)?.name ?? i.procedureCode,
      tooth: i.tooth,
      amount: i.fee,
    }));
    const subtotal = lines.reduce((s, l) => s + l.amount, 0);
    if (discount > subtotal) return new HttpResponse(`The discount can't be more than ${formatPeso(subtotal)}`, { status: 400 });
    // The appointment these treatments were done in, when they all share one: links "unpaid appointments".
    const fromAppointments = new Set(items.map((i) => db.visits.find((v) => v.id === i.completedVisitId)?.appointmentId));
    const appointmentId = fromAppointments.size === 1 ? [...fromAppointments][0] : undefined;

    const invoice: Invoice = { id: crypto.randomUUID(), clinicId: CLINIC_ID, patientId: String(params.id), appointmentId, lines, discount, issuedAt: new Date().toISOString() };
    db.invoices.push(invoice);
    persist();
    return HttpResponse.json(invoice, { status: 201 });
  }),

  http.get(url("/patients/:id/payments"), async ({ params }) => {
    await delay(100);
    return HttpResponse.json(db.payments.filter((p) => p.patientId === params.id).sort(byReceived));
  }),

  // The daily collection list: payments and refunds received on ?date=YYYY-MM-DD (clinic local day).
  http.get(url("/payments"), async ({ request }) => {
    await delay(100);
    const date = new URL(request.url).searchParams.get("date") ?? format(new Date(), "yyyy-MM-dd");
    const rows = db.payments.filter((p) => format(new Date(p.receivedAt), "yyyy-MM-dd") === date);
    return HttpResponse.json(rows.sort(byReceived));
  }),

  http.post(url("/invoices/:id/payments"), async ({ params, request }) => {
    const invoice = db.invoices.find((i) => i.id === params.id);
    if (!invoice) return new HttpResponse("Invoice not found", { status: 404 });
    const parsed = RecordPaymentInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    if (!db.staff.some((s) => s.id === parsed.data.receivedBy)) return new HttpResponse("Unknown staff member", { status: 400 });

    const balance = invoiceBalance(invoice, db.payments);
    // Real money on this invoice: an applied deposit goes back through apply-credit, not as a cash refund.
    const paid = invoiceTotal(invoice) - balance - appliedCredit(invoice.id, db.payments);
    if (parsed.data.amount > balance) return new HttpResponse(`That's more than the ${formatPeso(balance)} balance`, { status: 409 });
    if (-parsed.data.amount > paid) return new HttpResponse(`A refund can't be more than the ${formatPeso(paid)} paid`, { status: 409 });

    const payment: Payment = {
      ...parsed.data,
      id: crypto.randomUUID(),
      clinicId: CLINIC_ID,
      patientId: invoice.patientId,
      invoiceId: invoice.id,
      receiptNo: nextNo("AR"), // payments are append-only, so this never repeats
      receivedAt: new Date().toISOString(),
    };
    db.payments.push(payment);
    persist();
    return HttpResponse.json(payment, { status: 201 });
  }),

  // Money taken before treatment is billed (+), or a deposit refund (−). Applied to invoices later.
  http.post(url("/patients/:id/deposits"), async ({ params, request }) => {
    const patientId = String(params.id);
    if (!db.patients.some((p) => p.id === patientId)) return new HttpResponse("Patient not found", { status: 404 });
    const parsed = RecordPaymentInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    if (!db.staff.some((s) => s.id === parsed.data.receivedBy)) return new HttpResponse("Unknown staff member", { status: 400 });
    const held = depositBalance(db.payments, patientId);
    if (-parsed.data.amount > held) return new HttpResponse(`A refund can't be more than the ${formatPeso(held)} deposit`, { status: 409 });
    const payment: Payment = { ...parsed.data, id: crypto.randomUUID(), clinicId: CLINIC_ID, patientId, receiptNo: nextNo("AR"), receivedAt: new Date().toISOString() };
    db.payments.push(payment);
    persist();
    return HttpResponse.json(payment, { status: 201 });
  }),

  // Moves deposit money onto this invoice (+) or back (−) as a pair of rows; returns the invoice-side row.
  http.post(url("/invoices/:id/apply-credit"), async ({ params, request }) => {
    const invoice = db.invoices.find((i) => i.id === params.id);
    if (!invoice) return new HttpResponse("Invoice not found", { status: 404 });
    const parsed = ApplyCreditInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    if (!db.staff.some((s) => s.id === parsed.data.receivedBy)) return new HttpResponse("Unknown staff member", { status: 400 });
    const { amount, receivedBy } = parsed.data;
    const held = depositBalance(db.payments, invoice.patientId);
    const balance = invoiceBalance(invoice, db.payments);
    if (amount > held) return new HttpResponse(`Only ${formatPeso(held)} is on deposit`, { status: 409 });
    if (amount > balance) return new HttpResponse(`That's more than the ${formatPeso(balance)} balance`, { status: 409 });
    if (-amount > appliedCredit(invoice.id, db.payments)) return new HttpResponse("That's more than was applied from the deposit", { status: 409 });
    const base = { clinicId: CLINIC_ID, patientId: invoice.patientId, method: "account_credit" as const, receivedBy, receiptNo: nextNo("CR"), receivedAt: new Date().toISOString() };
    const onInvoice: Payment = { ...base, id: crypto.randomUUID(), invoiceId: invoice.id, amount, note: amount > 0 ? "Paid from deposit" : "Returned to deposit" };
    const onDeposit: Payment = { ...base, id: crypto.randomUUID(), appliedTo: invoice.id, amount: -amount };
    db.payments.push(onInvoice, onDeposit);
    persist();
    return HttpResponse.json(onInvoice, { status: 201 });
  }),
];
