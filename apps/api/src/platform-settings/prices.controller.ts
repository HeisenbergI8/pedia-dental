import { Body, Controller, Get, Put } from "@nestjs/common";
import { PriceList } from "@pedia/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PlatformSettingsService } from "./platform-settings.service";
import { OperatorAudited } from "../operator-audit/operator-audited";

const monthlyFees = (list: PriceList) => Object.fromEntries(Object.entries(list.plans).map(([tier, p]) => [tier, p.monthlyFee]));

/** The price list (billing #22, #23): public for the Get started form's running total, the operator's to change. */
@Controller()
export class PricesController {
  constructor(private readonly settings: PlatformSettingsService) {}

  @Get("signups/prices")
  publicPrices(): Promise<PriceList> {
    return this.settings.prices();
  }

  @Get("operator/prices")
  prices(): Promise<PriceList> {
    return this.settings.prices();
  }

  @Put("operator/prices")
  @OperatorAudited({
    action: "update", record: "Price list", detail: "Price list saved",
    // #28: the old and new monthly fees, by tier (`before` reads the list the save replaces).
    before: (refs) => refs.get(PlatformSettingsService, { strict: false }).prices(),
    values: ({ before, answer }) => ({ ...(before ? { monthlyFeeBefore: monthlyFees(before as PriceList) } : {}), monthlyFeeAfter: monthlyFees(answer as PriceList) }),
  })
  save(@Body(new ZodValidationPipe(PriceList)) list: PriceList): Promise<PriceList> {
    return this.settings.savePrices(list);
  }
}
