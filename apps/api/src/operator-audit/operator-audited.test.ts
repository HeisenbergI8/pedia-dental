import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { firstValueFrom, defer } from "rxjs";
import { describe, expect, it } from "vitest";
import type { AuditValues } from "./operator-audit.service";
import { OperatorAuditInterceptor, type OperatorAuditSpec } from "./operator-audited";

/** #28: the interceptor's values, its `before` read and the replay rule, without Nest or a database. */
function harness(spec: OperatorAuditSpec, opts: { replayed?: boolean; body?: unknown; answer?: unknown } = {}) {
  const written: { detail: string; targetId?: string; values?: AuditValues }[] = [];
  const order: string[] = [];
  const audit = { tryRecord: async (_a: string, _r: string, detail: string, targetId?: string, values?: AuditValues) => void written.push({ detail, targetId, values }) };
  const reflector = { get: () => spec };
  const req = { params: { id: "clinic_ngiti" }, body: opts.body ?? {} };
  const res = { getHeader: (h: string) => (h === "Idempotent-Replayed" && opts.replayed ? "true" : undefined) };
  const ctx = { getHandler: () => undefined, switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }) } as unknown as ExecutionContext;
  const next: CallHandler = { handle: () => defer(async () => (order.push("handler"), opts.answer ?? { ok: true })) };
  const interceptor = new OperatorAuditInterceptor(reflector as never, audit as never, {} as never);
  return { run: () => firstValueFrom(interceptor.intercept(ctx, next)), written, order };
}

describe("the operator audit interceptor (#28)", () => {
  it("writes the spec's values from the request and the answer, with the route's target", async () => {
    const h = harness({ action: "update", record: "Subscription", detail: "Plan changed", values: ({ req }) => ({ tier: (req.body as { tier: string }).tier }) }, { body: { tier: "mid" } });
    await h.run();
    expect(h.written).toEqual([{ detail: "Plan changed", targetId: "clinic_ngiti", values: { tier: "mid" } }]);
  });

  it("reads `before` ahead of the handler and hands it to `values`", async () => {
    let h: ReturnType<typeof harness>;
    const spec: OperatorAuditSpec = {
      action: "update", record: "Price list", detail: "Price list saved",
      before: async () => (h.order.push("before"), { small: 1 }),
      values: ({ before, answer }) => ({ monthlyFeeBefore: before as Record<string, number>, monthlyFeeAfter: answer as Record<string, number> }),
    };
    h = harness(spec, { answer: { small: 2 } });
    await h.run();
    expect(h.order).toEqual(["before", "handler"]);
    expect(h.written[0]!.values).toEqual({ monthlyFeeBefore: { small: 1 }, monthlyFeeAfter: { small: 2 } });
  });

  it("still writes the row when `values` or `before` fails, and writes none for a replayed key", async () => {
    const broken = harness({ action: "create", record: "Subscription payment", detail: "Month recorded as paid", before: async () => { throw new Error("x"); }, values: () => { throw new Error("y"); } });
    await broken.run();
    expect(broken.written).toEqual([{ detail: "Month recorded as paid", targetId: "clinic_ngiti", values: undefined }]);
    const replay = harness({ action: "create", record: "Subscription payment", detail: "Month recorded as paid" }, { replayed: true });
    await replay.run();
    expect(replay.written).toEqual([]);
  });
});
