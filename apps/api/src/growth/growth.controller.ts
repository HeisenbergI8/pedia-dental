import { Body, Controller, Get, Param, Put } from "@nestjs/common";
import { GrowthService } from "./growth.service";

/** features/growth/mocks.ts. Rules in access-rules.ts: clinical.view / clinical.write (owner: record). */
@Controller()
export class GrowthController {
  constructor(private readonly growth: GrowthService) {}

  @Get("patients/:id/growth")
  list(@Param("id") id: string) {
    return this.growth.list(id);
  }

  // 404 and 409 before 400 (the mock's order): the body is parsed in the service, after the visit's checks. 200, as the mock.
  @Put("visits/:id/growth")
  save(@Param("id") id: string, @Body() body: unknown) {
    return this.growth.save(id, body);
  }
}
