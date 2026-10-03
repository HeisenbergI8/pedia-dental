import { format, parseISO } from "date-fns";
import { formatPeso, invoiceBalance, invoiceTotal, type Invoice, type Patient, type Payment, type StaffMember } from "@pedia/shared";
import { METHOD_LABEL } from "./api";

/** What an acknowledgment receipt says, on screen and in the PDF. `payments` is the patient's full history. */
export function receiptContent({ patient, invoice, payment, payments, staff }: { patient: Patient; invoice: Invoice; payment: Payment; payments: Payment[]; staff: StaffMember[] }) {
  const refund = payment.amount < 0;
  const after = invoiceBalance(invoice, payments.filter((p) => p.receivedAt <= payment.receivedAt)); // as it stood then
  const guardian = patient.guardians.find((g) => g.isPrimary);
  const rows: [string, string][] = [
    ["Patient", `${patient.firstName} ${patient.lastName}`],
    ...(guardian ? [[refund ? "Refunded to" : "Received from", guardian.fullName] as [string, string]] : []),
    ["Amount", formatPeso(Math.abs(payment.amount))],
    ["Method", `${METHOD_LABEL[payment.method]}${payment.referenceNo ? ` · ref ${payment.referenceNo}` : ""}`],
    ...(payment.note ? [["Reason", payment.note] as [string, string]] : []),
    ["For", invoice.lines.map((l) => `${l.description}${l.tooth ? ` (${l.tooth})` : ""}`).join(", ")],
    ["Invoice total", formatPeso(invoiceTotal(invoice))],
    ["Balance after this", formatPeso(after)],
    [refund ? "Refunded by" : "Received by", staff.find((s) => s.id === payment.receivedBy)?.fullName ?? payment.receivedBy],
  ];
  return {
    refund,
    title: refund ? "Refund acknowledgment" : "Acknowledgment receipt",
    subtitle: `No. ${payment.receiptNo} · ${format(parseISO(payment.receivedAt), "MMM d, yyyy h:mm a")}`,
    rows,
    footnote: "This is an acknowledgment receipt, not an official receipt.",
  };
}
