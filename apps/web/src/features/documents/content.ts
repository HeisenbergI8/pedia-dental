import { format } from "date-fns";
import {
  DOCUMENT_TYPE_LABEL,
  LEGAL_DOCUMENTS,
  NOTE_MESSAGES,
  PENDING_REVIEW,
  accountSummary,
  branchLine,
  currentChoices,
  deriveChart,
  findDrug,
  formatPeso,
  groupFields,
  messageVars,
  noteServices,
  planProgress,
  renderMessage,
  rolesCan,
  rolesOf,
  type Branch,
  type ChartEntry,
  type ClinicalNote,
  type ConsentScope,
  type GenerateDocumentInput,
  type Invoice,
  type MessageTemplate,
  type NoteTemplate,
  type PatientView,
  type Payment,
  type PlanItem,
  type Procedure,
  type StaffMember,
  type Visit,
} from "@pedia/shared";
import { receiptContent } from "@/features/billing/receipt-rows";
import { CONSENT_LABEL } from "@/features/patients/api";
import { formatAge } from "@/features/patients/age";
import { PLAN_STATUS_LABEL } from "@/features/plan/api";
import { formatDate } from "@/lib/format";

type Row = [label: string, value: string];
export type DocBlock =
  | { kind: "rows"; heading?: string; rows: Row[] }
  | { kind: "text"; heading?: string; paragraphs: string[] }
  | { kind: "table"; heading?: string; head: string[]; rows: string[][]; foot?: string[]; numeric?: number[] }
  | { kind: "signatures"; lines: { label: string; name?: string; detail?: string }[] };

/** What heads every document (decisions #19, #31): the clinic, the branch it came from, its logo and brand ring. */
export type Letterhead = { clinicName: string; branchLine: string; logoUrl: string | null; ring: string };
export type DocContent = { title: string; subtitle: string; blocks: DocBlock[]; footnote?: string; fileName: string; clinicName: string; letterhead: Letterhead };

/** Everything a document can draw on: one patient's record plus reference data. */
export type DocSources = {
  clinicName: string; // the clinic account's
  letterhead: Letterhead; // at the device's active branch (decision #51)
  branches: Branch[]; // every branch, archived too: a receipt names the branch the payment was taken for
  patient: PatientView;
  staff: StaffMember[];
  procedures: Procedure[];
  visits: Visit[];
  notes: ClinicalNote[];
  noteTemplates: NoteTemplate[];
  chart: ChartEntry[];
  plan: PlanItem[];
  invoices: Invoice[];
  payments: Payment[];
  messageTemplates: MessageTemplate[];
};

/** What the guardian agrees to, per scope. Wording for the clinic to review (plan Q6). */
const CONSENT_TEXT: Record<ConsentScope, string> = {
  general_treatment: "examination, cleaning, fluoride, sealants, fillings and the other routine treatment explained to me",
  local_anesthesia: "the use of local anaesthetic (numbing) injections during treatment",
  extraction: "the removal of the tooth or teeth explained to me",
  radiographs: "the dental X-rays needed for diagnosis and treatment",
  clinical_photos: "photographs of my child's teeth and mouth for the clinical record",
  sedation: "sedation for treatment, after its risks and alternatives were explained to me",
};

const NONE = "None recorded";
const list = (xs: string[]) => (xs.length ? xs.join(", ") : NONE);
const words = (code: string) => code.replaceAll("_", " ");
const slug = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function need<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`${what} isn't in this patient's record`);
  return value;
}

/** Builds one document from the record. Throws only when the chosen source record doesn't exist. */
export function buildDocument(choice: GenerateDocumentInput, src: DocSources, now = new Date()): DocContent {
  const { patient } = src;
  const today = format(now, "yyyy-MM-dd");
  const child = `${patient.firstName} ${patient.lastName}`;
  const age = formatAge(patient.birthDate, now);
  const guardian = patient.guardians.find((g) => g.isPrimary) ?? patient.guardians[0];
  const issuer = src.staff.find((s) => s.id === choice.issuedBy);
  const procedureName = (code: string) => src.procedures.find((p) => p.code === code)?.name ?? words(code);

  const patientRows: Row[] = [
    ["Patient", child],
    ["Age", age],
    ["Sex", patient.sex === "male" ? "Male" : "Female"],
    ["Date of birth", formatDate(patient.birthDate)],
    ["Parent or guardian", `${guardian.fullName} (${guardian.relationship})`],
    ...(patient.address ? [["Address", patient.address] as Row] : []),
  ];
  const medical: Extract<DocBlock, { kind: "rows" }> = {
    kind: "rows",
    heading: "Medical history",
    rows: [["Allergies", list(patient.allergies)], ["Medical conditions", list(patient.medicalConditions)], ["Medications", list(patient.medications)]],
  };
  const chartRows: Row[] = [...deriveChart(src.chart).values()]
    .sort((a, b) => a.tooth - b.tooth)
    .flatMap((t) => {
      const found = [...new Set([t.whole, ...Object.values(t.surfaces)].filter((c) => c && c !== "sound"))] as string[];
      return found.length ? [[`Tooth ${t.tooth}`, found.map(words).join(", ")] as Row] : [];
    });
  const findings: DocBlock = { kind: "rows", heading: "Current dental findings", rows: chartRows.length ? chartRows : [["Findings", NONE]] };
  const dentistLine = { label: "Dentist", name: issuer?.fullName, detail: issuer?.licenseNo ? `PRC Lic. No. ${issuer.licenseNo}` : undefined };
  /** "Extraction (75)": the note's template name and the teeth it records. */
  const treatmentOf = (n: ClinicalNote) => {
    const name = src.noteTemplates.find((t) => t.id === n.templateId)?.name ?? "Treatment";
    const teeth = Array.isArray(n.values.teeth) && n.values.teeth.length ? ` (${(n.values.teeth as number[]).join(", ")})` : "";
    return name + teeth;
  };
  const treatmentsIn = (visitId: string) => src.notes.filter((n) => n.visitId === visitId && n.signedAt).map(treatmentOf);

  const doc = (blocks: DocBlock[], extra: Partial<DocContent> = {}): DocContent => ({
    title: DOCUMENT_TYPE_LABEL[choice.type],
    subtitle: `Issued ${formatDate(today)}`,
    blocks,
    fileName: `${slug(DOCUMENT_TYPE_LABEL[choice.type])}-${slug(patient.lastName)}-${slug(patient.firstName)}-${today}.pdf`,
    clinicName: src.clinicName,
    letterhead: src.letterhead,
    ...extra,
  });

  switch (choice.type) {
    case "dental_certificate": {
      const visit = need(src.visits.find((v) => v.id === choice.sourceId), "That visit");
      return doc([
        { kind: "text", paragraphs: [`This is to certify that ${child}, aged ${age}, was seen and treated at ${src.clinicName} on ${formatDate(visit.date)}.`] },
        { kind: "rows", rows: [...patientRows, ["Treatment given", list(treatmentsIn(visit.id))]] },
        { kind: "text", paragraphs: [`This certification is issued at the request of ${guardian.fullName} for whatever purpose it may serve.`] },
        { kind: "signatures", lines: [dentistLine] },
      ]);
    }
    case "treatment_plan": {
      const { done, total } = planProgress(src.plan);
      const counted = src.plan.filter((i) => i.status !== "declined").reduce((s, i) => s + i.fee, 0);
      return doc([
        { kind: "rows", rows: patientRows },
        src.plan.length
          ? {
              kind: "table",
              heading: `${done} of ${total} treatments done`,
              head: ["Treatment", "Tooth", "Status", "Fee"],
              rows: src.plan.map((i) => [procedureName(i.procedureCode), i.tooth ? String(i.tooth) : "—", PLAN_STATUS_LABEL[i.status], formatPeso(i.fee)]),
              foot: ["Total, excluding declined", "", "", formatPeso(counted)],
              numeric: [3],
            }
          : { kind: "text", paragraphs: ["No treatment is planned yet."] },
        { kind: "signatures", lines: [dentistLine, { label: "Parent or guardian", name: guardian.fullName }] },
      ]);
    }
    case "consent_form": {
      const scope = choice.details?.scope as ConsentScope;
      const recorded = patient.consents.find((c) => c.scope === scope);
      return doc(
        [
          { kind: "rows", rows: patientRows },
          {
            kind: "text",
            paragraphs: [
              `I, ${guardian.fullName}, ${guardian.relationship.toLowerCase()} of ${child}, consent to ${need(CONSENT_TEXT[scope], "That consent")}. The treatment, its risks, benefits and alternatives were explained to me, and my questions were answered.`,
              ...(recorded ? [`This consent was recorded on ${formatDate(recorded.date)}.`] : []),
            ],
          },
          { kind: "signatures", lines: [{ label: "Parent or guardian", name: guardian.fullName }, dentistLine] },
        ],
        { subtitle: `${CONSENT_LABEL[scope]} · issued ${formatDate(today)}` },
      );
    }
    // Privacy #12 (P18): the parent consent form, for a paper signature. Filled from the record when consent is
    // recorded; blank boxes when it isn't yet (#18).
    case "privacy_consent": {
      const form = LEGAL_DOCUMENTS.consent;
      const consent = patient.privacyConsent;
      const choices = currentChoices(patient);
      const fill = (p: string) => p.replaceAll("{clinic}", src.clinicName).replaceAll("{child}", child);
      const mark = (on: boolean | undefined) => (on === undefined ? "[ ] Yes   [ ] No" : on ? "[x] Yes   [ ] No" : "[ ] Yes   [x] No");
      return doc(
        [
          { kind: "rows", rows: patientRows },
          ...form.sections.map((s): DocBlock => ({ kind: "text", heading: s.heading, paragraphs: s.paragraphs.map(fill) })),
          {
            kind: "rows",
            heading: "Choices",
            rows: [
              ["Treatment records (required)", consent ? "[x] I consent" : "[ ] I consent"],
              ["Clinical photos (optional)", mark(choices?.photos)],
              ["Reminder messages (optional)", mark(choices?.reminders)],
            ],
          },
          ...(consent
            ? [{ kind: "text" as const, paragraphs: [`Recorded by ${consent.recordedByName} on ${formatDate(consent.at.slice(0, 10))}, against the clinic's privacy notice version ${consent.noticeVersion}.`] }]
            : []),
          { kind: "signatures", lines: [{ label: "Parent or guardian", name: consent?.guardianName ?? guardian.fullName }, { label: "Recorded by", name: consent?.recordedByName ?? issuer?.fullName }] },
        ],
        { subtitle: `Version ${form.version} · issued ${formatDate(today)}`, footnote: `${PENDING_REVIEW}. Form version ${form.version}.` },
      );
    }
    case "referral_letter":
      return doc([
        { kind: "text", paragraphs: [`To: ${choice.details?.referredTo}`, `I am referring ${child}, aged ${age}, for ${choice.details?.reason}.`] },
        { kind: "rows", rows: patientRows },
        medical,
        findings,
        { kind: "text", paragraphs: [`Thank you for seeing this patient. Please send your findings to ${src.clinicName}.`] },
        { kind: "signatures", lines: [dentistLine] },
      ]);
    case "clearance": {
      const physician = choice.details?.physician?.trim();
      return doc([
        {
          kind: "text",
          paragraphs: [
            `To: ${physician || "Attending physician"}`,
            `${child} is scheduled for ${procedureName(choice.details?.procedure ?? "").toLowerCase()} at ${src.clinicName}, which may need local anaesthesia. Please assess whether the child is medically fit for this treatment and note any precautions.`,
          ],
        },
        { kind: "rows", rows: patientRows },
        medical,
        { kind: "rows", heading: "Physician's assessment", rows: [["Cleared for treatment", "Yes / No (circle one)"], ["Precautions", "______________________________"]] },
        { kind: "signatures", lines: [{ label: "Physician", name: physician || undefined }, dentistLine] },
      ]);
    }
    case "dental_clearance": {
      // Placeholder wording for the dentist's review (like the other clinical templates).
      const visit = need(src.visits.find((v) => v.id === choice.sourceId), "That visit");
      const pending = src.plan.filter((i) => i.status === "planned" || i.status === "in_progress");
      const pendingText = pending.map((i) => `${procedureName(i.procedureCode)}${i.tooth ? ` (tooth ${i.tooth})` : ""}`);
      return doc([
        { kind: "text", paragraphs: [`This is to certify that ${child}, aged ${age}, was examined at ${src.clinicName} on ${formatDate(visit.date)}.`] },
        { kind: "rows", rows: [...patientRows, ["Cleared for", choice.details?.purpose ?? ""], ["Dental treatment still planned", list(pendingText)]] },
        {
          kind: "text",
          paragraphs: [
            pending.length
              ? `From a dental point of view ${child} may proceed. The treatment listed above is still planned.`
              : `From a dental point of view ${child} is cleared. No dental treatment is pending.`,
          ],
        },
        { kind: "signatures", lines: [dentistLine] },
      ]);
    }
    case "post_op_instructions": {
      const note = need(src.notes.find((n) => n.id === choice.sourceId), "That note");
      const template = src.noteTemplates.find((t) => t.id === note.templateId);
      const kind = NOTE_MESSAGES[template?.procedure ?? ""];
      const text = need(src.messageTemplates.find((t) => t.kind === kind), "Instructions for that treatment");
      const visit = src.visits.find((v) => v.id === note.visitId);
      return doc([
        { kind: "rows", rows: [["Patient", child], ["Treatment", treatmentOf(note)], ["Date", formatDate(visit?.date ?? today)]] },
        { kind: "text", heading: "Care instructions", paragraphs: [renderMessage(text.body, messageVars(patient, { clinicName: src.clinicName, dueOn: visit?.date }))] },
        { kind: "signatures", lines: [dentistLine] },
      ]);
    }
    case "prescription":
      return doc(
        [
          { kind: "rows", rows: [["Patient", child], ["Age", age], ["Sex", patient.sex === "male" ? "Male" : "Female"], ["Date", formatDate(today)], ["Allergies", list(patient.allergies)]] },
          {
            kind: "table",
            heading: "Rx",
            head: ["Medicine", "How to take", "Quantity"],
            rows: (choice.items ?? []).map((i) => {
              const d = findDrug(i.drugId);
              return [d ? `${d.name} ${d.strength}, ${d.form}` : i.drugId, i.sig, i.quantity];
            }),
          },
          { kind: "signatures", lines: [dentistLine] },
        ],
        { footnote: "Controlled (S2) drugs are not prescribed on this form." },
      );
    case "receipt": {
      const payment = need(src.payments.find((p) => p.id === choice.sourceId), "That payment");
      // A deposit has no invoice; a payment that names one must find it.
      const invoice = payment.invoiceId ? need(src.invoices.find((i) => i.id === payment.invoiceId), "That payment's invoice") : undefined;
      const r = receiptContent({ patient, invoice, payment, payments: src.payments, staff: src.staff });
      const paidAt = src.branches.find((b) => b.id === payment.branchId);
      const letterhead = paidAt ? { ...src.letterhead, branchLine: branchLine(paidAt) } : src.letterhead;
      return doc([{ kind: "rows", rows: r.rows }], { title: r.title, subtitle: r.subtitle, footnote: r.footnote, letterhead });
    }
    case "notes_report": {
      // Guardian contacts (the address) only when the issuer holds patients.contact; names stay (identity).
      const showContacts = !!issuer && rolesCan(rolesOf(issuer), "patients.contact");
      const reportRows = showContacts ? patientRows : patientRows.filter(([label]) => label !== "Address");
      const signed = src.notes.filter((n) => n.signedAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const blocks: DocBlock[] = [{ kind: "rows", rows: reportRows }, medical];
      for (const n of signed) {
        const template = src.noteTemplates.find((t) => t.id === n.templateId);
        const visit = src.visits.find((v) => v.id === n.visitId);
        const author = src.staff.find((s) => s.id === n.authorId)?.fullName ?? "Dentist";
        // The same grouping as the note card: one row per section, only what was recorded.
        const rows: Row[] = groupFields(template?.fields ?? []).flatMap((g) => {
          const shown = g.fields.flatMap((f) => {
            const v = n.values[f.key];
            if (f.type === "checkbox") return v === true ? [f.label] : [];
            if (f.type === "teeth") return Array.isArray(v) && v.length ? [`${f.label}: ${v.join(", ")}`] : [];
            return typeof v === "string" && v.trim() ? [g.section ? `${f.label}: ${v}` : v] : [];
          });
          return shown.length ? [[g.section ?? g.fields[0].label, shown.join(", ")] as Row] : [];
        });
        blocks.push({
          kind: "rows",
          heading: `${template?.name ?? "Note"} · ${formatDate(visit?.date ?? n.createdAt.slice(0, 10))} · ${author}`,
          rows: rows.length ? rows : [["Findings", NONE]],
        });
        const services = noteServices(n, src.plan, src.invoices, src.procedures);
        if (services.length) {
          blocks.push({
            kind: "table",
            head: ["Service", "Tooth", "Price"],
            rows: services.map((s) => [s.name, s.tooth ? String(s.tooth) : "", `${formatPeso(s.amount)}${s.billed ? "" : " (not billed yet)"}`]),
            numeric: [2],
          });
        }
      }
      if (!signed.length) blocks.push({ kind: "text", paragraphs: ["No signed clinical notes yet."] });
      blocks.push({ kind: "signatures", lines: [{ label: "Prepared by", name: issuer?.fullName }] });
      return doc(blocks, { footnote: "Prices are before any invoice discount. Draft notes are not included." });
    }
    case "patient_summary": {
      const { done, total } = planProgress(src.plan);
      const account = accountSummary(src.invoices, src.payments);
      const recent = [...src.visits].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
      return doc([
        { kind: "rows", rows: patientRows },
        { ...medical, rows: [...medical.rows, ["Alerts", list(patient.alerts)]] },
        findings,
        { kind: "rows", heading: "Treatment and account", rows: [["Treatment plan", `${done} of ${total} done`], ["Total billed", formatPeso(account.total)], ["Paid", formatPeso(account.paid)], ["Balance", formatPeso(account.balance)]] },
        {
          kind: "rows",
          heading: "Recent visits",
          rows: recent.length ? recent.map((v) => [formatDate(v.date), src.staff.find((s) => s.id === v.dentistId)?.fullName ?? "Dentist"] as Row) : [["Visits", NONE]],
        },
        { kind: "signatures", lines: [{ label: "Prepared by", name: issuer?.fullName }] },
      ]);
    }
  }
}
