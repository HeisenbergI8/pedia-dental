import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, Req } from "@nestjs/common";
import { BookAppointmentInput } from "@pedia/shared";
import type { Request } from "express";
import { identityOf } from "../auth/access.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AppointmentsService } from "./appointments.service";

/** features/appointments/mocks.ts. Rules in access-rules.ts: appointments.view / .manage (and .confirm on status). */
@Controller()
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get("appointments")
  calendar(@Query("from") from?: string, @Query("to") to?: string) { return this.appointments.calendar(from, to); }

  @Get("patients/:id/appointments")
  forPatient(@Param("id") id: string) { return this.appointments.forPatient(id); }

  @Post("appointments") // 201, as the mock
  book(@Body(new ZodValidationPipe(BookAppointmentInput)) body: BookAppointmentInput) { return this.appointments.book(body); }

  @Put("appointments/:id")
  move(@Param("id") id: string, @Body() body: unknown) { return this.appointments.move(id, body); }

  @Post("appointments/:id/status")
  @HttpCode(200) // an action, not a creation (CONVENTIONS → Traps)
  setStatus(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) {
    return this.appointments.setStatus(id, body, identityOf(req)!.user.roles);
  }
}
