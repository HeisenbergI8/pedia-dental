import { http, HttpResponse, delay } from "msw";
import { isDueItemOpen } from "@pedia/shared";
import { env } from "@/lib/env";
import { db } from "@/mocks/db";

const url = (p: string) => `${env.apiUrl}${p}`;

/** API contract for apps/api's RecallsController. Items are created by signing a note (notes/mocks.ts). */
export const recallHandlers = [
  // Open follow-ups and recalls across the clinic, soonest first. Bucketing by date is the client's job (dueBucket).
  http.get(url("/due-items"), async () => {
    await delay(100);
    const rows = db.dueItems
      .filter((i) => isDueItemOpen(i, db.appointments))
      .sort((a, b) => a.dueOn.localeCompare(b.dueOn))
      // The visit's dentist (always a dentist; a note can be written by another account), for one-tap booking.
      .map((i) => {
        const note = db.notes.find((n) => n.id === i.sourceNoteId);
        return { ...i, dentistId: db.visits.find((v) => v.id === note?.visitId)?.dentistId };
      });
    return HttpResponse.json(rows);
  }),
];
