"use client";
import Link from "next/link";
import { useState } from "react";
import { PENDING_REVIEW } from "@pedia/shared";
import { LoadingScreen } from "@/components/brand";
import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useSession } from "../access";
import { useAcknowledge, useAcknowledgementPrompt, useSignOut } from "../api";

const ACTION = { terms: "Accept and continue", confidentiality: "I understand", notice: "I've read this" } as const;
const yesNo = (v: boolean | undefined) => (v === undefined ? "not recorded" : v ? "yes" : "no");
const docLink = "font-semibold text-brand underline underline-offset-2";

/**
 * Privacy #9, #20, #21: the whole app until this login has read what is waiting. The Owner's updated terms (with
 * the "authorised" box), a staff login's confidentiality, or a parent's clinic notice with their consents on record.
 * Like ChangePasswordScreen, the shell isn't mounted, so none of its queries fire meanwhile.
 */
export function AcknowledgeScreen() {
  const kind = useSession()?.user.mustAcknowledge ?? "notice";
  const prompt = useAcknowledgementPrompt(kind);
  const acknowledge = useAcknowledge();
  const signOut = useSignOut();
  const [authorised, setAuthorised] = useState(false);

  if (prompt.isLoading) return <LoadingScreen />;
  if (!prompt.data) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16">
        <ErrorState what="what you need to read" onRetry={() => void prompt.refetch()} />
      </main>
    );
  }
  const p = prompt.data;
  const blocked = p.kind === "terms" && !authorised;

  return (
    <main className="min-h-screen bg-ground px-4 py-10">
      <article className="mx-auto w-full max-w-2xl space-y-6 rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8">
        <header className="space-y-1">
          <p className="text-sm font-semibold text-ink-muted">{p.clinicName}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{p.title}</h1>
          <p className="text-sm text-ink-muted">
            Version {p.version}
            {p.kind !== "confidentiality" && ` · ${PENDING_REVIEW}`}
          </p>
        </header>
        <div className="space-y-3 leading-relaxed">
          {p.paragraphs.map((t) => (
            <p key={t}>{t}</p>
          ))}
        </div>
        {p.kind === "terms" && (
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <Link href="/legal/terms" target="_blank" className={docLink}>Read the Terms of Service</Link>
            <Link href="/legal/dpa" target="_blank" className={docLink}>Read the Data Processing Agreement</Link>
          </p>
        )}
        {p.contact && (
          <p className="text-sm">
            Privacy contact: <span className="font-semibold">{p.contact.name}</span>,{" "}
            <a href={`mailto:${p.contact.email}`} className={docLink}>{p.contact.email}</a>
          </p>
        )}
        {p.children && p.children.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-base font-semibold">Your consents on record</h2>
            <ul className="divide-y divide-line rounded-xl border border-line">
              {p.children.map((c, i) => (
                <li key={`${c.firstName}-${i}`} className="space-y-0.5 px-4 py-3 text-sm">
                  <p className="font-semibold">{c.firstName}</p>
                  <p className="text-ink-muted">
                    {c.recorded
                      ? `Treatment records: yes · Clinical photos: ${yesNo(c.photos)} · Reminder messages: ${yesNo(c.reminders)}`
                      : "Not recorded yet. The clinic will ask at your next visit."}
                  </p>
                </li>
              ))}
            </ul>
            <p className="text-sm text-ink-muted">You can change photos and reminders any time on the portal&apos;s Home page.</p>
          </section>
        )}
        {p.kind === "terms" && (
          <div className="flex items-start gap-3">
            <Checkbox id="ack-authorised" className="mt-0.5" checked={authorised} onCheckedChange={(on) => setAuthorised(on === true)} />
            <Label htmlFor="ack-authorised" className="font-normal leading-snug">
              I&apos;m authorised to act for {p.clinicName} and accept the Terms of Service and the Data Processing Agreement.
            </Label>
          </div>
        )}
        {acknowledge.error && <p role="alert" className="text-sm text-danger">{acknowledge.error.message}</p>}
        <div className="flex flex-wrap items-center gap-4">
          <Button disabled={acknowledge.isPending || blocked} onClick={() => acknowledge.mutate({ kind: p.kind, version: p.version })}>
            {acknowledge.isPending ? "Saving" : ACTION[p.kind]}
          </Button>
          <Button variant="link" className="h-auto px-0" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </article>
    </main>
  );
}
