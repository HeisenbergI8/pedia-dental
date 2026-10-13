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
  isActiveStaff,
  unbilledItems,
  type Invoice,
  type Payment,
} from "@pedia/shared";
import { env } from "@/lib/env";
import { activeBranch, reportBranches } from "@/mocks/access";
import { currentClinicId, db, persist } from "@/mocks/db";

const url = (p: string) => `${env.apiUrl}${p}`;
/** New money is received by someone who works here now; old records keep a deactivated name (decision #23). */
const isActiveStaffId = (id: string) => db.staff.some((s) => s.id === id && isActiveStaff(s));
const byReceived = (a: Payment, b: Payment) => a.receivedAt.localeCompare(b.receivedAt);
/** AR for money received, CR for a deposit applied to an invoice. Counted per prefix, so neither sequence skips. */
const nextNo = (prefix: "AR" | "CR") =>
  `${prefix}-${String(db.payments.filter((p) => p.receiptNo.startsWith(prefix)).length + 1).padStart(6, "0")}`;

/**
 * Where moving `amount` of deposit onto (+) or off (−) this invoice lands on the deposit side, per branch, so each
 * branch's "deposits held" stays true. Drawing takes the invoice's own branch's deposits first, then the others';
 * returning puts money back on the branches it was drawn from for this invoice. Rows are [branchId, signed amount].
 */
function depositSide(invoice: Invoice, amount: number): [string, number][] {
  const mine = db.payments.filter((p) => p.patientId === invoice.patientId && !p.invoiceId);
  const sumBy = (rows: Payment[]) => rows.reduce((m, p) => m.set(p.branchId, (m.get(p.branchId) ?? 0) + p.amount), new Map<string, number>());
  // Drawing: what each branch holds. Returning: what each branch gave this invoice (drawn rows are negative).
  const pool = amount > 0 ? sumBy(mine) : new Map([...sumBy(mine.filter((p) => p.appliedTo === invoice.id))].map(([b, n]) => [b, -n]));
  const order = [invoice.branchId, ...[...pool.keys()].filter((b) => b !== invoice.branchId)];
  const rows: [string, number][] = [];
  let left = Math.abs(amount);
  for (const b of order) {
    const take = Math.min(left, Math.max(0, pool.get(b) ?? 0));
    if (take > 0) rows.push([b, amount > 0 ? -take : take]);
    left -= take;
  }
  return rows;
}

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

    // The branch of the visit it bills; billed without an appointment, the branch this device is on.
    const branchId = db.appointments.find((a) => a.id === appointmentId)?.branchId ?? activeBranch(request).id;
    const invoice: Invoice = { id: crypto.randomUUID(), clinicId: currentClinicId(), branchId, patientId: String(params.id), appointmentId, lines, discount, issuedAt: new Date().toISOString() };
    db.invoices.push(invoice);
    persist();
    return HttpResponse.json(invoice, { status: 201 });
  }),

  http.get(url("/patients/:id/payments"), async ({ params }) => {
    await delay(100);
    return HttpResponse.json(db.payments.filter((p) => p.patientId === params.id).sort(byReceived));
  }),

  // The daily collection list: payments and refunds received on ?date=YYYY-MM-DD (local day), at the device's branch
  // or the ?branch= one (reportBranches, decision #20).
  http.get(url("/payments"), async ({ request }) => {
    await delay(100);
    const date = new URL(request.url).searchParams.get("date") ?? format(new Date(), "yyyy-MM-dd");
    const branches = reportBranches(request);
    if (branches instanceof Response) return branches;
    const rows = db.payments.filter((p) => branches.includes(p.branchId) && format(new Date(p.receivedAt), "yyyy-MM-dd") === date);
    return HttpResponse.json(rows.sort(byReceived));
  }),

  http.post(url("/invoices/:id/payments"), async ({ params, request }) => {
    const invoice = db.invoices.find((i) => i.id === params.id);
    if (!invoice) return new HttpResponse("Invoice not found", { status: 404 });
    const parsed = RecordPaymentInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    if (!isActiveStaffId(parsed.data.receivedBy)) return new HttpResponse("Choose someone who works here now", { status: 400 });

    const balance = invoiceBalance(invoice, db.payments);
    // Real money on this invoice: an applied deposit goes back through apply-credit, not as a cash refund.
    const paid = invoiceTotal(invoice) - balance - appliedCredit(invoice.id, db.payments);
    if (parsed.data.amount > balance) return new HttpResponse(`That's more than the ${formatPeso(balance)} balance`, { status: 409 });
    if (-parsed.data.amount > paid) return new HttpResponse(`A refund can't be more than the ${formatPeso(paid)} paid`, { status: 409 });

    const payment: Payment = {
      ...parsed.data,
      id: crypto.randomUUID(),
      clinicId: currentClinicId(),
      branchId: invoice.branchId, // the money is the invoice's branch's, wherever it is paid
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
    if (!isActiveStaffId(parsed.data.receivedBy)) return new HttpResponse("Choose someone who works here now", { status: 400 });
    const held = depositBalance(db.payments, patientId);
    if (-parsed.data.amount > held) return new HttpResponse(`A refund can't be more than the ${formatPeso(held)} deposit`, { status: 409 });
    const branchId = activeBranch(request).id; // handed over at this branch
    const payment: Payment = { ...parsed.data, id: crypto.randomUUID(), clinicId: currentClinicId(), branchId, patientId, receiptNo: nextNo("AR"), receivedAt: new Date().toISOString() };
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
    if (!isActiveStaffId(parsed.data.receivedBy)) return new HttpResponse("Choose someone who works here now", { status: 400 });
    const { amount, receivedBy } = parsed.data;
    const held = depositBalance(db.payments, invoice.patientId);
    const balance = invoiceBalance(invoice, db.payments);
    if (amount > held) return new HttpResponse(`Only ${formatPeso(held)} is on deposit`, { status: 409 });
    if (amount > balance) return new HttpResponse(`That's more than the ${formatPeso(balance)} balance`, { status: 409 });
    if (-amount > appliedCredit(invoice.id, db.payments)) return new HttpResponse("That's more than was applied from the deposit", { status: 409 });
    const base = { clinicId: currentClinicId(), patientId: invoice.patientId, method: "account_credit" as const, receivedBy, receiptNo: nextNo("CR"), receivedAt: new Date().toISOString() };
    // The invoice side is the invoice's branch's money. The deposit side comes off the branches that hold it.
    const onInvoice: Payment = { ...base, branchId: invoice.branchId, id: crypto.randomUUID(), invoiceId: invoice.id, amount, note: amount > 0 ? "Paid from deposit" : "Returned to deposit" };
    const onDeposit = depositSide(invoice, amount).map(([branchId, share]): Payment => ({ ...base, branchId, id: crypto.randomUUID(), appliedTo: invoice.id, amount: share }));
    db.payments.push(onInvoice, ...onDeposit);
    persist();
    return HttpResponse.json(onInvoice, { status: 201 });
  }),
];
