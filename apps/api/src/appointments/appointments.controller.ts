import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, Req } from "@nestjs/common";
import { BookAppointmentInput } from "@pedia/shared";
import type { Request } from "express";
import { identityOf } from "../auth/access.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AppointmentRequestsService } from "./appointment-requests.service";
import { AppointmentsService } from "./appointments.service";

/** features/appointments/mocks.ts. Rules in access-rules.ts: appointments.view / .manage (and .confirm on status). */
@Controller()
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService, private readonly requests: AppointmentRequestsService) {}

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

  @Get("appointment-requests")
  requestInbox(@Query("status") status?: string) { return this.requests.list(status); }

  @Get("patients/:id/appointment-requests")
  requestsFor(@Param("id") id: string) { return this.requests.forPatient(id); }

  @Post("patients/:id/appointment-requests") // 201; the body is checked after the 404 (mocks.ts:152–154)
  ask(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) { return this.requests.create(id, body, identityOf(req)?.guardianId); }

  @Post("appointment-requests/:id/handled")
  @HttpCode(200)
  handled(@Param("id") id: string) { return this.requests.handled(id); }
}
