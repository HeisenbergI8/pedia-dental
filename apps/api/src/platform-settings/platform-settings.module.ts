import { Module } from "@nestjs/common";
import { OutboxModule } from "../outbox/outbox.module";
import { StorageModule } from "../storage/storage.module";
import { PaymentQrController } from "./payment-qr.controller";
import { PlatformSettingsService } from "./platform-settings.service";
import { PricesController } from "./prices.controller";

/** B12: Primolar's price list and payment QR. A leaf: sign-ups and subscriptions import it for prices and the lock. */
@Module({
  imports: [OutboxModule, StorageModule],
  controllers: [PricesController, PaymentQrController],
  providers: [PlatformSettingsService],
  exports: [PlatformSettingsService],
})
export class PlatformSettingsModule {}
