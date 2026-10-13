"use client";
import Link from "next/link";
import { SectionCard } from "@/components/section-card";
import { Can, useSession } from "@/features/auth/access";
import { PrivacyChoiceEditor } from "@/features/patients/components/privacy-card";
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
          <p className="text-sm text-ink-muted">To withdraw consent to treatment records, contact the clinic.</p>
        </div>
      ) : (
        <p>The clinic hasn&apos;t recorded your consent yet. They&apos;ll ask at your next visit.</p>
      )}
      {clinicId && (
        <Link href={`/legal/notice/${clinicId}`} className="mt-3 inline-block text-sm font-semibold text-brand underline underline-offset-2">
          Read the clinic&apos;s privacy notice
        </Link>
      )}
    </SectionCard>
  );
}
