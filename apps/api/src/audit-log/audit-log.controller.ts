import { Controller, Get, Query } from "@nestjs/common";
import { AuditLogPage, AuditLogQuery } from "@pedia/shared";
import { AuditService } from "../audit/audit.service";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PatientsService } from "../patients/patients.service";

/** B13c2a: the clinic's audit trail for the Owner and admins (access-rules.ts: audit.view). Reading it is logged. */
@Controller()
export class AuditLogController {
  constructor(private readonly audit: AuditService, private readonly patients: PatientsService) {}

  @Get("audit-log")
  async page(@Query(new ZodValidationPipe(AuditLogQuery)) query: AuditLogQuery): Promise<AuditLogPage> {
    const { rows, next } = await this.audit.page(query);
    const names = await this.patients.namesOf(rows.flatMap((r) => (r.patientId ? [r.patientId] : [])));
    await this.audit.record("view", "Audit log"); // the mock gate's entry; repeat-suppressed while paging
    return AuditLogPage.parse({ entries: rows.map((r) => ({ ...r, ...(r.patientId && names.has(r.patientId) && { patientName: names.get(r.patientId) }) })), ...(next && { next }) });
  }
}
