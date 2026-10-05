"use client";
import type { ReactNode } from "react";
import { format, parseISO } from "date-fns";
import { PlusIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import { ConsentScope, DENTIST_SIGNED, FORMULARY, NOTE_MESSAGES, findDrug, formatPeso, type DocumentType, type PrescriptionItem, isMoneyIn } from "@pedia/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CONSENT_LABEL } from "@/features/patients/api";
import { formatDate } from "@/lib/format";
import type { DocSources } from "../content";

export type Draft = { issuedBy: string; sourceId?: string; details: Record<string, string>; items: PrescriptionItem[] };

/** The record choices each type offers, newest first. Shared with the tab, which uses the first as the default. */
export function sourceOptions(type: DocumentType, src: DocSources): { value: string; label: string }[] {
  const dentist = (id: string) => src.staff.find((s) => s.id === id)?.fullName ?? "";
  if (type === "dental_certificate" || type === "dental_clearance") {
    return src.visits.filter((v) => v.status === "completed").map((v) => ({ value: v.id, label: `${formatDate(v.date)} · ${dentist(v.dentistId)}` }));
  }
  if (type === "receipt") {
    // Money received (payments and deposits); a transfer between a deposit and an invoice has no receipt.
    return [...src.payments].filter(isMoneyIn).reverse().map((p) => ({ value: p.id, label: `${p.receiptNo} · ${formatPeso(p.amount)} · ${format(parseISO(p.receivedAt), "MMM d, yyyy")}` }));
  }
  if (type === "post_op_instructions") {
    return src.notes.flatMap((n) => {
      const t = src.noteTemplates.find((x) => x.id === n.templateId);
      const visit = src.visits.find((v) => v.id === n.visitId);
      return n.signedAt && t && NOTE_MESSAGES[t.procedure] ? [{ value: n.id, label: `${t.name} · ${formatDate(visit?.date ?? n.signedAt.slice(0, 10))}` }] : [];
    });
  }
  return [];
}

function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {hint && <p className="text-sm text-ink-muted">{hint}</p>}
      {children}
      {error && <p id={`${id}-error`} className="text-sm text-danger">{error}</p>}
    </div>
  );
}

function Pick({ id, value, options, onChange, placeholder, error }: { id: string; value?: string; options: { value: string; label: string }[]; onChange: (v: string) => void; placeholder: string; error?: string }) {
  return (
    <Select value={value ?? ""} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full" aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

/** The choices one document type needs. `errors` is keyed by issue path ("details.reason", "items.0.sig"). */
export function DocumentOptions({ type, src, draft, errors, onChange }: { type: DocumentType; src: DocSources; draft: Draft; errors: Record<string, string>; onChange: (d: Draft) => void }) {
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });
  const detail = (key: string, value: string) => set({ details: { ...draft.details, [key]: value } });
  const issuers = src.staff.filter((s) => !DENTIST_SIGNED.includes(type) || s.role === "dentist");
  const sources = sourceOptions(type, src);
  const open = src.plan.filter((i) => i.status === "planned" || i.status === "in_progress");
  const planned = [...new Set(open.map((i) => i.procedureCode))].map((code) => ({ value: code, label: src.procedures.find((p) => p.code === code)?.name ?? code }));
  const setItem = (i: number, patch: Partial<PrescriptionItem>) => set({ items: draft.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  const prescribable = FORMULARY.filter((d) => !d.controlled);

  return (
    <div className="space-y-4">
      {DOCUMENT_SOURCE_LABEL[type] && (
        <Field id="doc-source" label={DOCUMENT_SOURCE_LABEL[type]} error={errors.sourceId}>
          {sources.length ? (
            <Pick id="doc-source" value={draft.sourceId} options={sources} onChange={(sourceId) => set({ sourceId })} placeholder="Choose" error={errors.sourceId} />
          ) : (
            <p className="text-sm text-ink-muted">Nothing in this patient&apos;s record to generate this from yet.</p>
          )}
        </Field>
      )}

      {type === "consent_form" && (
        <Field id="doc-scope" label="Consent for" error={errors["details.scope"]}>
          <Pick id="doc-scope" value={draft.details.scope} options={ConsentScope.options.map((s) => ({ value: s, label: CONSENT_LABEL[s] }))} onChange={(v) => detail("scope", v)} placeholder="Choose" error={errors["details.scope"]} />
        </Field>
      )}

      {type === "referral_letter" && (
        <>
          <Field id="doc-referred-to" label="Referred to" hint="Name and specialty, e.g. Dr. Lim, orthodontist" error={errors["details.referredTo"]}>
            <Input id="doc-referred-to" value={draft.details.referredTo ?? ""} onChange={(e) => detail("referredTo", e.target.value)} aria-invalid={!!errors["details.referredTo"]} aria-describedby={errors["details.referredTo"] ? "doc-referred-to-error" : undefined} />
          </Field>
          <Field id="doc-reason" label="Reason for referral" error={errors["details.reason"]}>
            <Textarea id="doc-reason" rows={3} value={draft.details.reason ?? ""} onChange={(e) => detail("reason", e.target.value)} aria-invalid={!!errors["details.reason"]} aria-describedby={errors["details.reason"] ? "doc-reason-error" : undefined} />
          </Field>
        </>
      )}

      {type === "clearance" && (
        <>
          <Field id="doc-procedure" label="Planned treatment" error={errors["details.procedure"]}>
            <Pick
              id="doc-procedure"
              value={draft.details.procedure}
              options={planned.length ? planned : src.procedures.map((p) => ({ value: p.code, label: p.name }))}
              onChange={(v) => detail("procedure", v)}
              placeholder="Choose"
              error={errors["details.procedure"]}
            />
          </Field>
          <Field id="doc-physician" label="Physician (optional)" hint="Leave blank to address it to the attending physician">
            <Input id="doc-physician" value={draft.details.physician ?? ""} onChange={(e) => detail("physician", e.target.value)} />
          </Field>
        </>
      )}

      {type === "dental_clearance" && (
        <Field id="doc-purpose" label="Cleared for" hint="e.g. school enrolment, surgery under general anaesthesia" error={errors["details.purpose"]}>
          <Input
            id="doc-purpose"
            value={draft.details.purpose ?? ""}
            onChange={(e) => detail("purpose", e.target.value)}
            aria-invalid={!!errors["details.purpose"]}
            aria-describedby={errors["details.purpose"] ? "doc-purpose-error" : undefined}
          />
        </Field>
      )}

      {type === "prescription" && (
        <div className="space-y-3">
          <p className="flex items-start gap-2 rounded-lg border border-alert-line bg-alert-bg p-3 text-sm text-alert">
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span><strong>Allergies:</strong> {src.patient.allergies.length ? src.patient.allergies.join(", ") : "none recorded"}</span>
          </p>
          {draft.items.map((item, i) => (
            <fieldset key={i} className="space-y-3 rounded-lg border border-line p-3">
              <legend className="px-1 text-sm font-medium">Medicine {i + 1}</legend>
              <Field id={`rx-${i}-drug`} label="Medicine" error={errors[`items.${i}.drugId`]}>
                <Pick
                  id={`rx-${i}-drug`}
                  value={item.drugId}
                  options={prescribable.map((d) => ({ value: d.id, label: `${d.name} ${d.strength}, ${d.form}` }))}
                  onChange={(drugId) => {
                    const d = findDrug(drugId);
                    setItem(i, { drugId, sig: d?.defaultSig ?? "", quantity: d?.defaultQuantity ?? "" });
                  }}
                  placeholder="Choose a medicine"
                  error={errors[`items.${i}.drugId`]}
                />
              </Field>
              <Field id={`rx-${i}-sig`} label="How to take it" hint="Write the dose where it says ___" error={errors[`items.${i}.sig`]}>
                <Textarea id={`rx-${i}-sig`} rows={2} value={item.sig} onChange={(e) => setItem(i, { sig: e.target.value })} aria-invalid={!!errors[`items.${i}.sig`]} aria-describedby={errors[`items.${i}.sig`] ? `rx-${i}-sig-error` : undefined} />
              </Field>
              <Field id={`rx-${i}-qty`} label="Quantity" error={errors[`items.${i}.quantity`]}>
                <Input id={`rx-${i}-qty`} value={item.quantity} onChange={(e) => setItem(i, { quantity: e.target.value })} aria-invalid={!!errors[`items.${i}.quantity`]} aria-describedby={errors[`items.${i}.quantity`] ? `rx-${i}-qty-error` : undefined} />
              </Field>
              <Button type="button" variant="ghost" size="sm" onClick={() => set({ items: draft.items.filter((_, j) => j !== i) })}>
                <XIcon aria-hidden /> Remove medicine {i + 1}
              </Button>
            </fieldset>
          ))}
          {errors.items && <p className="text-sm text-danger">{errors.items}</p>}
          <Button type="button" variant="outline" size="sm" onClick={() => set({ items: [...draft.items, { drugId: "", sig: "", quantity: "" }] })}>
            <PlusIcon aria-hidden /> Add medicine
          </Button>
        </div>
      )}

      <Field id="doc-issuer" label={DENTIST_SIGNED.includes(type) ? "Issued and signed by" : "Issued by"} error={errors.issuedBy}>
        <Pick id="doc-issuer" value={draft.issuedBy} options={issuers.map((s) => ({ value: s.id, label: s.fullName }))} onChange={(issuedBy) => set({ issuedBy })} placeholder="Choose" error={errors.issuedBy} />
      </Field>
    </div>
  );
}

const DOCUMENT_SOURCE_LABEL: Partial<Record<DocumentType, string>> = {
  dental_certificate: "Visit",
  dental_clearance: "Exam visit",
  receipt: "Payment",
  post_op_instructions: "Treatment",
};
