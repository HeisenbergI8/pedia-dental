import { http, HttpResponse, delay } from "msw";
import { format } from "date-fns";
import {
  ApplyCreditInput,
  CreateInvoiceInput,
  RecordPaymentInput,
  VoidInvoiceInput,
  appliedCredit,
  depositBalance,
  depositLegs,
  depositPool,
  formatPeso,
  invoiceBalance,
  invoiceTotal,
  isActiveStaff,
  isVoided,
  liveInvoices,
  receiptNo,
  rolesCan,
  unbilledItems,
  type Invoice,
  type Payment,
} from "@pedia/shared";
import { env } from "@/lib/env";
import { activeBranch, reportBranches, sessionOf } from "@/mocks/access";
import { currentClinicId, db, persist } from "@/mocks/db";
import { idempotencyKey, once } from "@/mocks/idempotency";

const url = (p: string) => `${env.apiUrl}${p}`;
/** New money is received by someone who works here now; old records keep a deactivated name (decision #23). */
const isActiveStaffId = (id: string) => db.staff.some((s) => s.id === id && isActiveStaff(s));
const byReceived = (a: Payment, b: Payment) => a.receivedAt.localeCompare(b.receivedAt);
/**
 * AR for money received, CR for a deposit applied to a bill (decision 1). Counts distinct numbers: one credit
 * application writes two or more rows under one CR number, so counting rows skipped numbers (B8 E3).
 */
const nextNo = (series: "AR" | "CR") =>
  receiptNo(series, new Set(db.payments.filter((p) => p.receiptNo.startsWith(`${series}-`)).map((p) => p.receiptNo)).size + 1);
/** Decision 3: a refund (a negative amount) is the Owner's or an admin's. Checked after the body, before the money. */
const refundRefused = (request: Request, amount: number) =>
  amount < 0 && !rolesCan(sessionOf(request)!.roles, "billing.adjust")
    ? new HttpResponse("Only the Owner or an admin can record a refund", { status: 403 })
    : undefined;
const voided = () => new HttpResponse("This bill was voided", { status: 409 });
/** What makes two requests "the same" for a key: the route, its record, who asks and what they send (B8 E2). */
const fingerprint = (request: Request, route: string, id: string, body: unknown) => ({ route, id, by: sessionOf(request)!.id, body });

/** API contract for apps/api's BillingController. Balances are computed from payments, never stored. */
export const billingHandlers = [
  http.get(url("/patients/:id/invoices"), async ({ params, request }) => {
    await delay(100);
    const rows = db.invoices.filter((i) => i.patientId === params.id).sort((a, b) => a.issuedAt.localeCompare(b.issuedAt));
    // Staff see voided bills; a parent (billing.view only for their own children) doesn't (B8 question 3).
    return HttpResponse.json(rolesCan(sessionOf(request)!.roles, "billing.view", "all") ? rows : liveInvoices(rows));
  }),

  http.post(url("/patients/:id/invoices"), async ({ params, request }) => {
    const key = idempotencyKey(request);
    if (key instanceof Response) return key;
    if (!db.patients.some((p) => p.id === params.id)) return new HttpResponse("Patient not found", { status: 404 });
    const parsed = CreateInvoiceInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    const { planItemIds, discount } = parsed.data;
    if (new Set(planItemIds).size !== planItemIds.length) return new HttpResponse("A treatment is listed twice", { status: 400 });
    return once(key, fingerprint(request, "POST /patients/:id/invoices", String(params.id), parsed.data), () => {
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
    });
  }),

  // Decision 2: a bill made by mistake, voided with a reason while nothing was ever paid or applied on it. It stays on
  // record; its treatments are billable again; it counts in no balance or total. No key: a repeat is a 409 (E9).
  http.post(url("/invoices/:id/void"), async ({ params, request }) => {
    const invoice = db.invoices.find((i) => i.id === params.id);
    if (!invoice) return new HttpResponse("Invoice not found", { status: 404 });
    const parsed = VoidInvoiceInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    if (isVoided(invoice)) return new HttpResponse("This bill is already voided", { status: 409 });
    if (db.payments.some((p) => p.invoiceId === invoice.id)) {
      return new HttpResponse("Only a bill with nothing paid or applied on it can be voided", { status: 409 });
    }
    invoice.voided = { at: new Date().toISOString(), by: sessionOf(request)!.staffId!, reason: parsed.data.reason };
    persist();
    return HttpResponse.json(invoice);
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
    const key = idempotencyKey(request);
    if (key instanceof Response) return key;
    const invoice = db.invoices.find((i) => i.id === params.id);
    if (!invoice) return new HttpResponse("Invoice not found", { status: 404 });
    const parsed = RecordPaymentInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    const refused = refundRefused(request, parsed.data.amount);
    if (refused) return refused;
    if (!isActiveStaffId(parsed.data.receivedBy)) return new HttpResponse("Choose someone who works here now", { status: 400 });
    return once(key, fingerprint(request, "POST /invoices/:id/payments", invoice.id, parsed.data), () => {
      if (isVoided(invoice)) return voided();
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
    });
  }),

  // Money taken before treatment is billed (+), or a deposit refund (−). Applied to invoices later.
  http.post(url("/patients/:id/deposits"), async ({ params, request }) => {
    const key = idempotencyKey(request);
    if (key instanceof Response) return key;
    const patientId = String(params.id);
    if (!db.patients.some((p) => p.id === patientId)) return new HttpResponse("Patient not found", { status: 404 });
    const parsed = RecordPaymentInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    const refused = refundRefused(request, parsed.data.amount);
    if (refused) return refused;
    if (!isActiveStaffId(parsed.data.receivedBy)) return new HttpResponse("Choose someone who works here now", { status: 400 });
    return once(key, fingerprint(request, "POST /patients/:id/deposits", patientId, parsed.data), () => {
      const held = depositBalance(db.payments, patientId);
      if (-parsed.data.amount > held) return new HttpResponse(`A refund can't be more than the ${formatPeso(held)} deposit`, { status: 409 });
      const branchId = activeBranch(request).id; // handed over at this branch
      const payment: Payment = { ...parsed.data, id: crypto.randomUUID(), clinicId: currentClinicId(), branchId, patientId, receiptNo: nextNo("AR"), receivedAt: new Date().toISOString() };
      db.payments.push(payment);
      persist();
      return HttpResponse.json(payment, { status: 201 });
    });
  }),

  // Moves deposit money onto this invoice (+) or back (−) as a pair of rows; returns the invoice-side row.
  http.post(url("/invoices/:id/apply-credit"), async ({ params, request }) => {
    const key = idempotencyKey(request);
    if (key instanceof Response) return key;
    const invoice = db.invoices.find((i) => i.id === params.id);
    if (!invoice) return new HttpResponse("Invoice not found", { status: 404 });
    const parsed = ApplyCreditInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    if (!isActiveStaffId(parsed.data.receivedBy)) return new HttpResponse("Choose someone who works here now", { status: 400 });
    const { amount, receivedBy } = parsed.data;
    return once(key, fingerprint(request, "POST /invoices/:id/apply-credit", invoice.id, parsed.data), () => {
      if (isVoided(invoice)) return voided();
      const held = depositBalance(db.payments, invoice.patientId);
      const balance = invoiceBalance(invoice, db.payments);
      if (amount > held) return new HttpResponse(`Only ${formatPeso(held)} is on deposit`, { status: 409 });
      if (amount > balance) return new HttpResponse(`That's more than the ${formatPeso(balance)} balance`, { status: 409 });
      if (-amount > appliedCredit(invoice.id, db.payments)) return new HttpResponse("That's more than was applied from the deposit", { status: 409 });
      const base = { clinicId: currentClinicId(), patientId: invoice.patientId, method: "account_credit" as const, receivedBy, receiptNo: nextNo("CR"), receivedAt: new Date().toISOString() };
      // The invoice side is the invoice's branch's money. The deposit side comes off the branches that hold it.
      const onInvoice: Payment = { ...base, branchId: invoice.branchId, id: crypto.randomUUID(), invoiceId: invoice.id, amount, note: amount > 0 ? "Paid from deposit" : "Returned to deposit" };
      const legs = depositLegs(invoice.branchId, depositPool(db.payments, invoice.patientId, invoice.id, amount), amount);
      const onDeposit = legs.map(([branchId, share]): Payment => ({ ...base, branchId, id: crypto.randomUUID(), appliedTo: invoice.id, amount: share }));
      db.payments.push(onInvoice, ...onDeposit);
      persist();
      return HttpResponse.json(onInvoice, { status: 201 });
    });
  }),
];
