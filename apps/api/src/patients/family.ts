import { currentChoices, type AcknowledgementPrompt, type PrivacyChoice } from "@pedia/shared";

type Child = { id: string; firstName: string };

/** The parent's notice page lists their children and what is on record for each (privacy #20, mocks/privacy.ts:90). */
export function promptChildren(children: Child[], consented: ReadonlySet<string>, choices: Map<string, PrivacyChoice[]>): NonNullable<AcknowledgementPrompt["children"]> {
  return children.map((c) => {
    const now = currentChoices({ privacyChoices: choices.get(c.id) });
    return { firstName: c.firstName, recorded: consented.has(c.id), photos: now?.photos, reminders: now?.reminders };
  });
}
