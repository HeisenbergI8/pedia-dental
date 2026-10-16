import { Controller, Get } from "@nestjs/common";
import { DueItemsService } from "./due-items.service";

/** features/recalls/mocks.ts. Rule in access-rules.ts: recalls.manage. */
@Controller()
export class RecallsController {
  constructor(private readonly dueItems: DueItemsService) {}

  @Get("due-items")
  list() { return this.dueItems.list(); }
}
