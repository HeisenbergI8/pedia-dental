"use client";
import Link from "next/link";
import { SectionCard } from "@/components/section-card";
import { Can, useSession } from "@/features/auth/access";
import { PrivacyChoiceEditor } from "@/features/patients/components/privacy-card";
import { RecordsCopyButton } from "@/features/patients/components/records-copy-button";
import { useActiveChild } from "../use-child";

/** Privacy #15, #20 (P23): what the parent agreed to for this child; photos and reminders switch here, any time. */
export function PortalPrivacy() {
  const child = useActiveChild();
  const clinicId = useSession()?.user.clinicId;
  return (
    <SectionCard title="Privacy and consent" description={`What you agreed to for ${child.firstName}`}>
      {child.privacyConsent ? (
        <div className="space-y-3">
          <p>Treatment records: consented by {child.privacyConsent.guardianName}.</p>
          <Can permission="consents.manage" fallback={<p className="text-sm text-ink-muted">Your clinic&apos;s account is paused, so these can&apos;t change right now.</p>}>
            <PrivacyChoiceEditor patient={child} />
          </Can>
          {/* B13c2b E11: no number of days here; the period is a counsel placeholder (C4). */}
          <p className="text-sm text-ink-muted">
            To ask the clinic to correct or erase {child.firstName}&apos;s records, or to object to how they&apos;re used, contact the clinic.
            They&apos;ll answer within the time the law allows.
          </p>
        </div>
      ) : (
        <p>The clinic hasn&apos;t recorded your consent yet. They&apos;ll ask at your next visit.</p>
      )}
      {clinicId && (
        <Link href={`/legal/notice/${clinicId}`} className="mt-3 inline-block text-sm font-semibold text-brand underline underline-offset-2">
          Read the clinic&apos;s privacy notice
        </Link>
      )}
      {/* Not behind consents.manage: a paused clinic's parent may still download (decision #44). */}
      <div className="mt-4 space-y-1.5">
        <RecordsCopyButton patientId={child.id} label={`Download ${child.firstName}'s records`} className="h-11" />
        <p className="text-sm text-ink-muted">A file with {child.firstName}&apos;s details, visits booked, bills and messages, to keep or take to another dentist. For dental charts and notes, ask the clinic.</p>
      </div>
    </SectionCard>
  );
}
