import { http, HttpResponse, delay } from "msw";
import { format } from "date-fns";
import {
  CreateInvoiceInput,
  RecordPaymentInput,
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

    const invoice: Invoice = { id: crypto.randomUUID(), clinicId: CLINIC_ID, patientId: String(params.id), lines, discount, issuedAt: new Date().toISOString() };
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
    const paid = invoiceTotal(invoice) - balance;
    if (parsed.data.amount > balance) return new HttpResponse(`That's more than the ${formatPeso(balance)} balance`, { status: 409 });
    if (-parsed.data.amount > paid) return new HttpResponse(`A refund can't be more than the ${formatPeso(paid)} paid`, { status: 409 });

    const payment: Payment = {
      ...parsed.data,
      id: crypto.randomUUID(),
      clinicId: CLINIC_ID,
      patientId: invoice.patientId,
      invoiceId: invoice.id,
      receiptNo: `AR-${String(db.payments.length + 1).padStart(6, "0")}`, // payments are append-only, so this never repeats
      receivedAt: new Date().toISOString(),
    };
    db.payments.push(payment);
    persist();
    return HttpResponse.json(payment, { status: 201 });
  }),
];
