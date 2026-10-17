import { Body, Controller, Get, HttpCode, Param, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { identityOf } from "../auth/access.guard";
import { keyOf, type Answer } from "../idempotency/idempotency.service";
import { InvoicesService } from "./invoices.service";
import { PaymentsService } from "./payments.service";

/** features/billing/mocks.ts. Rules in access-rules.ts: billing.view / .collect / .adjust. The key is checked first (E2). */
@Controller()
export class BillingController {
  constructor(private readonly invoices: InvoicesService, private readonly payments: PaymentsService) {}

  @Get("patients/:id/invoices")
  invoicesOf(@Param("id") id: string) { return this.invoices.list(id); }

  @Post("patients/:id/invoices")
  async bill(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Param("id") id: string, @Body() body: unknown) {
    const key = keyOf(req.headers["idempotency-key"]);
    return answer(res, await this.invoices.create(id, key, body, identityOf(req)!));
  }

  @Post("invoices/:id/void")
  @HttpCode(200) // an action, not a creation (CONVENTIONS → Traps)
  void(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) { return this.invoices.void(id, body, identityOf(req)!); }

  @Get("patients/:id/payments")
  paymentsOf(@Param("id") id: string) { return this.payments.history(id); }

  @Post("invoices/:id/payments")
  async pay(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Param("id") id: string, @Body() body: unknown) {
    const key = keyOf(req.headers["idempotency-key"]);
    return answer(res, await this.payments.pay(id, key, body, identityOf(req)!));
  }

  @Post("patients/:id/deposits")
  async deposit(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Param("id") id: string, @Body() body: unknown) {
    const key = keyOf(req.headers["idempotency-key"]);
    return answer(res, await this.payments.deposit(id, key, body, identityOf(req)!));
  }

  @Post("invoices/:id/apply-credit")
  async applyCredit(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Param("id") id: string, @Body() body: unknown) {
    const key = keyOf(req.headers["idempotency-key"]);
    return answer(res, await this.payments.applyCredit(id, key, body, identityOf(req)!));
  }
}

/** Sends a kept answer's status and marks a replay (E2). The status is 201 on both. */
function answer<T>(res: Response, a: Answer<T>): T {
  res.status(a.status);
  if (a.replayed) res.setHeader("Idempotent-Replayed", "true");
  return a.body;
}
