import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StatusChip } from "@/features/appointments/components/status-chip";
import { PatientAvatar, avatarTone } from "@/features/patients/components/patient-avatar";
import { read } from "./source";

describe("status", () => {
  it("confirmed is the brand tint with its ring", () => {
    const out = renderToStaticMarkup(h(StatusChip, { status: "confirmed" }));
    expect(out).toContain("bg-brand-subtle");
    expect(out).toContain("border-brand-ring");
  });
  it("calendar tiles lead with a status icon and are never dashed", () => {
    const cal = read("features/appointments/components/appointment-calendar.tsx");
    expect(cal).toContain("STATUS_ICON[event.appointment.status]");
    expect(cal).not.toContain("border-dashed");
    expect(cal).toContain("<Segmented");
  });
});

describe("avatars", () => {
  it("identity avatar is brand-deep", () => {
    const out = renderToStaticMarkup(h(PatientAvatar, { patient: { id: "p1", firstName: "Mika", lastName: "Lynch" } as never }));
    expect(out).toContain("bg-brand-deep");
  });
  it("initials tints are stable, varied and never a status colour", () => {
    const ids = Array.from({ length: 60 }, (_, i) => `pat_${i}`);
    const tones = ids.map(avatarTone);
    expect(tones).toEqual(ids.map(avatarTone));
    expect(new Set(tones).size).toBeGreaterThan(1);
    for (const t of tones) expect(t).not.toMatch(/warning|info|danger|alert|success/);
  });
});

describe("dashboard and lists", () => {
  it("Today opens on the brand-deep banner", () => expect(read("features/dashboard/components/today-glance.tsx")).toContain("bg-brand-deep"));
  it("patient flags are borderless chips", () => {
    expect(read("features/patients/components/patient-list.tsx")).toMatch(/const CHIP = "(?![^"]*\bborder\b)[^"]*"/);
  });
});
