import { AccountStatus, Acknowledgement, AgreementRecord, AuditAction, ConsentScope, HeadingFont, MessageChannel, MessageKind, MessageStatus, PhotoStage, PhotoType, DocumentType, PrivacyChoice, Role, Sex, StaffRole, PlanItemStatus, Tier, ToothCondition, VisitStatus, AppointmentRequestStatus, AppointmentStatus, DueItem, PaymentMethod, TimeOfDay } from "@pedia/shared";
import { describe, expect, it } from "vitest";
import type { RequestContext } from "../common/request-context";
import { $Enums, Prisma } from "../generated/prisma/client.ts";
import { APPEND_ONLY, MODEL_SCOPE, type ModelScope } from "./model-scope";
import { TenantScopeError, scopeArgs } from "./tenant-scope";

const clinicA: RequestContext = { requestId: "r1", clinicId: "clinic_a", branchId: "branch_a1", operator: false };
const clinicB: RequestContext = { requestId: "r2", clinicId: "clinic_b", branchId: "branch_b1", operator: false };
const operator: RequestContext = { requestId: "r3", operator: true };

// Synthetic models for the scopes no real model has yet, so every path is covered from day one.
const scopes: Record<string, ModelScope> = { Note: "clinic", Chair: "branch", Price: "platform", Entry: "clinic" };
const appendOnly = new Set(["Entry"]);
const scoped = (model: string, op: string, args: object | undefined, ctx?: RequestContext) =>
  scopeArgs(model, op, args as Record<string, unknown>, ctx, scopes, appendOnly);

describe("model registry", () => {
  it("lists every Prisma model, and nothing that isn't one", () => {
    expect(Object.keys(MODEL_SCOPE).sort()).toEqual(Object.values(Prisma.ModelName).sort());
  });

  it("refuses a model missing from the list", () => {
    expect(() => scopeArgs("Ghost", "findMany", {}, clinicA)).toThrow(TenantScopeError);
    expect(() => scopeArgs("Ghost", "findMany", {}, clinicA)).toThrow(/isn't listed in MODEL_SCOPE/);
  });

  it("keeps the database enums in step with the shared contract", () => {
    expect(Object.values($Enums.Role)).toEqual(Role.options);
    expect(Object.values($Enums.StaffRole)).toEqual(StaffRole.options);
    expect(Object.values($Enums.Tier)).toEqual(Tier.options);
    expect(Object.values($Enums.AccountStatus)).toEqual(AccountStatus.options);
    expect(Object.values($Enums.HeadingFont)).toEqual(HeadingFont.options);
    expect(Object.values($Enums.AgreementMethod)).toEqual(AgreementRecord.shape.method.options);
    expect(Object.values($Enums.AcknowledgedKind)).toEqual(Acknowledgement.shape.kind.options);
    expect(Object.values($Enums.AuditAction)).toEqual(AuditAction.options);
    expect(Object.values($Enums.MessageKind)).toEqual(MessageKind.options);
    expect(Object.values($Enums.MessageStatus)).toEqual(MessageStatus.options);
    expect(Object.values($Enums.PhotoType)).toEqual(PhotoType.options);
    expect(Object.values($Enums.PhotoStage)).toEqual(PhotoStage.options);
    expect(Object.values($Enums.DocumentType)).toEqual(DocumentType.options);
    expect(Object.values($Enums.MessageChannel)).toEqual(MessageChannel.options);
    expect(Object.values($Enums.Sex)).toEqual(Sex.options);
    expect(Object.values($Enums.ConsentScope)).toEqual(ConsentScope.options);
    expect(Object.values($Enums.PrivacyChoiceBy)).toEqual(PrivacyChoice.shape.by.options);
    expect(Object.values($Enums.VisitStatus)).toEqual(VisitStatus.options);
    expect(Object.values($Enums.PlanItemStatus)).toEqual(PlanItemStatus.options);
    expect(Object.values($Enums.AppointmentStatus)).toEqual(AppointmentStatus.options);
    expect(Object.values($Enums.AppointmentRequestStatus)).toEqual(AppointmentRequestStatus.options);
    expect(Object.values($Enums.TimeOfDay)).toEqual(TimeOfDay.options);
    expect(Object.values($Enums.DueKind)).toEqual(DueItem.shape.kind.options);
    expect(Object.values($Enums.ToothCondition)).toEqual(ToothCondition.options);
    expect(Object.values($Enums.PaymentMethod)).toEqual(PaymentMethod.options);
  });
});

describe("tenant scoping", () => {
  it("refuses a tenant query with no clinic in context, including the operator's", () => {
    for (const ctx of [undefined, operator]) {
      expect(() => scoped("Note", "findMany", {}, ctx)).toThrow(/needs a clinic/);
      expect(() => scoped("Note", "create", { data: {} }, ctx)).toThrow(/needs a clinic/);
    }
  });

  it.each(["findUnique", "findFirst", "findMany", "count", "aggregate", "groupBy", "updateMany", "deleteMany"])(
    "adds the clinic to the where of %s",
    (op) => {
      expect(scoped("Note", op, { where: { id: "n1" } }, clinicA).where).toEqual({ id: "n1", clinicId: "clinic_a" });
    },
  );

  it("never mixes two clinics: the same query is scoped to whoever asks", () => {
    expect(scoped("Note", "findMany", undefined, clinicA).where).toEqual({ clinicId: "clinic_a" });
    expect(scoped("Note", "findMany", undefined, clinicB).where).toEqual({ clinicId: "clinic_b" });
  });

  it("refuses a query that names another clinic, or filters the clinic itself", () => {
    expect(() => scoped("Note", "findMany", { where: { clinicId: "clinic_b" } }, clinicA)).toThrow(/doesn't match/);
    expect(() => scoped("Note", "findMany", { where: { clinicId: { in: ["clinic_a", "clinic_b"] } } }, clinicA)).toThrow(
      /doesn't match/,
    );
  });

  it("stamps created rows, one or many", () => {
    expect(scoped("Note", "create", { data: { text: "x" } }, clinicA).data).toEqual({ text: "x", clinicId: "clinic_a" });
    expect(scoped("Note", "createMany", { data: [{ text: "x" }, { text: "y" }] }, clinicA).data).toEqual([
      { text: "x", clinicId: "clinic_a" },
      { text: "y", clinicId: "clinic_a" },
    ]);
    expect(() => scoped("Note", "create", { data: { clinicId: "clinic_b" } }, clinicA)).toThrow(/doesn't match/);
  });

  it("refuses an update that moves a row to another clinic", () => {
    expect(() => scoped("Note", "update", { where: { id: "n1" }, data: { clinicId: "clinic_b" } }, clinicA)).toThrow(
      /can't be changed/,
    );
    expect(() =>
      scoped("Note", "upsert", { where: { id: "n1" }, create: {}, update: { clinicId: "clinic_b" } }, clinicA),
    ).toThrow(/can't be changed/);
  });

  it("scopes branch models by clinic and branch, and needs both", () => {
    expect(scoped("Chair", "findMany", {}, clinicA).where).toEqual({ clinicId: "clinic_a", branchId: "branch_a1" });
    expect(() => scoped("Chair", "findMany", {}, { ...clinicA, branchId: undefined })).toThrow(/needs a branch/);
  });

  it("leaves platform models alone, with or without a clinic", () => {
    expect(scoped("Price", "findMany", { where: { tier: "small" } }, operator)).toEqual({ where: { tier: "small" } });
  });

  it("refuses operations it doesn't know", () => {
    expect(() => scoped("Note", "findRaw", {}, clinicA)).toThrow(/isn't handled/);
  });
});

describe("append-only", () => {
  it.each(["update", "updateMany", "upsert", "delete", "deleteMany"])("refuses %s", (op) => {
    expect(() => scoped("Entry", op, { where: { id: "e1" }, data: {} }, clinicA)).toThrow(/append-only/);
  });

  it("still allows inserts and reads", () => {
    expect(() => scoped("Entry", "create", { data: {} }, clinicA)).not.toThrow();
    expect(() => scoped("Entry", "findMany", {}, clinicA)).not.toThrow();
  });

  it("lists the chart, and only the chart of B5's tables (a visit is completed in place)", () => {
    expect(APPEND_ONLY.has("ChartEntry")).toBe(true);
    expect(APPEND_ONLY.has("Visit")).toBe(false);
    expect(() => scopeArgs("ChartEntry", "update", { where: { id: "e1" }, data: { condition: "sound" } }, clinicA)).toThrow(/append-only/);
    expect(() => scopeArgs("ChartEntry", "deleteMany", { where: {} }, clinicA)).toThrow(/append-only/);
  });

  it("keeps B10's photos and documents append-only and its ledger deletable", () => {
    for (const model of ["ClinicalPhoto", "PatientDocument"] as const) {
      expect(() => scopeArgs(model, "update", { where: { id: "x" }, data: {} }, clinicA)).toThrow(/append-only/);
      expect(() => scopeArgs(model, "deleteMany", { where: {} }, clinicA)).toThrow(/append-only/);
    }
    expect(scopeArgs("StoredFile", "deleteMany", { where: { key: "k" } }, clinicA)?.where).toMatchObject({ clinicId: "clinic_a" });
  });

  it("leaves B6's tables editable: a draft note, a growth record and a plan item change in place", () => {
    for (const model of ["ClinicalNote", "GrowthRecord", "PlanItem"]) {
      expect(APPEND_ONLY.has(model)).toBe(false);
      expect(() => scopeArgs(model, "updateMany", { where: { id: "x" }, data: {} }, clinicA)).not.toThrow();
    }
  });

  it("keeps payments append-only, and lets a bill be voided in place (B8)", () => {
    expect(() => scopeArgs("Payment", "update", { where: { id: "p1" }, data: { amount: 0 } }, clinicA)).toThrow(/append-only/);
    expect(() => scopeArgs("Payment", "deleteMany", { where: {} }, clinicA)).toThrow(/append-only/);
    expect(() => scopeArgs("Invoice", "updateMany", { where: { id: "i1" }, data: {} }, clinicA)).not.toThrow();
  });
});
