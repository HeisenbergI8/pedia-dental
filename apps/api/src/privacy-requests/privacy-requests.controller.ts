import { Body, Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import {
  ClosePrivacyRequestInput, LogPrivacyRequestInput, PrivacyRequestQuery,
  type PrivacyRequest, type PrivacyRequestPage,
} from "@pedia/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PrivacyRequestsService } from "./privacy-requests.service";

/** B13c2b: the register (access-rules.ts: privacy.manage). Thin: parse, call, return. */
@Controller("privacy-requests")
export class PrivacyRequestsController {
  constructor(private readonly requests: PrivacyRequestsService) {}

  @Get()
  list(@Query(new ZodValidationPipe(PrivacyRequestQuery)) q: PrivacyRequestQuery): Promise<PrivacyRequestPage> {
    return this.requests.list(q);
  }

  @Post() // 201: a request is created
  log(@Body(new ZodValidationPipe(LogPrivacyRequestInput)) input: LogPrivacyRequestInput): Promise<PrivacyRequest> {
    return this.requests.log(input);
  }

  @Post(":id/close")
  @HttpCode(200) // an action, not a creation (CONVENTIONS trap)
  close(@Param("id") id: string, @Body(new ZodValidationPipe(ClosePrivacyRequestInput)) input: ClosePrivacyRequestInput): Promise<PrivacyRequest> {
    return this.requests.close(id, input);
  }
}
