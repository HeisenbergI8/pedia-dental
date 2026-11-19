import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor, SetMetadata } from "@nestjs/common";
import { ModuleRef, Reflector } from "@nestjs/core";
import type { Request, Response } from "express";
import { type Observable, from, mergeMap } from "rxjs";
import { OperatorAuditService, type AuditValues } from "./operator-audit.service";

/** What `values` reads: the request body, the handler's answer, and what `before` read ahead of the change. */
export type AuditValuesInput = { req: Request; answer: unknown; before: unknown };

export const OPERATOR_AUDIT = "pedia:operator-audit";
export type OperatorAuditSpec = {
  action: "create" | "update";
  record: string;
  detail: string;
  /** Where the target id is: the route's :id by default; a creation reads it from the answer. */
  target?: (body: unknown, req: Request) => string | undefined;
  /**
   * #28: a small record of what changed (the target plan, a payment's method and amount, a reason). Never patient data:
   * operator routes see none. Undefined writes no values.
   */
  values?: (input: AuditValuesInput) => AuditValues | undefined;
  /** #28: reads what the change will replace, before the handler runs (the price list's old fees). */
  before?: (refs: ModuleRef, req: Request) => Promise<unknown>;
};

/** Every operator route that changes something carries this (test/operator-audit-coverage.test.ts enforces it). */
export const OperatorAudited = (spec: OperatorAuditSpec) => SetMetadata(OPERATOR_AUDIT, spec);

/**
 * Decision E9: the row is written after the handler succeeds, not in its transaction (B12's five services keep their
 * lock orders). It is awaited before the answer goes out; a failed insert is logged and counted, never failing the
 * response: the change is already committed.
 */
@Injectable()
export class OperatorAuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: OperatorAuditService,
    private readonly refs: ModuleRef,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const spec = this.reflector.get<OperatorAuditSpec | undefined>(OPERATOR_AUDIT, ctx.getHandler());
    if (!spec) return next.handle();
    const req = ctx.switchToHttp().getRequest<Request>();
    // `before` is best effort: a failed read loses only the old values, never the change or its row.
    const before = spec.before ? spec.before(this.refs, req).catch(() => undefined) : Promise.resolve(undefined);
    // Only a handler that returned writes a row: a refusal throws past this, so nothing is recorded for it.
    return from(before).pipe(
      mergeMap((was) =>
        next.handle().pipe(
          mergeMap(async (body) => {
            // #18: a replayed Idempotency-Key changed nothing this time, so it writes no second row.
            if (ctx.switchToHttp().getResponse<Response>().getHeader("Idempotent-Replayed")) return body;
            const targetId = spec.target ? spec.target(body, req) : (req.params.id as string | undefined);
            const values = auditValues(spec, { req, answer: body, before: was });
            await this.audit.tryRecord(spec.action, spec.record, spec.detail, targetId, values);
            return body;
          }),
        ),
      ),
    );
  }
}

/** The spec's values, or none when reading them throws (an answer of an unexpected shape never loses the row). */
function auditValues(spec: OperatorAuditSpec, input: AuditValuesInput): AuditValues | undefined {
  try {
    return spec.values?.(input);
  } catch {
    return undefined;
  }
}
