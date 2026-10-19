import { RECORDS_COPY_SECTIONS, type RecordsCopySection } from "@pedia/shared";
import { describe, expect, it } from "vitest";
import { CLINIC_RULES } from "../auth/access-rules";

/** The read route behind each section: a section is in a copy exactly when its route would answer the caller. */
const ROUTE_OF: Record<RecordsCopySection, string> = {
  visits: "GET /patients/:id/visits", chart: "GET /patients/:id/chart", notes: "GET /patients/:id/notes",
  growth: "GET /patients/:id/growth", plan: "GET /patients/:id/plan", appointments: "GET /patients/:id/appointments",
  appointmentRequests: "GET /patients/:id/appointment-requests", invoices: "GET /patients/:id/invoices",
  payments: "GET /patients/:id/payments", messages: "GET /messages", photos: "GET /patients/:id/photos",
  documents: "GET /patients/:id/documents",
};

describe("copy of records sections (B13c2a)", () => {
  it.each(Object.entries(ROUTE_OF))("%s needs what %s needs", (section, route) => {
    const rule = CLINIC_RULES.find((r) => `${r.method} ${r.path}` === route);
    expect(rule, route).toBeDefined();
    expect([...RECORDS_COPY_SECTIONS[section as RecordsCopySection]].sort()).toEqual([rule!.permission].flat().sort());
  });
});
