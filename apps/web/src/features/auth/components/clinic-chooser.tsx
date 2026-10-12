"use client";
import type { ClinicChoice } from "@pedia/shared";
import { Button } from "@/components/ui/button";

/**
 * After a correct password, when the email belongs to more than one clinic account (decision #27). Each clinic keeps
 * its own login, so picking one signs in to that clinic only. No second password: the one just typed is re-sent.
 */
export function ClinicChooser({
  choices,
  pending,
  error,
  onPick,
  onBack,
}: {
  choices: ClinicChoice[];
  pending: boolean;
  error?: string;
  onPick: (clinicId: string) => void;
  onBack: () => void;
}) {
  return (
    <section aria-labelledby="clinic-chooser" className="space-y-4 rounded-xl border border-line bg-surface p-4 shadow-card sm:p-6">
      <div className="space-y-1">
        <h2 id="clinic-chooser" className="text-lg font-semibold">Which clinic?</h2>
        <p className="text-sm text-ink-muted">Your email is set up at more than one clinic. Choose where you are working now.</p>
      </div>
      <ul className="grid gap-2">
        {choices.map((c) => (
          <li key={c.clinicId}>
            <Button variant="outline" className="h-11 w-full justify-start" disabled={pending} onClick={() => onPick(c.clinicId)}>
              {c.name}
            </Button>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <Button variant="ghost" size="sm" onClick={onBack} disabled={pending}>
        Use a different email
      </Button>
    </section>
  );
}
