import { Controller, HttpCode, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { identityOf } from "../auth/access.guard";
import { RecordsCopyService } from "./records-copy.service";

/** B13c2a: the copy of records (access-rules.ts: patients.view, the parent's own child, allowed while paused). */
@Controller()
export class RecordsCopyController {
  constructor(private readonly copies: RecordsCopyService) {}

  /** No body. 200, not Nest's 201: nothing is created (the mock answers 200). */
  @Post("patients/:id/exports")
  @HttpCode(200)
  copy(@Req() req: Request, @Param("id") id: string) {
    return this.copies.copy(identityOf(req)!, id);
  }
}
