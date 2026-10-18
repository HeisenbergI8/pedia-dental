import { type CallHandler, type ExecutionContext, Injectable, Logger, type NestInterceptor, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { type Observable, mergeMap } from "rxjs";
import { errorFingerprint } from "../common/process-errors";
import { MetricsService } from "../metrics/metrics.service";
import { OperatorAuditService } from "./operator-audit.service";

export const OPERATOR_AUDIT = "pedia:operator-audit";
export type OperatorAuditSpec = {
  action: "create" | "update";
  record: string;
  detail: string;
  /** Where the target id is: the route's :id by default; a creation reads it from the answer. */
  target?: (body: unknown, req: Request) => string | undefined;
};

/** Every operator route that changes something carries this (test/operator-audit-coverage.test.ts enforces it). */
export const OperatorAudited = (spec: OperatorAuditSpec) => SetMetadata(OPERATOR_AUDIT, spec);

/**
 * Decision E9: the row is written after the handler succeeds, not in its transaction (B12's five services keep their
 * lock orders). A failed insert never fails the response: the change is already committed.
 */
@Injectable()
export class OperatorAuditInterceptor implements NestInterceptor {
  private readonly log = new Logger(OperatorAuditInterceptor.name);
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: OperatorAuditService,
    private readonly metrics: MetricsService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const spec = this.reflector.get<OperatorAuditSpec | undefined>(OPERATOR_AUDIT, ctx.getHandler());
    if (!spec) return next.handle();
    const req = ctx.switchToHttp().getRequest<Request>();
    // Only a handler that returned writes a row: a refusal throws past this, so nothing is recorded for it.
    return next.handle().pipe(
      mergeMap(async (body) => {
        const targetId = spec.target ? spec.target(body, req) : (req.params.id as string | undefined);
        try {
          await this.audit.record(spec.action, spec.record, spec.detail, targetId);
        } catch (error) {
          this.metrics.countUnhandled();
          this.log.error({ fingerprint: errorFingerprint(error) }, `Operator audit row not written (${spec.detail})`);
        }
        return body;
      }),
    );
  }
}
