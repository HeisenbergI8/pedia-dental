"use client";
import { useRef, useState } from "react";
import { ShieldAlertIcon } from "lucide-react";
import { toast } from "sonner";
import { currentChoices, type PatientView } from "@pedia/shared";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Can, useSession } from "@/features/auth/access";
import { DownloadDocumentButton } from "@/features/documents/components/download-document-button";
import { formatDate } from "@/lib/format";
import { useRecordPrivacyConsent, useSetPrivacyChoices } from "../api";
import { PrivacyConsentDialog } from "./privacy-consent-dialog";

const yesNo = (on: boolean | undefined) => (on === undefined ? "Not recorded" : on ? "Yes" : "No");
const day = (iso: string) => formatDate(iso.slice(0, 10));

/**
 * Privacy #12–#18 on the record: who consented, who recorded it and when, against which notice version; the optional
 * consents and their history; the printable form. Without consent: the prompt to record it (never a block, #18).
 */
export function PrivacyCard({ patient: p }: { patient: PatientView }) {
  const staffId = useSession()?.user.staffId;
  const [recording, setRecording] = useState(false);
  // The dialog has no Radix trigger, and a save replaces the button, so focus comes back to the card by hand.
  const card = useRef<HTMLDivElement>(null);
  const record = useRecordPrivacyConsent(p.id);
  const consent = p.privacyConsent;
  const choices = currentChoices(p);
  const history = [...(p.privacyChoices ?? [])].reverse();

  return (
    <SectionCard
      title="Privacy"
      description="The parent's consent under the Data Privacy Act"
      action={
        staffId ? (
          <Can permission="documents.issue">
            <DownloadDocumentButton variant="outline" patientId={p.id} choice={{ type: "privacy_consent", issuedBy: staffId }} label="Print consent form" />
          </Can>
        ) : undefined
      }
    >
      <div ref={card} tabIndex={-1} className="outline-none">
      {!consent ? (
        <div className="space-y-3">
          <p className="flex items-start gap-2 text-sm">
            <ShieldAlertIcon className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            Consent not recorded. Ask the parent at this visit; care goes ahead either way.
          </p>
          <Can permission="patients.write">
            <Button size="sm" variant="outline" onClick={() => setRecording(true)}>
              Record privacy consent
            </Button>
          </Can>
        </div>
      ) : (
        <div className="space-y-4 text-sm">
          <p>
            Treatment records: consented by <span className="font-semibold">{consent.guardianName}</span> ({consent.relationship}), recorded by{" "}
            {consent.recordedByName} on {day(consent.at)}, privacy notice version {consent.noticeVersion}.
          </p>
          <Can
            permission="consents.manage"
            fallback={
              <p>
                Clinical photos: {yesNo(choices?.photos)} · Reminder messages: {yesNo(choices?.reminders)}
              </p>
            }
          >
            <PrivacyChoiceEditor patient={p} />
          </Can>
          {history.length > 1 && (
            <details>
              <summary className="cursor-pointer font-medium">History of changes</summary>
              <ul className="mt-2 space-y-1 text-ink-muted">
                {history.map((c, i) => (
                  <li key={i}>
                    {day(c.at)}: photos {yesNo(c.photos).toLowerCase()}, reminders {yesNo(c.reminders).toLowerCase()} · {c.byName} ({c.by})
                  </li>
                ))}
              </ul>
            </details>
          )}
          <p className="text-ink-muted">To withdraw consent to treatment records, the parent contacts the clinic in writing. The records are kept as the law requires.</p>
        </div>
      )}
      </div>
      {recording && (
        <PrivacyConsentDialog
          childName={p.firstName}
          guardians={p.guardians}
          pending={record.isPending}
          submitLabel="Save consent"
          onClose={() => setRecording(false)}
          onCloseAutoFocus={(e) => (e.preventDefault(), card.current?.focus())}
          onConfirm={(input) =>
            record.mutate(input, {
              onSuccess: () => {
                setRecording(false);
                toast.success("Consent recorded");
              },
              onError: (e) => toast.error(e.message),
            })
          }
        />
      )}
    </SectionCard>
  );
}

/** Privacy #15: the two optional consents, each change saved at once as a new row. The portal reuses it. */
export function PrivacyChoiceEditor({ patient: p }: { patient: PatientView }) {
  const set = useSetPrivacyChoices(p.id);
  const current = currentChoices(p) ?? { photos: false, reminders: false };
  // Only the key that changed: the server merges it onto what is on record, so a stale copy can't re-grant a "no".
  const change = (key: "photos" | "reminders", on: boolean) =>
    set.mutate({ [key]: on }, { onSuccess: () => toast.success("Consent updated"), onError: (e) => toast.error(e.message) });
  return (
    <fieldset className="space-y-2" disabled={set.isPending}>
      <legend className="mb-1 text-sm font-semibold">Optional consents</legend>
      {(["photos", "reminders"] as const).map((key) => (
        <div key={key} className="flex items-center gap-2">
          <Checkbox id={`privacy-${p.id}-${key}`} checked={current[key]} onCheckedChange={(on) => change(key, on === true)} />
          <Label htmlFor={`privacy-${p.id}-${key}`} className="font-normal">
            {key === "photos" ? "Clinical photos allowed" : "Reminder messages allowed"}
          </Label>
        </div>
      ))}
    </fieldset>
  );
}
