import { Injectable } from "@nestjs/common";
import type { Tx } from "../prisma/transaction";

/** Makes the link an account text carries, in the sender's transaction; undefined when the link can't be used any more. */
export type LinkMinter = (tx: Tx, linkId: string) => Promise<string | undefined>;

/**
 * B11 E5: an account text's link is made when it is sent, never stored readable. The portal registers the one minter
 * in onModuleInit (as RecordOwners and OutboxHandlers), so this module stays a leaf: it never imports the portal.
 */
@Injectable()
export class AccountLinks {
  private minter?: LinkMinter;
  register(minter: LinkMinter): void {
    if (this.minter) throw new Error("An account-link minter is already registered.");
    this.minter = minter;
  }
  mint(tx: Tx, linkId: string): Promise<string | undefined> {
    if (!this.minter) throw new Error("No account-link minter is registered (PortalModule registers it).");
    return this.minter(tx, linkId);
  }
}
