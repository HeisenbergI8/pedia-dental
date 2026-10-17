import { DOCUMENT_TYPE_LABEL, isMoneyIn, type ClinicalPhoto, type Patient, type PatientDocument, type Payment, type Visit } from "@pedia/shared";

type Refs = { clinicId: string; patients: Patient[]; visits: Visit[]; payments: Payment[]; childId: string | undefined; dentistId: string; deskId: string };

/**
 * B10: the example child's photo record and two issued documents. The example plan's child (it has completed visits and
 * a paid bill), never a child who declined clinical photos. Ids `photo_seed_<n>` / `doc_seed_<n>` are the same in MSW
 * and the API's seed (hybrid). Files: seed-files.ts. No faker: nothing seeded after this moves.
 */
export function seedPhotos({ clinicId, patients, visits, payments, childId, dentistId, deskId }: Refs): { photos: ClinicalPhoto[]; documents: PatientDocument[] } {
  const child = patients.find((p) => p.id === childId);
  const done = visits.filter((v) => v.patientId === childId && v.status === "completed").sort((a, b) => a.date.localeCompare(b.date));
  const [first, last] = [done[0], done.at(-1)];
  const paid = payments.find((p) => p.patientId === childId && p.amount > 0 && isMoneyIn(p));
  if (!child || !first || !last) return { photos: [], documents: [] };

  const at = (date: string, minutes: number) => new Date(`${date}T01:00:00.000Z`).getTime() + minutes * 60_000;
  const photo = (n: number, p: Omit<ClinicalPhoto, "id" | "clinicId" | "patientId" | "createdAt">, date: string): ClinicalPhoto => ({
    ...p, id: `photo_seed_${n}`, clinicId, patientId: child.id, createdAt: new Date(at(date, n)).toISOString(),
  });
  const photos = [
    photo(1, { visitId: first.id, type: "intraoral", stage: "before", tooth: 74, takenOn: first.date, caption: "Before: distal caries on 74", contentType: "image/png", uploadedBy: "staff" }, first.date),
    photo(2, { visitId: last.id, type: "intraoral", stage: "after", tooth: 74, takenOn: last.date, caption: "After: restored", contentType: "image/png", uploadedBy: "staff" }, last.date),
    photo(3, { visitId: first.id, type: "xray", takenOn: first.date, caption: "Bitewing, left", contentType: "image/png", uploadedBy: "staff" }, first.date),
    photo(4, { type: "document", takenOn: last.date, caption: "Paediatrician's clearance", contentType: "application/pdf", uploadedBy: "parent" }, last.date),
  ];
  const doc = (n: number, d: Pick<PatientDocument, "type" | "sourceId" | "issuedBy">, date: string): PatientDocument => ({
    ...d, id: `doc_seed_${n}`, clinicId, patientId: child.id,
    title: `${DOCUMENT_TYPE_LABEL[d.type]} · ${child.firstName} ${child.lastName}`, createdAt: new Date(at(date, 60 + n)).toISOString(),
  });
  const documents = [
    doc(1, { type: "dental_certificate", sourceId: last.id, issuedBy: dentistId }, last.date),
    ...(paid ? [doc(2, { type: "receipt", sourceId: paid.id, issuedBy: deskId }, paid.receivedAt.slice(0, 10))] : []),
  ];
  return { photos, documents };
}
