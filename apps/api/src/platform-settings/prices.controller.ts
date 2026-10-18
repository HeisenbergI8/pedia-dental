import { Body, Controller, Get, Put } from "@nestjs/common";
import { PriceList } from "@pedia/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PlatformSettingsService } from "./platform-settings.service";

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
  save(@Body(new ZodValidationPipe(PriceList)) list: PriceList): Promise<PriceList> {
    return this.settings.savePrices(list);
  }
}
