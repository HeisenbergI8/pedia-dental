import { DENTIST_SIGNED, DOCUMENT_SOURCE, DOCUMENT_TYPE_LABEL, allergyConflicts, holdsRole, type GenerateDocumentInput, type StaffMember } from "@pedia/shared";
import type { Refusal } from "../common/refusal";

/** What the mock reads from its db to judge a document (documents/mocks.ts:54–63). */
export type DocumentFacts = {
  /** Any staff row of this clinic with that id, deactivated included (the mock's db.staff); undefined when none. */
  issuer: Pick<StaffMember, "role" | "alsoRoles"> | undefined;
  /** sourceFits (documents/mocks.ts:18–32); true for a type that needs no source. */
  sourceFits: boolean;
  patient: { firstName: string; allergies: string[] };
};

/** The mock's refusals after the body parsed, in its order: issuer, dentist, source, allergy (decision 6). */
export function documentRefusal(input: GenerateDocumentInput, facts: DocumentFacts): Refusal | undefined {
  if (!facts.issuer) return { status: 400, message: "Unknown staff member" };
  if (DENTIST_SIGNED.includes(input.type) && !holdsRole(facts.issuer, "dentist")) {
    return { status: 400, message: `A dentist has to issue the ${DOCUMENT_TYPE_LABEL[input.type].toLowerCase()}` };
  }
  if (!facts.sourceFits) return { status: 400, message: `${DOCUMENT_SOURCE[input.type]?.missing} for this patient` };
  const clash = allergyConflicts(facts.patient.allergies, input.items ?? []);
  if (clash.length) {
    const { firstName, allergies } = facts.patient;
    return { status: 409, message: `${firstName} is allergic to ${clash.map((d) => d.name).join(", ")} (recorded: ${allergies.join(", ")})` };
  }
  return undefined;
}

/** The logged title (documents/mocks.ts:70). */
export const documentTitle = (input: Pick<GenerateDocumentInput, "type">, p: { firstName: string; lastName: string }) =>
  `${DOCUMENT_TYPE_LABEL[input.type]} · ${p.firstName} ${p.lastName}`;
