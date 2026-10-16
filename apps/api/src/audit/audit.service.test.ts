import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import { Clock, FixedClock } from "../common/clock";
import { type RequestContext, requestContext } from "../common/request-context";
import { PrismaService } from "../prisma/prisma.service";
import { AuditModule } from "./audit.module";
import { AuditService } from "./audit.service";

const NOW = new Date("2026-10-16T02:00:00Z");
const signedIn: RequestContext = {
  requestId: "r1",
  clinicId: "clinic_a",
  operator: false,
  user: { id: "staff_reyes", name: "Dr. Ana Reyes", role: "dentist", roles: ["dentist"] },
};

function setup(repeat: { id: string } | null = null) {
  const auditEvent = { findFirst: vi.fn(async () => repeat), create: vi.fn(async () => ({ id: "a1" })) };
  const service = new AuditService({ auditEvent } as unknown as PrismaService, new FixedClock(NOW));
  return { service, auditEvent };
}

describe("AuditService", () => {
  it("writes the actor, clinic and time from the context and the clock", async () => {
    const { service, auditEvent } = setup();
    await requestContext.run(signedIn, () => service.record("view", "Dental chart", "pat_1"));
    expect(auditEvent.create).toHaveBeenCalledWith({
      data: {
        clinicId: "clinic_a",
        at: NOW,
        actorId: "staff_reyes",
        actorName: "Dr. Ana Reyes",
        actorRole: "dentist",
        action: "view",
        record: "Dental chart",
        patientId: "pat_1",
      },
      select: { id: true },
    });
  });

  it("skips a repeat view within five minutes", async () => {
    const { service, auditEvent } = setup({ id: "earlier" });
    await requestContext.run(signedIn, () => service.record("view", "Dental chart", "pat_1"));
    expect(auditEvent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ at: { gt: new Date(NOW.getTime() - 5 * 60_000) } }) }),
    );
    expect(auditEvent.create).not.toHaveBeenCalled();
  });

  it("always writes a change, without looking for a repeat", async () => {
    const { service, auditEvent } = setup({ id: "earlier" });
    await requestContext.run(signedIn, () => service.record("update", "Dental chart", "pat_1"));
    expect(auditEvent.findFirst).not.toHaveBeenCalled();
    expect(auditEvent.create).toHaveBeenCalledOnce();
  });

  it("writes through the caller's transaction when given one", async () => {
    const { service } = setup();
    const tx = { auditEvent: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({ id: "a2" })) } };
    await requestContext.run(signedIn, () => service.record("create", "Payment", undefined, tx as never));
    expect(tx.auditEvent.create).toHaveBeenCalledOnce();
  });

  it("refuses without a signed-in user, or outside a request", async () => {
    const { service } = setup();
    await expect(requestContext.run({ ...signedIn, user: undefined }, () => service.record("view", "x"))).rejects.toThrow(
      /signed-in user/,
    );
    await expect(service.record("view", "x")).rejects.toThrow(/No request context/);
  });

  it("resolves through Nest with the injected Clock", async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AuditModule] })
      .useMocker((token) => (token === Clock ? new FixedClock(NOW) : token === PrismaService ? {} : undefined))
      .compile();
    expect(moduleRef.get(AuditService)).toBeInstanceOf(AuditService);
  });
});
