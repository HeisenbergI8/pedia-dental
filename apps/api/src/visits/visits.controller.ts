import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { VisitsService } from "./visits.service";

/** features/visits/mocks.ts. Rules in access-rules.ts: clinical.view / clinical.write (B2b copied them). */
@Controller()
export class VisitsController {
  constructor(private readonly visits: VisitsService) {}

  @Get("patients/:id/visits")
  list(@Param("id") id: string) {
    return this.visits.list(id);
  }

  // 404 before 400 (the mock's order): the body is parsed in the service, after the patient is found.
  @Post("patients/:id/visits")
  start(@Param("id") id: string, @Body() body: unknown) {
    return this.visits.start(id, body); // 201, as the mock
  }

  @Post("visits/:id/complete")
  @HttpCode(200) // an action, not a creation (CONVENTIONS → Traps)
  complete(@Param("id") id: string) {
    return this.visits.complete(id);
  }
}
