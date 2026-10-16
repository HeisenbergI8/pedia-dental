import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { CreateChartBatchInput, CreateChartEntryInput } from "@pedia/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ChartService } from "./chart.service";

/** features/chart/mocks.ts. The body is checked first (400), then the visit (404/409): the mock's order. 201 on writes, as the mock. */
@Controller("patients/:id/chart")
export class ChartController {
  constructor(private readonly chart: ChartService) {}

  @Get()
  entries(@Param("id") id: string) {
    return this.chart.entries(id);
  }

  @Post()
  record(@Param("id") id: string, @Body(new ZodValidationPipe(CreateChartEntryInput)) input: CreateChartEntryInput) {
    return this.chart.record(id, input);
  }

  @Post("batch")
  recordBatch(@Param("id") id: string, @Body(new ZodValidationPipe(CreateChartBatchInput)) input: CreateChartBatchInput) {
    return this.chart.recordBatch(id, input);
  }
}
