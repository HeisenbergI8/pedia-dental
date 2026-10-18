import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { type Observable, mergeMap } from "rxjs";
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
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: OperatorAuditService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const spec = this.reflector.get<OperatorAuditSpec | undefined>(OPERATOR_AUDIT, ctx.getHandler());
    if (!spec) return next.handle();
    const req = ctx.switchToHttp().getRequest<Request>();
    // Only a handler that returned writes a row: a refusal throws past this, so nothing is recorded for it.
    return next.handle().pipe(
      mergeMap(async (body) => {
        const targetId = spec.target ? spec.target(body, req) : (req.params.id as string | undefined);
        await this.audit.tryRecord(spec.action, spec.record, spec.detail, targetId);
        return body;
      }),
    );
  }
}
