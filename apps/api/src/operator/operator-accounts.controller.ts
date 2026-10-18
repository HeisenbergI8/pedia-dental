import { Body, Controller, Get, HttpCode, Param, Post, Put, Req } from "@nestjs/common";
import {
  ChangeTierInput, RecordUpfrontPaymentInput, TransferOwnershipInput,
  type AccountOverview, type CreateAccountResult, type OwnerCandidate, type SubscriptionView,
} from "@pedia/shared";
import type { Request } from "express";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { SignupsService } from "../signups/signups.service";
import { SubscriptionRecordsService } from "../subscription-records/subscription-records.service";
import { AccountOverviewService } from "./account-overview";
import { OperatorAccountsService } from "./operator-accounts.service";
import { OperatorAudited } from "../operator-audit/operator-audited";

/** Primolar's console: clinic accounts and their subscriptions (features/operator/mocks.ts), outside every clinic. */
@Controller("operator/accounts")
export class OperatorAccountsController {
  constructor(
    private readonly accounts: OperatorAccountsService,
    private readonly overviews: AccountOverviewService,
    private readonly subscriptions: SubscriptionRecordsService,
    private readonly signups: SignupsService,
  ) {}

  /** Every clinic account, by name (decision #25): counts only. */
  @Get()
  list(): Promise<AccountOverview[]> {
    return this.overviews.all();
  }

  /** Billing #16: multipart, as POST /signups (CreateAccountInput). 201 with the Owner's secrets, sent this once. */
  @Post()
  @OperatorAudited({ action: "create", record: "Clinic account", detail: "Account created", target: (b) => (b as CreateAccountResult).overview.account.id })
  async create(@Req() req: Request): Promise<CreateAccountResult> {
    const made = await this.signups.createDirect(req);
    return { overview: await this.accounts.overview(made.clinicId), temporaryPassword: made.temporaryPassword, pin: made.pin };
  }

  /** Billing #27, decision 12: an upgrade now, a downgrade on the next due date, refused over the smaller plan's limits. */
  @Put(":id/tier")
  @OperatorAudited({ action: "update", record: "Subscription", detail: "Plan changed" })
  async tier(@Param("id") id: string, @Body(new ZodValidationPipe(ChangeTierInput)) { tier }: ChangeTierInput): Promise<AccountOverview> {
    const clinicId = await this.accounts.exists(id);
    await this.subscriptions.changePlan(clinicId, tier);
    return this.accounts.overview(clinicId);
  }

  @Get(":id/subscription")
  async subscription(@Param("id") id: string): Promise<SubscriptionView> {
    return this.subscriptions.view(await this.accounts.exists(id));
  }

  /** Billing #29, S5: one month marked paid by hand. 201. */
  @Post(":id/subscription/payments")
  @OperatorAudited({ action: "create", record: "Subscription payment", detail: "Month recorded as paid" })
  async payment(@Param("id") id: string, @Body(new ZodValidationPipe(RecordUpfrontPaymentInput)) input: RecordUpfrontPaymentInput): Promise<SubscriptionView> {
    return this.subscriptions.recordByHand(await this.accounts.exists(id), input);
  }

  /** Billing #30, S7. */
  @Post(":id/subscription/cancel")
  @OperatorAudited({ action: "update", record: "Subscription", detail: "Subscription cancelled" })
  @HttpCode(200)
  async cancel(@Param("id") id: string): Promise<SubscriptionView> {
    return this.subscriptions.cancel(await this.accounts.exists(id));
  }

  @Post(":id/suspend")
  @OperatorAudited({ action: "update", record: "Clinic account", detail: "Account paused" })
  @HttpCode(200)
  suspend(@Param("id") id: string): Promise<AccountOverview> {
    return this.accounts.setStatus(id, "suspended");
  }

  @Post(":id/reactivate")
  @OperatorAudited({ action: "update", record: "Clinic account", detail: "Account reactivated" })
  @HttpCode(200)
  reactivate(@Param("id") id: string): Promise<AccountOverview> {
    return this.accounts.setStatus(id, "active");
  }

  @Get(":id/staff")
  staff(@Param("id") id: string): Promise<OwnerCandidate[]> {
    return this.accounts.ownerCandidates(id);
  }

  @Post(":id/owner")
  @OperatorAudited({ action: "update", record: "Clinic account", detail: "Ownership transferred" })
  @HttpCode(200)
  owner(@Param("id") id: string, @Body(new ZodValidationPipe(TransferOwnershipInput)) { staffId }: TransferOwnershipInput): Promise<AccountOverview> {
    return this.accounts.transferOwnership(id, staffId);
  }

  /** Multipart: `data` (SetBrandingInput) and the finished `logo`. */
  @Put(":id/branding")
  @OperatorAudited({ action: "update", record: "Clinic account", detail: "Branding delivered" })
  branding(@Param("id") id: string, @Req() req: Request): Promise<AccountOverview> {
    return this.accounts.setBranding(id, req);
  }
}
