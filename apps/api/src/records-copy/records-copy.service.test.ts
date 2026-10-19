import { DEMO_CLINIC_ID, seedPlatform } from "@pedia/seed";
import { type RecordsCopySection, type Role, copySections } from "@pedia/shared";
import { describe, expect, it, vi } from "vitest";
import type { ClinicIdentity } from "../auth/identity.service";
import { FixedClock } from "../common/clock";
import { RecordsCopyService } from "./records-copy.service";

const db = seedPlatform().tenants[DEMO_CLINIC_ID]!;
const signed = db.notes.find((n) => n.signedAt)!;
const child = db.patients.find((p) => p.id === signed.patientId)!;
const draft = { ...signed, id: "note_draft", signedAt: undefined, signedBy: undefined };

function setup(roles: Role[], failing?: RecordsCopySection) {
  const order: string[] = [];
  const read = (name: string, rows: unknown[] = []) =>
    vi.fn(async () => {
      order.push(name);
      if (name === failing) throw new Error("read failed");
      return rows;
    });
  const fakes = {
    audit: { record: vi.fn(async () => void order.push("audit")) },
    clinic: { name: vi.fn(async () => "Ngiti Kids") },
    patients: { view: vi.fn(async () => child) },
    visits: { list: read("visits") },
    chart: { entries: read("chart") },
    notes: { list: read("notes", [signed, draft]) },
    growth: { list: read("growth") },
    plan: { list: read("plan") },
    appointments: { forPatient: read("appointments") },
    requests: { forPatient: read("appointmentRequests") },
    invoices: { list: read("invoices") },
    payments: { history: read("payments") },
    messages: { list: read("messages") },
    photos: { list: read("photos") },
    documents: { forPatient: read("documents") },
  };
  const f = fakes as never as Record<keyof typeof fakes, never>;
  const service = new RecordsCopyService(
    new FixedClock(new Date("2026-10-19T03:00:00Z")), f.audit, f.clinic, f.patients, f.visits, f.chart, f.notes, f.growth,
    f.plan, f.appointments, f.requests, f.invoices, f.payments, f.messages, f.photos, f.documents,
  );
  const who = { clinicId: DEMO_CLINIC_ID, user: { id: "u1", name: "Someone", role: roles[0]!, roles } } as ClinicIdentity;
  return { service, fakes, order, copy: () => service.copy(who, child.id) };
}

describe("RecordsCopyService (B13c2a)", () => {
  it("reads only the sections the roles hold, and names the rest in omitted", async () => {
    const dentist = setup(["dentist"]);
    expect((await dentist.copy()).omitted).toEqual(copySections(["dentist"]).omitted);
    expect(dentist.fakes.messages.list).not.toHaveBeenCalled();
    const parent = setup(["parent"]);
    const copy = await parent.copy();
    expect(copy.omitted).toEqual(copySections(["parent"]).omitted);
    for (const f of [parent.fakes.visits.list, parent.fakes.chart.entries, parent.fakes.notes.list, parent.fakes.growth.list, parent.fakes.documents.forPatient]) expect(f).not.toHaveBeenCalled();
    expect(copy.visits).toBeUndefined();
  });

  it("keeps signed notes only", async () => {
    expect((await setup(["owner"]).copy()).notes!.map((n) => n.id)).toEqual([signed.id]);
  });

  it("records one export after every read, and none when a read fails", async () => {
    const ok = setup(["owner"]);
    await ok.copy();
    expect(ok.fakes.audit.record).toHaveBeenCalledOnce();
    expect(ok.fakes.audit.record).toHaveBeenCalledWith("export", "Copy of records", child.id);
    expect(ok.order.at(-1)).toBe("audit");
    const failing = setup(["owner"], "payments");
    await expect(failing.copy()).rejects.toThrow("read failed");
    expect(failing.fakes.audit.record).not.toHaveBeenCalled();
  });
});
