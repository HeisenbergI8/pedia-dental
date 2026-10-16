import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { PlanService } from "./plan.service";

/** features/plan/mocks.ts. Rules in access-rules.ts: plan.view (owner: id) / plan.write. */
@Controller()
export class PlanController {
  constructor(private readonly plan: PlanService) {}

  @Get("patients/:id/plan")
  list(@Param("id") id: string) {
    return this.plan.list(id);
  }

  // 404 before 400 (the mock's order): parsed in the service. 201, as the mock.
  @Post("patients/:id/plan")
  add(@Param("id") id: string, @Body() body: unknown) {
    return this.plan.add(id, body);
  }

  // 404 and 409 before 400: parsed in the service. 200.
  @Patch("plan-items/:id")
  setStatus(@Param("id") id: string, @Body() body: unknown) {
    return this.plan.setStatus(id, body);
  }
}
